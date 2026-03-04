#!/usr/bin/env tsx
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import {
  ET_TRANSMISSIONS,
  MEMBER_SCENARIOS,
  MILITARY_TRANSMISSIONS,
  randomInt,
  transmissionAudioSrc,
  type BreachMode
} from "../lib/shortwaveTransmissions";

type GenerationMode = "offline" | "online";
type OfflineTtsEngine = "espeak" | "piper" | "say" | "tone";

type Options = {
  force: boolean;
  mode: GenerationMode;
  offlineTts: OfflineTtsEngine;
  ffmpegPath: string;
};

type ModeSettings = {
  sayVoice: string;
  espeakVoice: string;
  espeakSpeed: number;
  espeakPitch: number;
  openAiVoice: string;
};

const ROOT = process.cwd();
const PUBLIC_AUDIO_ROOT = join(ROOT, "public", "audio");
const TMP_ROOT = join(ROOT, ".tmp", "audio-gen");

const MODE_SETTINGS: Record<BreachMode, ModeSettings> = {
  military: {
    sayVoice: "Eddy (English (US))",
    espeakVoice: "en-us",
    espeakSpeed: 156,
    espeakPitch: 40,
    openAiVoice: "onyx"
  },
  et: {
    sayVoice: "Eddy (English (US))",
    espeakVoice: "en-sc",
    espeakSpeed: 142,
    espeakPitch: 32,
    openAiVoice: "echo"
  },
  member: {
    sayVoice: "Samantha",
    espeakVoice: "en-us",
    espeakSpeed: 150,
    espeakPitch: 46,
    openAiVoice: "alloy"
  }
};

const MODE_TEXT: Record<BreachMode, readonly string[]> = {
  military: MILITARY_TRANSMISSIONS,
  et: ET_TRANSMISSIONS,
  member: MEMBER_SCENARIOS
};

function logStep(message: string) {
  process.stdout.write(`${message}\n`);
}

function parseArgs(): Options {
  const args = process.argv.slice(2);

  let force = false;
  let mode: GenerationMode | null = null;
  let offlineTts: OfflineTtsEngine | null = null;
  let ffmpegFromArg: string | null = null;

  for (const arg of args) {
    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length);
      if (value === "offline" || value === "online") {
        mode = value;
        continue;
      }
      throw new Error(`Invalid --mode value: ${value}`);
    }

    if (arg.startsWith("--tts=")) {
      const value = arg.slice("--tts=".length);
      if (value === "espeak" || value === "piper" || value === "say" || value === "tone") {
        offlineTts = value;
        continue;
      }
      throw new Error(`Invalid --tts value: ${value}`);
    }

    if (arg.startsWith("--ffmpeg=")) {
      ffmpegFromArg = arg.slice("--ffmpeg=".length);
      continue;
    }

    throw new Error(`Unknown arg: ${arg}`);
  }

  const envMode = process.env.OPENAI_API_KEY ? "online" : "offline";
  const selectedMode = mode ?? (envMode as GenerationMode);

  const ffmpegPath =
    ffmpegFromArg ??
    process.env.FFMPEG_BIN ??
    (existsSync(join(ROOT, "tools", "bin", "ffmpeg")) ? join(ROOT, "tools", "bin", "ffmpeg") : "ffmpeg");

  const selectedOfflineTts = offlineTts ?? "espeak";

  return {
    force,
    mode: selectedMode,
    offlineTts: selectedOfflineTts,
    ffmpegPath
  };
}

