const SQLITE_LOCKED_PATTERNS = ["database is locked", "database busy", "SQLITE_BUSY", "SQLITE_LOCKED"];

function isRetryableSqliteError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { message?: unknown; code?: unknown };
  const message = typeof maybeError.message === "string" ? maybeError.message : "";
  const code = typeof maybeError.code === "string" ? maybeError.code : "";
  const haystack = `${code} ${message}`.toLowerCase();

  return SQLITE_LOCKED_PATTERNS.some((pattern) => haystack.includes(pattern.toLowerCase()));
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withSqliteRetry<T>(task: () => Promise<T>, maxAttempts = 6): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!isRetryableSqliteError(error) || attempt >= maxAttempts) {
        throw error;
      }

      await sleep(80 * attempt * attempt);
    }
  }

  throw lastError;
}
