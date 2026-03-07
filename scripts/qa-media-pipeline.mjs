import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { PrismaClient, MediaAssetScope } from '@prisma/client';

const BASE_URL = process.env.MEDIA_QA_BASE_URL || 'http://127.0.0.1:3000';
const QA_SLUG = 'qa-media-pipeline';
const QA_USER = 'qa_media';
const QA_PIN = '170017';
const CHUNK_SIZE = 512 * 1024;

const prisma = new PrismaClient();
let cookieHeader = '';

function nowMs() {
  return Date.now();
}

async function readError(res, fallback) {
  try {
    const payload = await res.json();
    return payload?.error ?? fallback;
  } catch {
    return fallback;
  }
}

async function authedFetch(url, init = {}) {
  const headers = new Headers(init.headers || {});
  if (cookieHeader) {
    headers.set('cookie', cookieHeader);
  }
  return fetch(url, { ...init, headers });
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: QA_USER, pin: QA_PIN })
  });
  if (!res.ok) {
    throw new Error(`Login failed (${res.status})`);
  }
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) {
    throw new Error('Login missing session cookie');
  }
  cookieHeader = setCookie.split(';')[0];
}

async function initUpload({ scope, scopeRef, filePath, mimeType, description = null }) {
  const stat = await fs.stat(filePath);
  const name = path.basename(filePath);
  const res = await authedFetch(`${BASE_URL}/api/media/uploads/init`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      scope,
      scopeRef,
      filename: name,
      mimeType,
      fileSizeBytes: stat.size,
      title: name,
      description,
      chunkSizeBytes: CHUNK_SIZE
    })
  });

  if (!res.ok) {
    return {
      ok: false,
      stage: 'init',
      status: res.status,
      error: await readError(res, 'init failed')
    };
  }

  const payload = await res.json();
  return {
    ok: true,
    session: payload.session,
    fileSizeBytes: stat.size,
    filename: name
  };
}

async function pollAsset(assetId, { timeoutMs = 20 * 60 * 1000, intervalMs = 1200 } = {}) {
  const states = [];
  const started = nowMs();

  while (nowMs() - started < timeoutMs) {
    await wait(intervalMs);
    const res = await authedFetch(`${BASE_URL}/api/media/uploads/status?assetId=${encodeURIComponent(assetId)}`, {
      method: 'GET',
      cache: 'no-store'
    });

    if (res.status === 404) {
      continue;
    }
    if (!res.ok) {
      return {
        done: true,
        status: 'FAILED',
        states,
        error: await readError(res, 'status failed'),
        asset: null,
        timedOut: false
      };
    }

    const payload = await res.json();
    const asset = payload.asset;
    if (!asset) {
      continue;
    }

    if (states.at(-1) !== asset.status) {
      states.push(asset.status);
    }

    if (asset.status === 'READY' || asset.status === 'FAILED') {
      return {
        done: true,
        status: asset.status,
        states,
        error: asset.errorMessage ?? null,
        asset,
        timedOut: false
      };
    }
  }

  return {
    done: false,
    status: 'TIMEOUT',
    states,
    error: 'poll timeout',
    asset: null,
    timedOut: true
  };
}