function runCommand(command: string, args: string[], stdinText?: string): void {
  const result = spawnSync(command, args, {
    stdio: stdinText ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    input: stdinText
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}\n${result.stderr || result.stdout}`);
  }
}

function commandExists(command: string): boolean {
  try {
    execFileSync("/bin/zsh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function ensureDir(pathname: string): void {
  mkdirSync(pathname, { recursive: true });
}

function ensureParent(pathname: string): void {
  ensureDir(dirname(pathname));
}

function shouldSkipOutput(pathname: string, force: boolean): boolean {
  if (force) {
    return false;
  }

  if (!existsSync(pathname)) {
    return false;
  }

  return statSync(pathname).size > 0;
}

function assertAudioFile(pathname: string): void {
  if (!existsSync(pathname)) {
    throw new Error(`Expected audio file does not exist: ${pathname}`);
  }

  const stats = statSync(pathname);
  if (stats.size < 1_024) {
    throw new Error(`Generated audio file is unexpectedly small: ${pathname} (${stats.size} bytes)`);
  }
}

function estimateDurationSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const duration = words / 2.7;
  return Math.max(2.4, Math.min(15, duration + 0.85));
}

function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function transmissionOutputPath(mode: BreachMode, index: number): string {
  const srcPath = transmissionAudioSrc(mode, index);
  return join(ROOT, "public", srcPath.slice(1));
}

function tempPath(name: string): string {
  return join(TMP_ROOT, name);
}

async function synthesizeViaOpenAi(
  mode: BreachMode,
  text: string,
  outputWavPath: string,
  options: Options
): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for online mode");
  }

  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const voice = MODE_SETTINGS[mode].openAiVoice;

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      response_format: "mp3"
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI TTS request failed (${response.status}): ${body}`);
  }

  const audioBytes = Buffer.from(await response.arrayBuffer());
  const tmpMp3 = tempPath(`online-${mode}-${Date.now()}-${randomInt(1000, 9999)}.mp3`);
  ensureParent(tmpMp3);
  writeFileSync(tmpMp3, audioBytes);

  runCommand(options.ffmpegPath, [
    "-y",
    "-i",
    tmpMp3,
    "-ar",
    "44100",
    "-ac",
    "1",
    outputWavPath
  ]);
}

function synthesizeOffline(
  mode: BreachMode,
  text: string,
  outputWavPath: string,
  options: Options
): void {
  const settings = MODE_SETTINGS[mode];

  if (options.offlineTts === "espeak") {
    if (!commandExists("espeak")) {
      if (commandExists("say")) {
        logStep("[warn] espeak not found. Falling back to macOS 'say'.");
      } else {
        throw new Error("Offline TTS engine espeak is not installed.");
      }
    } else {
      runCommand("espeak", [
        "-v",
        settings.espeakVoice,
        "-s",
        String(settings.espeakSpeed),
        "-p",
        String(settings.espeakPitch),
        "-w",
        outputWavPath,
        text
      ]);
      return;
    }
  }

  if (options.offlineTts === "piper") {
    if (!commandExists("piper")) {
      throw new Error("Offline TTS engine piper is not installed.");
    }

    const modeKey = mode.toUpperCase();
    const modelPath =
      process.env[`PIPER_MODEL_${modeKey}`] ??
      process.env.PIPER_MODEL ??
      process.env.PIPER_MODEL_PATH ??
      "";

    if (!modelPath) {
      throw new Error("PIPER_MODEL (or PIPER_MODEL_<MODE>) must be set for piper offline mode.");
    }

    runCommand(
      "piper",
      [
        "--model",
        modelPath,
        "--output_file",
        outputWavPath
      ],
      text
    );
    return;
  }

  if (options.offlineTts === "tone") {
    const textHash = hashText(`${mode}:${text}`);
    const duration = estimateDurationSeconds(text).toFixed(2);
    const baseFrequency = 140 + (textHash % 120);
    const driftFrequency = 18 + (textHash % 40);
    const modRate = 1.3 + ((textHash >> 2) % 23) / 10;
    const tremoloRate = 3.2 + ((textHash >> 4) % 17) / 10;
    const tremoloDepth = 0.22 + ((textHash >> 6) % 10) / 100;

    runCommand(options.ffmpegPath, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `aevalsrc=0.28*sin(2*PI*(${baseFrequency}+${driftFrequency}*sin(2*PI*${modRate}*t))*t):s=44100:d=${duration}`,
      "-af",
      `tremolo=f=${tremoloRate}:d=${tremoloDepth},highpass=f=90,lowpass=f=3600,volume=0.92`,
      "-ac",
      "1",
      "-ar",
      "44100",
      outputWavPath
    ]);
    return;
  }

  if (!commandExists("say")) {
    logStep("[warn] No speech TTS engine available. Falling back to tone synthesis.");
    synthesizeOffline(mode, text, outputWavPath, { ...options, offlineTts: "tone" });
    return;
  }

  runCommand("say", [
    "-v",
    settings.sayVoice,
    "-o",
    outputWavPath,
    "--data-format=LEI16@22050",
    text
  ]);

  // Normalize macOS say output to consistent rate for ffmpeg post-processing.
  runCommand(options.ffmpegPath, [
    "-y",
    "-i",
    outputWavPath,
    "-ar",
    "44100",
    "-ac",
    "1",
    `${outputWavPath}.tmp.wav`
  ]);
  rmSync(outputWavPath);
  runCommand("/bin/mv", [`${outputWavPath}.tmp.wav`, outputWavPath]);
}

