import { logger } from "./logger.ts";

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function isRetryable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const status =
    (error as any).code ?? (error as any).status ?? (error as any).statusCode;

  if (typeof status === "number" && RETRYABLE_STATUS_CODES.has(status)) {
    return true;
  }

  const message = (error as any).message ?? "";
  if (
    typeof message === "string" &&
    (message.includes("ECONNRESET") ||
      message.includes("ETIMEDOUT") ||
      message.includes("ENOTFOUND") ||
      message.includes("socket hang up"))
  ) {
    return true;
  }

  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 500, maxDelayMs = 10_000 } = opts;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts || !isRetryable(error)) {
        throw error;
      }

      const jitter = Math.random() * 0.5 + 0.75; // 0.75–1.25
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1) * jitter, maxDelayMs);

      logger.warn(
        { attempt, maxAttempts, delayMs: Math.round(delay), error: (error as Error).message },
        "Retrying after transient error",
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Unreachable");
}
