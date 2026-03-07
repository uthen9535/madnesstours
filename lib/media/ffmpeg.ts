import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

type RunFfmpegOptions = {
  allowFailure?: boolean;
};

export type FfmpegRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export function resolveFfmpegPath(): string {
  const configured = process.env.FFMPEG_BIN;
  if (configured) {
    return configured;
  }

  const bundled = join(process.cwd(), "tools", "bin", "ffmpeg");
  if (existsSync(bundled)) {
    return bundled;
  }

  return "ffmpeg";
}

export async function runFfmpeg(args: string[], options: RunFfmpegOptions = {}): Promise<FfmpegRunResult> {
  const ffmpegPath = resolveFfmpegPath();

  return new Promise<FfmpegRunResult>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.once("error", (error) => {
      const withCode = error as NodeJS.ErrnoException;
      if (withCode.code === "ENOENT") {
        reject(new Error(`ffmpeg binary not found at "${ffmpegPath}". Install ffmpeg or set FFMPEG_BIN.`));
        return;
      }

      reject(error);
    });

    child.once("close", (exitCode) => {
      const code = typeof exitCode === "number" ? exitCode : -1;
      if (code !== 0 && !options.allowFailure) {
        const message = stderr.trim() || `ffmpeg exited with code ${code}`;
        reject(new Error(message));
        return;
      }

      resolve({
        stdout,
        stderr,
        exitCode: code
      });
    });
  });
}

function parseDurationMs(stderr: string): number | null {
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1] ?? "0", 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);
  const seconds = Number.parseFloat(match[3] ?? "0");

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }

  return Math.max(0, Math.round((hours * 3600 + minutes * 60 + seconds) * 1000));
}

function parseDimensions(stderr: string): { width: number; height: number } | null {
  const lines = stderr.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("Video:")) {
      continue;
    }

    const match = line.match(/(\d{2,5})x(\d{2,5})/);
    if (!match) {
      continue;
    }

    const width = Number.parseInt(match[1] ?? "0", 10);
    const height = Number.parseInt(match[2] ?? "0", 10);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { width, height };
    }
  }

  return null;
}

export async function probeVideoFile(filePath: string): Promise<{
  durationMs: number | null;
  width: number | null;
  height: number | null;
}> {
  const result = await runFfmpeg(["-i", filePath], { allowFailure: true });
  const dimensions = parseDimensions(result.stderr);

  return {
    durationMs: parseDurationMs(result.stderr),
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null
  };
}