function applyTransmissionEffects(
  mode: BreachMode,
  sourceWavPath: string,
  outputMp3Path: string,
  text: string,
  options: Options
): void {
  const seconds = estimateDurationSeconds(text).toFixed(2);

  let voiceFilter = "";
  let noiseFilter = "";

  if (mode === "military") {
    voiceFilter =
      "highpass=f=240,lowpass=f=3600,acompressor=threshold=-22dB:ratio=3.8:attack=5:release=120,volume=1.45";
    noiseFilter = "highpass=f=1100,lowpass=f=7600,volume=0.12";
  } else if (mode === "et") {
    voiceFilter =
      "highpass=f=180,lowpass=f=3500,acompressor=threshold=-22dB:ratio=3:attack=8:release=150,aecho=0.75:0.2:36:0.1,volume=1.62";
    noiseFilter = "highpass=f=900,lowpass=f=8600,volume=0.075";
  } else {
    voiceFilter =
      "highpass=f=210,lowpass=f=3900,acompressor=threshold=-20dB:ratio=2.9:attack=8:release=180,aecho=0.72:0.2:32:0.06,volume=1.34";
    noiseFilter = "highpass=f=900,lowpass=f=7300,volume=0.1";
  }

  const filterComplex = `[0:a]${voiceFilter}[voice];[1:a]${noiseFilter}[noise];[voice][noise]amix=inputs=2:normalize=0,alimiter=limit=0.95,aresample=44100,aformat=channel_layouts=stereo[out]`;

  runCommand(options.ffmpegPath, [
    "-y",
    "-i",
    sourceWavPath,
    "-f",
    "lavfi",
    "-t",
    seconds,
    "-i",
    "anoisesrc=color=white:amplitude=0.08:sample_rate=44100",
    "-filter_complex",
    filterComplex,
    "-map",
    "[out]",
    "-ac",
    "2",
    "-ar",
    "44100",
    "-codec:a",
    "libmp3lame",
    "-q:a",
    "2",
    outputMp3Path
  ]);
}

function generateTransmissionAsset(mode: BreachMode, index: number, text: string, options: Options): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const outputPath = transmissionOutputPath(mode, index);
      ensureParent(outputPath);

      if (shouldSkipOutput(outputPath, options.force)) {
        logStep(`[skip] ${outputPath}`);
        resolve();
        return;
      }

      const wavPath = tempPath(`${mode}-${String(index + 1).padStart(2, "0")}.wav`);
      ensureParent(wavPath);

      if (options.mode === "online") {
        await synthesizeViaOpenAi(mode, text, wavPath, options);
      } else {
        synthesizeOffline(mode, text, wavPath, options);
      }

      assertAudioFile(wavPath);
      applyTransmissionEffects(mode, wavPath, outputPath, text, options);
      assertAudioFile(outputPath);
      logStep(`[ok]  ${outputPath}`);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

