import fs from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import {
  createChatMemePayload,
  encodeChatMemeMessage,
  extractLinkCandidatesFromMessage,
  parseChatMemeMessage
} from "@/lib/chatMemeMessage";
import { findLibraryMemeByLink, listLibraryMemesForViewer, normalizeInternalMemeLink } from "@/lib/libraryMemes";

const QA_USERNAME = process.env.MEDIA_QA_USERNAME ?? "qa_media";

type QaReport = {
  checks: Record<string, unknown>;
  errors: string[];
  passed: boolean;
};

function fail(message: string): never {
  throw new Error(message);
}

async function run(): Promise<void> {
  const report: QaReport = {
    checks: {},
    errors: [],
    passed: false
  };

  try {
    const user = await prisma.user.findUnique({
      where: { username: QA_USERNAME },
      select: { id: true, role: true }
    });

    if (!user) {
      fail(`Unable to resolve QA user: ${QA_USERNAME}`);
    }

    const memes = await listLibraryMemesForViewer({
      id: user.id,
      role: user.role
    });
    report.checks.memeCount = memes.length;
    if (memes.length === 0) {
      fail("No memes returned from shared library meme source.");
    }

    const sampleMeme = memes.find((item) => item.copyUrl.startsWith("/uploads/media/assets/")) ?? memes[0];
    report.checks.sampleMeme = {
      id: sampleMeme.id,
      source: sampleMeme.source,
      copyUrl: sampleMeme.copyUrl
    };

    const validMessage = `drop ${sampleMeme.copyUrl} into chat`;
    const validCandidates = extractLinkCandidatesFromMessage(validMessage);
    if (validCandidates.length === 0) {
      fail("No URL candidates extracted from valid meme-link message.");
    }
    const internalCandidates = validCandidates.filter((candidate) => normalizeInternalMemeLink(candidate) !== null);
    if (internalCandidates.length === 0) {
      fail("Valid meme-link candidate was not recognized as internal.");
    }

    const matchedMeme = findLibraryMemeByLink(memes, internalCandidates[0]);
    if (!matchedMeme) {
      fail("Valid meme-link candidate did not resolve against library meme archive.");
    }
    if (matchedMeme.id !== sampleMeme.id) {
      fail(`Resolved meme mismatch (expected ${sampleMeme.id}, got ${matchedMeme.id}).`);
    }

    const encodedFromLink = encodeChatMemeMessage(createChatMemePayload(matchedMeme, internalCandidates[0]));
    const parsedFromLink = parseChatMemeMessage(encodedFromLink);
    if (parsedFromLink.kind !== "meme") {
      fail("Encoded meme-link message did not parse back to meme kind.");
    }
    if (parsedFromLink.payload.id !== sampleMeme.id) {
      fail("Parsed meme payload id mismatch for valid-link flow.");
    }

    const invalidMessage = "qa invalid link https://example.com/not-a-meme";
    const invalidCandidates = extractLinkCandidatesFromMessage(invalidMessage);
    const invalidResolved = invalidCandidates
      .filter((candidate) => normalizeInternalMemeLink(candidate) !== null)
      .map((candidate) => findLibraryMemeByLink(memes, candidate))
      .find((item) => item !== null);
    if (invalidResolved) {
      fail("Invalid external link unexpectedly resolved as a meme.");
    }

    const addCultureEncoded = encodeChatMemeMessage(createChatMemePayload(sampleMeme, sampleMeme.copyUrl));
    const addCultureParsed = parseChatMemeMessage(addCultureEncoded);
    if (addCultureParsed.kind !== "meme") {
      fail("Add Culture encoded payload did not parse as meme kind.");
    }
    if (addCultureParsed.payload.id !== sampleMeme.id || addCultureParsed.payload.source !== sampleMeme.source) {
      fail("Add Culture payload parse mismatch.");
    }

    const [composerSource, homePageSource] = await Promise.all([
      fs.readFile("components/LiveChatComposer.tsx", "utf8"),
      fs.readFile("app/(protected)/home/page.tsx", "utf8")
    ]);

    const composerChecks = {
      hasAddCultureButton: composerSource.includes("Add Culture"),
      hasMemeIntentSubmit: /name=\"intent\"\s+value=\"meme\"/.test(composerSource),
      hasSelectedMemeHiddenFields:
        composerSource.includes('name="selectedMemeId"') &&
        composerSource.includes('name="selectedMemeSource"') &&
        composerSource.includes('name="selectedMemeLink"')
    };
    if (!composerChecks.hasAddCultureButton || !composerChecks.hasMemeIntentSubmit || !composerChecks.hasSelectedMemeHiddenFields) {
      fail("LiveChatComposer is missing required Add Culture controls/fields.");
    }

    const homeChecks = {
      hasMemeIntentBranch: homePageSource.includes('intent === "meme"'),
      hasLinkDetection: homePageSource.includes("extractLinkCandidatesFromMessage"),
      hasMemeRenderBranch: homePageSource.includes('entry.parsedMessage.kind === "meme"')
    };
    if (!homeChecks.hasMemeIntentBranch || !homeChecks.hasLinkDetection || !homeChecks.hasMemeRenderBranch) {
      fail("Home chat pipeline is missing required meme send/render logic hooks.");
    }

    report.checks.validLinkFlow = {
      candidates: validCandidates,
      resolvedMemeId: matchedMeme.id
    };
    report.checks.invalidLinkFlow = {
      candidates: invalidCandidates,
      resolved: invalidResolved !== undefined
    };
    report.checks.addCultureFlow = {
      parsedKind: addCultureParsed.kind,
      payloadId: addCultureParsed.payload.id
    };
    report.checks.composerChecks = composerChecks;
    report.checks.homeChecks = homeChecks;

    report.passed = true;
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    report.passed = false;
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void run();
