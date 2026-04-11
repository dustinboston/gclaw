import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./logger.ts", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import { withRetry } from "./retry.ts";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("returns the result on first success", async () => {
    const result = await withRetry(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("retries on retryable status codes and succeeds", async () => {
    let attempt = 0;
    const fn = () => {
      attempt++;
      if (attempt === 1) {
        const err = new Error("rate limited") as any;
        err.code = 429;
        return Promise.reject(err);
      }
      return Promise.resolve("ok");
    };

    const promise = withRetry(fn, { baseDelayMs: 1, maxDelayMs: 10 });
    // Advance past retry delay
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;
    expect(result).toBe("ok");
    expect(attempt).toBe(2);
  });

  it("retries on network errors", async () => {
    let attempt = 0;
    const fn = () => {
      attempt++;
      if (attempt === 1) return Promise.reject(new Error("ECONNRESET"));
      return Promise.resolve("ok");
    };

    const promise = withRetry(fn, { baseDelayMs: 1, maxDelayMs: 10 });
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;
    expect(result).toBe("ok");
  });

  it("does not retry non-retryable errors", async () => {
    const err = new Error("auth failed") as any;
    err.code = 401;
    await expect(
      withRetry(() => Promise.reject(err), { baseDelayMs: 1 }),
    ).rejects.toThrow("auth failed");
  });

  it("throws after exhausting max attempts", async () => {
    vi.useRealTimers();
    const err = new Error("server error") as any;
    err.code = 500;
    await expect(
      withRetry(() => Promise.reject(err), {
        maxAttempts: 2,
        baseDelayMs: 1,
        maxDelayMs: 5,
      }),
    ).rejects.toThrow("server error");
    vi.useFakeTimers();
  });

  it("respects maxDelayMs cap", async () => {
    let attempt = 0;
    const fn = () => {
      attempt++;
      if (attempt <= 2) {
        const err = new Error("timeout") as any;
        err.code = 408;
        return Promise.reject(err);
      }
      return Promise.resolve("ok");
    };

    const promise = withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 100_000,
      maxDelayMs: 50,
    });
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;
    expect(result).toBe("ok");
  });
});