function generateBedAssets(options: Options): void {
  const outputs = {
    loop1: join(PUBLIC_AUDIO_ROOT, "bed", "bed_loop_01.mp3"),
    loop2: join(PUBLIC_AUDIO_ROOT, "bed", "bed_loop_02.mp3"),
    loop3: join(PUBLIC_AUDIO_ROOT, "bed", "bed_loop_03.mp3"),
    static1: join(PUBLIC_AUDIO_ROOT, "bed", "burst_static_01.mp3"),
    static2: join(PUBLIC_AUDIO_ROOT, "bed", "burst_static_02.mp3"),
    modem1: join(PUBLIC_AUDIO_ROOT, "bed", "burst_modem_01.mp3"),
    keyclick1: join(PUBLIC_AUDIO_ROOT, "bed", "burst_keyclick_01.mp3"),
    cueGlitch: join(PUBLIC_AUDIO_ROOT, "controls", "force_glitch.mp3"),
    cueRedAlert: join(PUBLIC_AUDIO_ROOT, "controls", "force_red_alert.mp3")
  };

  for (const outputPath of Object.values(outputs)) {
    ensureParent(outputPath);
  }

  if (!shouldSkipOutput(outputs.loop1, options.force)) {
    runCommand(options.ffmpegPath, [
      "-y",
      "-f",
      "lavfi",
      "-t",
      "24",
      "-i",
      "anoisesrc=color=pink:amplitude=0.05:sample_rate=44100",
      "-f",
      "lavfi",
      "-t",
      "24",
      "-i",
      "sine=frequency=58:sample_rate=44100",
      "-f",
      "lavfi",
      "-t",
      "24",
      "-i",
      "sine=frequency=1320:sample_rate=44100",
      "-filter_complex",
      "[0:a]lowpass=f=1800,highpass=f=80,volume=0.16[n];[1:a]volume=0.028[h];[2:a]volume=0.005,apulsator=mode=sine:hz=0.08:amount=0.65[m];[n][h][m]amix=inputs=3:normalize=0,alimiter=limit=0.92[out]",
      "-map",
      "[out]",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-codec:a",
      "libmp3lame",
      "-q:a",
      "6",
      outputs.loop1
    ]);
  }

  if (!shouldSkipOutput(outputs.loop2, options.force)) {
    runCommand(options.ffmpegPath, [
      "-y",
      "-f",
      "lavfi",
      "-t",
      "24",
      "-i",
      "anoisesrc=color=brown:amplitude=0.05:sample_rate=44100",
      "-f",
      "lavfi",
      "-t",
      "24",
      "-i",
      "sine=frequency=64:sample_rate=44100",
      "-f",
      "lavfi",
      "-t",
      "24",
      "-i",
      "sine=frequency=980:sample_rate=44100",
      "-filter_complex",
      "[0:a]lowpass=f=1700,highpass=f=70,volume=0.17[n];[1:a]volume=0.026[h];[2:a]apulsator=mode=sine:hz=0.14:amount=0.8,volume=0.01[m];[n][h][m]amix=inputs=3:normalize=0,alimiter=limit=0.92[out]",
      "-map",
      "[out]",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-codec:a",
      "libmp3lame",
      "-q:a",
      "6",
      outputs.loop2
    ]);
  }

  if (!shouldSkipOutput(outputs.loop3, options.force)) {
    runCommand(options.ffmpegPath, [
      "-y",
      "-f",
      "lavfi",
      "-t",
      "24",
      "-i",
      "anoisesrc=color=white:amplitude=0.04:sample_rate=44100",
      "-f",
      "lavfi",
      "-t",
      "24",
      "-i",
      "sine=frequency=72:sample_rate=44100",
      "-f",
      "lavfi",
      "-t",
      "24",
      "-i",
      "sine=frequency=1450:sample_rate=44100",
      "-filter_complex",
      "[0:a]lowpass=f=2100,highpass=f=85,volume=0.14[n];[1:a]volume=0.022[h];[2:a]lowpass=f=3000,volume=0.0045[m];[n][h][m]amix=inputs=3:normalize=0,alimiter=limit=0.92[out]",
      "-map",
      "[out]",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-codec:a",
      "libmp3lame",
      "-q:a",
      "6",
      outputs.loop3
    ]);
  }

  if (!shouldSkipOutput(outputs.static1, options.force)) {
    runCommand(options.ffmpegPath, [
      "-y",
      "-f",
      "lavfi",
      "-t",
      "0.9",
      "-i",
      "anoisesrc=color=white:amplitude=0.7:sample_rate=44100",
      "-af",
      "highpass=f=1200,lowpass=f=9000,afade=t=in:st=0:d=0.03,afade=t=out:st=0.58:d=0.3,volume=0.25",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-codec:a",
      "libmp3lame",
      "-q:a",
      "6",
      outputs.static1
    ]);
  }

  if (!shouldSkipOutput(outputs.static2, options.force)) {
    runCommand(options.ffmpegPath, [
      "-y",
      "-f",
      "lavfi",
      "-t",
      "1.05",
      "-i",
      "anoisesrc=color=pink:amplitude=0.8:sample_rate=44100",
      "-af",
      "highpass=f=700,lowpass=f=7600,afade=t=in:st=0:d=0.02,afade=t=out:st=0.72:d=0.32,volume=0.28",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-codec:a",
      "libmp3lame",
      "-q:a",
      "6",
      outputs.static2
    ]);
  }

  if (!shouldSkipOutput(outputs.modem1, options.force)) {
    runCommand(options.ffmpegPath, [
      "-y",
      "-f",
      "lavfi",
      "-t",
      "1.1",
      "-i",
      "aevalsrc=sin(2*PI*(460+2200*t)*t):s=44100",
      "-af",
      "highpass=f=350,lowpass=f=5200,afade=t=in:st=0:d=0.03,afade=t=out:st=0.8:d=0.3,volume=0.22",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-codec:a",
      "libmp3lame",
      "-q:a",
      "6",
      outputs.modem1
    ]);
  }

  if (!shouldSkipOutput(outputs.keyclick1, options.force)) {
    runCommand(options.ffmpegPath, [
      "-y",
      "-f",
      "lavfi",
      "-t",
      "1.0",
      "-i",
      "aevalsrc=if(lt(mod(t\\,0.13)\\,0.01)\\,sin(2*PI*2600*t)\\,0):s=44100",
      "-af",
      "afade=t=in:st=0:d=0.01,afade=t=out:st=0.72:d=0.24,volume=0.2",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-codec:a",
      "libmp3lame",
      "-q:a",
      "6",
      outputs.keyclick1
    ]);
  }

  if (!shouldSkipOutput(outputs.cueGlitch, options.force)) {
    runCommand(options.ffmpegPath, [
      "-y",
      "-f",
      "lavfi",
      "-t",
      "0.45",
      "-i",
      "anoisesrc=color=white:amplitude=0.7:sample_rate=44100",
      "-af",
      "highpass=f=1200,lowpass=f=8400,afade=t=in:st=0:d=0.01,afade=t=out:st=0.26:d=0.18,volume=0.34",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-codec:a",
      "libmp3lame",
      "-q:a",
      "6",
      outputs.cueGlitch
    ]);
  }

  if (!shouldSkipOutput(outputs.cueRedAlert, options.force)) {
    runCommand(options.ffmpegPath, [
      "-y",
      "-f",
      "lavfi",
      "-t",
      "0.62",
      "-i",
      "sine=frequency=760:sample_rate=44100",
      "-f",
      "lavfi",
      "-t",
      "0.62",
      "-i",
      "sine=frequency=540:sample_rate=44100",
      "-filter_complex",
      "[0:a]volume=0.28[a];[1:a]adelay=120|120,volume=0.24[b];[a][b]amix=inputs=2:normalize=0,afade=t=in:st=0:d=0.02,afade=t=out:st=0.44:d=0.16[out]",
      "-map",
      "[out]",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-codec:a",
      "libmp3lame",
      "-q:a",
      "6",
      outputs.cueRedAlert
    ]);
  }

  for (const outputPath of Object.values(outputs)) {
    assertAudioFile(outputPath);
    logStep(`[ok]  ${outputPath}`);
  }
}