async function uploadSingle({ filePath, scope, scopeRef, mimeType, description = null }) {
  const started = nowMs();
  const init = await initUpload({ scope, scopeRef, filePath, mimeType, description });
  if (!init.ok) {
    return {
      filename: path.basename(filePath),
      filePath,
      scope,
      ok: false,
      stage: 'init',
      error: init.error,
      httpStatus: init.status,
      durationMs: nowMs() - started,
      chunkProgressOk: false,
      states: [],
      assetId: null,
      asset: null
    };
  }

  const bytes = await fs.readFile(filePath);
  const { session } = init;
  const totalChunks = session.totalChunks;
  const chunkProgressSequence = [];
  let previousReceived = 0;

  for (let i = 0; i < totalChunks; i += 1) {
    const start = i * session.chunkSizeBytes;
    const end = Math.min(start + session.chunkSizeBytes, bytes.length);
    const slice = bytes.subarray(start, end);

    const form = new FormData();
    form.set('sessionId', session.sessionId);
    form.set('chunkIndex', String(i));
    form.set('totalChunks', String(totalChunks));
    form.set('chunk', new Blob([slice]), `${path.basename(filePath)}.part`);

    const chunkRes = await authedFetch(`${BASE_URL}/api/media/uploads/chunk`, {
      method: 'POST',
      body: form
    });
    if (!chunkRes.ok) {
      return {
        filename: path.basename(filePath),
        filePath,
        scope,
        ok: false,
        stage: 'chunk',
        error: await readError(chunkRes, 'chunk failed'),
        httpStatus: chunkRes.status,
        durationMs: nowMs() - started,
        chunkProgressOk: false,
        states: [],
        assetId: null,
        asset: null
      };
    }

    const chunkPayload = await chunkRes.json();
    const received = chunkPayload?.progress?.receivedChunks ?? 0;
    chunkProgressSequence.push(received);
    if (received < previousReceived) {
      previousReceived = received;
    } else {
      previousReceived = received;
    }
  }

  const finalizeRes = await authedFetch(`${BASE_URL}/api/media/uploads/finalize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: session.sessionId })
  });

  if (!finalizeRes.ok) {
    return {
      filename: path.basename(filePath),
      filePath,
      scope,
      ok: false,
      stage: 'finalize',
      error: await readError(finalizeRes, 'finalize failed'),
      httpStatus: finalizeRes.status,
      durationMs: nowMs() - started,
      chunkProgressOk: false,
      states: [],
      assetId: null,
      asset: null
    };
  }

  const finalizePayload = await finalizeRes.json();
  const assetId = finalizePayload.assetId;
  const poll = await pollAsset(assetId);

  const chunkProgressOk =
    chunkProgressSequence.length === totalChunks &&
    chunkProgressSequence.every((value, index) => Number.isInteger(value) && value >= 1 && value <= totalChunks && value >= (index === 0 ? 1 : chunkProgressSequence[index - 1]));

  return {
    filename: path.basename(filePath),
    filePath,
    scope,
    ok: poll.status === 'READY',
    stage: poll.status === 'READY' ? 'done' : 'processing',
    error: poll.error,
    httpStatus: 200,
    durationMs: nowMs() - started,
    chunkProgressOk,
    states: poll.states,
    assetId,
    asset: poll.asset,
    finalStatus: poll.status,
    timedOut: poll.timedOut ?? false
  };
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;

  async function next() {
    const current = index;
    if (current >= items.length) {
      return;
    }
    index += 1;
    results[current] = await worker(items[current], current);
    await next();
  }

  const workers = [];
  for (let i = 0; i < Math.min(limit, items.length); i += 1) {
    workers.push(next());
  }
  await Promise.all(workers);
  return results;
}

function summarizeUploads(results) {
  const ready = results.filter((r) => r?.finalStatus === 'READY').length;
  const failed = results.filter((r) => r?.finalStatus === 'FAILED' || (!r?.ok && r?.stage !== 'done')).length;
  const timedOut = results.filter((r) => r?.timedOut).length;
  const chunkProgressOk = results.every((r) => r?.chunkProgressOk !== false || r?.stage === 'init');
  return { ready, failed, timedOut, total: results.length, chunkProgressOk };
}

async function listFiles(dir) {
  const names = await fs.readdir(dir);
  return names.sort().map((name) => path.join(dir, name));
}

function mimeForPath(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  return 'application/octet-stream';
}

async function validateDerivatives(assetIds) {
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: assetIds }, deletedAt: null },
    select: {
      id: true,
      fileType: true,
      status: true,
      storageUrl: true,
      thumbnailUrl: true,
      cardUrl: true,
      mediumUrl: true,
      largeUrl: true,
      modalUrl: true,
      fullUrl: true,
      previewUrl: true,
      posterUrl: true,
      playbackUrl: true,
      errorMessage: true,
      processedAt: true,
      storageKey: true,
      thumbnailKey: true,
      cardKey: true,
      previewKey: true,
      posterKey: true,
      playbackKey: true
    }
  });

  const checks = assets.map((asset) => {
    const derivativeMissing =
      asset.fileType === 'VIDEO'
        ? !asset.posterUrl || !asset.playbackUrl || !asset.previewUrl
        : !asset.thumbnailUrl || !asset.cardUrl;

    const usesOriginalInCardLike =
      (asset.cardUrl && /\/original\./i.test(asset.cardUrl)) ||
      (asset.thumbnailUrl && /\/original\./i.test(asset.thumbnailUrl)) ||
      (asset.previewUrl && /\/original\./i.test(asset.previewUrl));

    return {
      id: asset.id,
      fileType: asset.fileType,
      status: asset.status,
      derivativeMissing,
      usesOriginalInCardLike,
      errorMessage: asset.errorMessage
    };
  });

  return { assets, checks };
}

async function fetchTourPageMetrics(slug) {
  const start = nowMs();
  const res = await authedFetch(`${BASE_URL}/tours/${slug}`, { method: 'GET' });
  const html = await res.text();
  const durationMs = nowMs() - start;
  const originalAssetUrlMatches = html.match(/\/uploads\/media\/assets\/[^"']+\/original\.[a-z0-9]+/gi) ?? [];
  const originalSrcAttributeMatches =
    html.match(/\b(?:src|poster)=["'][^"']*\/uploads\/media\/assets\/[^"']+\/original\.[a-z0-9]+["']/gi) ?? [];
  return {
    status: res.status,
    durationMs,
    bytes: Buffer.byteLength(html),
    containsOriginalAssetUrl: originalAssetUrlMatches.length > 0,
    originalAssetUrlMatchCount: originalAssetUrlMatches.length,
    containsOriginalSrcAttribute: originalSrcAttributeMatches.length > 0,
    originalSrcAttributeMatchCount: originalSrcAttributeMatches.length,
    tinyVideoHasDirectPlaybackSrc: /trip-media-gallery__tiny-preview[^>]*src="[^"]*playback\.mp4/i.test(html),
    hasPosterAttribute: /trip-media-gallery__tiny-preview[\s\S]*?poster="[^"]+"/i.test(html)
  };
}

async function verifyDeleteCleanup(assetId) {
  const before = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      storageKey: true,
      thumbnailKey: true,
      cardKey: true,
      previewKey: true,
      posterKey: true,
      playbackKey: true,
      uploadSession: { select: { id: true } }
    }
  });

  const res = await authedFetch(`${BASE_URL}/api/media/assets/${assetId}`, { method: 'DELETE' });
  const deletedOk = res.ok;
  const after = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    select: { deletedAt: true, status: true }
  });

  const keys = [before?.storageKey, before?.thumbnailKey, before?.cardKey, before?.previewKey, before?.posterKey, before?.playbackKey].filter(Boolean);
  const fileChecks = [];
  for (const key of keys) {
    const abs = path.join(process.cwd(), 'public/uploads/media', key);
    try {
      await fs.access(abs);
      fileChecks.push({ key, exists: true });
    } catch {
      fileChecks.push({ key, exists: false });
    }
  }

  return {
    deletedOk,
    apiStatus: res.status,
    dbDeletedAtSet: Boolean(after?.deletedAt),
    fileChecks,
    sessionId: before?.uploadSession?.id ?? null
  };
}

async function reprocessAsset(assetId) {
  const before = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    select: { processedAt: true, status: true }
  });
  const res = await authedFetch(`${BASE_URL}/api/media/assets/${assetId}/reprocess`, { method: 'POST' });
  const triggerOk = res.ok;
  const poll = await pollAsset(assetId, { timeoutMs: 15 * 60 * 1000, intervalMs: 1500 });
  const after = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    select: { processedAt: true, status: true, errorMessage: true }
  });

  return {
    triggerOk,
    triggerStatus: res.status,
    beforeStatus: before?.status ?? null,
    afterStatus: after?.status ?? null,
    beforeProcessedAt: before?.processedAt?.getTime() ?? null,
    afterProcessedAt: after?.processedAt?.getTime() ?? null,
    pollStatus: poll.status,
    pollStates: poll.states,
    errorMessage: after?.errorMessage ?? null
  };
}

async function main() {
  await login();

  const report = {
    scenarios: {},
    checks: {},
    timings: {},
    assets: {}
  };

  const batchFiles = await listFiles('/tmp/mn_media_qa/batch200');
  const batchStart = nowMs();
  const batchResults = await runPool(batchFiles, 4, async (filePath) =>
    uploadSingle({ filePath, scope: 'TOUR', scopeRef: QA_SLUG, mimeType: mimeForPath(filePath) })
  );
  report.timings.batch200Ms = nowMs() - batchStart;
  report.scenarios.batch200 = summarizeUploads(batchResults);

  const mixedFiles = await listFiles('/tmp/mn_media_qa/mixed');
  const mixedResults = [];
  for (const filePath of mixedFiles) {
    mixedResults.push(await uploadSingle({ filePath, scope: 'TOUR', scopeRef: QA_SLUG, mimeType: mimeForPath(filePath) }));
  }
  report.scenarios.mixedFolder = summarizeUploads(mixedResults);

  const oversized = await uploadSingle({
    filePath: '/tmp/mn_media_qa/special/oversized.jpg',
    scope: 'TOUR',
    scopeRef: QA_SLUG,
    mimeType: 'image/jpeg'
  });
  report.scenarios.oversizedImage = {
    expectedRejectedAtInit: oversized.stage === 'init' && /exceeds limit/i.test(oversized.error ?? ''),
    stage: oversized.stage,
    status: oversized.httpStatus,
    error: oversized.error
  };

  const largeVideo = await uploadSingle({
    filePath: '/tmp/mn_media_qa/special/large_video.mp4',
    scope: 'TOUR',
    scopeRef: QA_SLUG,
    mimeType: 'video/mp4'
  });
  report.scenarios.largeVideo = {
    status: largeVideo.finalStatus,
    assetId: largeVideo.assetId,
    states: largeVideo.states,
    durationMs: largeVideo.durationMs
  };

  const corrupt = await uploadSingle({
    filePath: '/tmp/mn_media_qa/special/corrupt.jpg',
    scope: 'TOUR',
    scopeRef: QA_SLUG,
    mimeType: 'image/jpeg'
  });
  report.scenarios.corruptMedia = {
    status: corrupt.finalStatus,
    assetId: corrupt.assetId,
    states: corrupt.states,
    error: corrupt.error
  };

  const memeFiles = batchFiles.slice(0, 3);
  const memeResults = [];
  for (const filePath of memeFiles) {
    memeResults.push(
      await uploadSingle({ filePath, scope: 'MEME', scopeRef: 'library', mimeType: mimeForPath(filePath), description: 'qa meme' })
    );
  }
  report.scenarios.memes = summarizeUploads(memeResults);

  const readyAssetIds = [...batchResults, ...mixedResults, largeVideo, ...memeResults]
    .filter((item) => item && item.finalStatus === 'READY' && item.assetId)
    .map((item) => item.assetId);

  const { assets, checks } = await validateDerivatives(readyAssetIds);
  report.checks.derivativeValidation = {
    totalReadyChecked: checks.length,
    derivativeMissingCount: checks.filter((c) => c.derivativeMissing).length,
    originalFallbackCount: checks.filter((c) => c.usesOriginalInCardLike).length
  };

  const tourPage = await fetchTourPageMetrics(QA_SLUG);
  report.checks.tourPage = tourPage;

  const memeApiRes = await authedFetch(`${BASE_URL}/api/library/memes`, { method: 'GET' });
  const memeApi = await memeApiRes.json();
  const uploadedMemeIds = memeResults.filter((r) => r.assetId).map((r) => r.assetId);
  const memeHits = (memeApi?.memes ?? []).filter((m) => uploadedMemeIds.includes(m.id));
  const memeOriginalFallbackCount = memeHits.filter((m) => /\/original\./i.test(m.imageDataUrl)).length;
  report.checks.memeApi = {
    status: memeApiRes.status,
    uploadedFound: memeHits.length,
    originalFallbackCount: memeOriginalFallbackCount
  };

  const successfulAsset = mixedResults.find((r) => r.finalStatus === 'READY' && r.assetId)?.assetId || readyAssetIds[0] || null;
  const failedAsset = corrupt.assetId || null;

  if (successfulAsset) {
    report.scenarios.reprocessSuccessful = await reprocessAsset(successfulAsset);
    report.scenarios.deleteSuccessful = await verifyDeleteCleanup(successfulAsset);
  }

  if (failedAsset) {
    report.scenarios.reprocessFailed = await reprocessAsset(failedAsset);
    report.scenarios.deleteFailed = await verifyDeleteCleanup(failedAsset);
  }

  const stuckAssets = await prisma.mediaAsset.count({
    where: {
      scope: MediaAssetScope.TOUR,
      scopeRef: QA_SLUG,
      deletedAt: null,
      status: { in: ['UPLOADING', 'PROCESSING'] }
    }
  });

  report.checks.stuckStates = { stuckAssets };

  // collect total QA tour assets
  const qaTourCounts = await prisma.mediaAsset.groupBy({
    by: ['status'],
    where: {
      scope: MediaAssetScope.TOUR,
      scopeRef: QA_SLUG,
      deletedAt: null
    },
    _count: { _all: true }
  });
  report.assets.qaTourCounts = qaTourCounts;

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
