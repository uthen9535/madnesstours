const RETRYABLE_DB_PATTERNS = [
  "database is locked",
  "database busy",
  "sqlite_busy",
  "sqlite_locked",
  "attempt to write a readonly database",
  "can't reach database server",
  "prismaclientinitializationerror",
  "connection reset",
  "connection closed",
  "server closed the connection unexpectedly",
  "connection timeout",
  "econnreset",
  "etimedout",
  "timed out fetching a new connection from the pool",
  "remaining connection slots are reserved"
];
const RETRYABLE_DB_CODES = ["P1001", "P1002", "P2024", "P2037"];

function isRetryableSqliteError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { message?: unknown; code?: unknown };
  const message = typeof maybeError.message === "string" ? maybeError.message : "";
  const code = typeof maybeError.code === "string" ? maybeError.code : "";
  const haystack = `${code} ${message}`.toLowerCase();

  if (RETRYABLE_DB_CODES.includes(code)) {
    return true;
  }

  return RETRYABLE_DB_PATTERNS.some((pattern) => haystack.includes(pattern.toLowerCase()));
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

type RetryOptions = {
  baseDelayMs?: number;
  onRetry?: (attempt: number, error: unknown) => void | Promise<void>;
};

export async function withSqliteRetry<T>(
  task: () => Promise<T>,
  maxAttempts = 6,
  options: RetryOptions = {}
): Promise<T> {
  let lastError: unknown = null;
  const baseDelayMs = options.baseDelayMs ?? 80;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!isRetryableSqliteError(error) || attempt >= maxAttempts) {
        throw error;
      }

      if (options.onRetry) {
        await options.onRetry(attempt, error);
      }

      await sleep(baseDelayMs * attempt * attempt);
    }
  }

  throw lastError;
}