async function main() {
  const options = parseArgs();

  ensureDir(join(PUBLIC_AUDIO_ROOT, "transmissions", "military"));
  ensureDir(join(PUBLIC_AUDIO_ROOT, "transmissions", "et"));
  ensureDir(join(PUBLIC_AUDIO_ROOT, "transmissions", "member"));
  ensureDir(join(PUBLIC_AUDIO_ROOT, "bed"));
  ensureDir(join(PUBLIC_AUDIO_ROOT, "controls"));
  ensureDir(TMP_ROOT);

  if (!existsSync(options.ffmpegPath) && options.ffmpegPath !== "ffmpeg") {
    throw new Error(`FFmpeg binary not found at: ${options.ffmpegPath}`);
  }

  if (options.ffmpegPath === "ffmpeg" && !commandExists("ffmpeg")) {
    throw new Error("ffmpeg is required but was not found in PATH.");
  }

  logStep(`Mode: ${options.mode}`);
  if (options.mode === "offline") {
    logStep(`Offline TTS: ${options.offlineTts}`);
  }
  logStep(`FFmpeg: ${options.ffmpegPath}`);

  generateBedAssets(options);

  for (const mode of ["military", "et", "member"] as const) {
    const pool = MODE_TEXT[mode];
    for (let index = 0; index < pool.length; index += 1) {
      const text = pool[index];
      await generateTransmissionAsset(mode, index, text, options);
    }
  }

  logStep("Audio generation complete.");
}

main().catch((error) => {
  process.stderr.write(`${String(error instanceof Error ? error.message : error)}\n`);
  process.exitCode = 1;
});
