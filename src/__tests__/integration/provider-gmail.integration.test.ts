/**
 * Integration tests for the Gmail provider layer.
 *
 * Unlike the unit tests, these do NOT mock `withRetry` or `withMetrics`.
 * The real retry logic, rate limiter, and metrics recording all execute,
 * exercised against controlled async functions that simulate Google API
 * behavior (transient errors, latency, etc.).
 *
 * What is still mocked: googleapis, node:fs, crypto, logger, config —
 * because we are testing the provider *wiring*, not the Google SDK itself.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks that isolate side-effects (same as unit tests) ───────────────

vi.mock("../../logger.ts", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../context.ts", () => ({
  getRequestId: () => "test-req-id",
}));

vi.mock("../../config.ts", () => ({
  loadConfig: () => ({
    googleClientId: "test-id",
    googleClientSecret: "test-secret",
    oauthRedirectUrl: "http://localhost:3000",
    gmailMaxConcurrent: 2,
    tokenEncryptionKey: "test-key",
    googleAiModel: "gemini-2.5-flash",
  }),
}));

vi.mock("../../crypto.ts", () => ({
  encrypt: vi.fn((plaintext: string) => ({
    encrypted: true,
    data: plaintext,
  })),
  decrypt: vi.fn((payload: any) => payload.data),
  isEncrypted: vi.fn((data: any) => data?.encrypted === true),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

const { mockSetCredentials, mockOn } = vi.hoisted(() => ({
  mockSetCredentials: vi.fn(),
  mockOn: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class OAuth2 {
        setCredentials = mockSetCredentials;
        on = mockOn;
      },
    },
    gmail: vi.fn().mockReturnValue({ users: { messages: {} } }),
  },
}));

// NOTE: withRetry and withMetrics are NOT mocked — they are the real deal.

import { gmailRequest } from "../../providers/gmail.ts";
import { resetMetrics, getMetricsSummary } from "../../metrics.ts";
import { logger } from "../../logger.ts";

// ── Tests ──────────────────────────────────────────────────────────────

describe("Provider integration: gmailRequest + withRetry + withMetrics", () => {
  beforeEach(() => {
    resetMetrics();
    vi.clearAllMocks();
  });

  // ─── Retry behaviour ────────────────────────────────────────────────

  it("retries a transient 429 and succeeds on second attempt", async () => {
    let attempt = 0;
    const fn = () => {
      attempt++;
      if (attempt === 1) {
        const err: any = new Error("Rate limit exceeded");
        err.code = 429;
        return Promise.reject(err);
      }
      return Promise.resolve("ok");
    };

    const result = await gmailRequest(fn);

    expect(result).toBe("ok");
    expect(attempt).toBe(2);

    // Retry was logged
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1 }),
      "Retrying after transient error",
    );
  });

  it("retries transient 503 errors up to maxAttempts then throws", async () => {
    const fn = () => {
      const err: any = new Error("Service unavailable");
      err.code = 503;
      return Promise.reject(err);
    };

    await expect(gmailRequest(fn)).rejects.toThrow("Service unavailable");

    // Default maxAttempts is 3, so warn should be called twice (attempts 1 and 2)
    const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[1] === "Retrying after transient error",
    );
    expect(warnCalls).toHaveLength(2);
  });

  it("does NOT retry a non-transient 404 error", async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      const err: any = new Error("Not found");
      err.code = 404;
      return Promise.reject(err);
    };

    await expect(gmailRequest(fn)).rejects.toThrow("Not found");
    expect(attempts).toBe(1); // no retry
  });

  it("retries network errors (ECONNRESET)", async () => {
    let attempt = 0;
    const fn = () => {
      attempt++;
      if (attempt === 1) {
        return Promise.reject(new Error("read ECONNRESET"));
      }
      return Promise.resolve("recovered");
    };

    const result = await gmailRequest(fn);
    expect(result).toBe("recovered");
    expect(attempt).toBe(2);
  });

  // ─── Metrics recording ──────────────────────────────────────────────

  it("records success metrics through the full stack", async () => {
    await gmailRequest(() => Promise.resolve("data"));

    const summary = getMetricsSummary();
    expect(summary.gmail_api).toBeDefined();
    expect(summary.gmail_api.calls).toBe(1);
    expect(summary.gmail_api.successes).toBe(1);
    expect(summary.gmail_api.failures).toBe(0);
    expect(summary.gmail_api.avgDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("records failure metrics when all retries are exhausted", async () => {
    const fn = () => {
      const err: any = new Error("Server error");
      err.code = 500;
      return Promise.reject(err);
    };

    await expect(gmailRequest(fn)).rejects.toThrow();

    const summary = getMetricsSummary();
    expect(summary.gmail_api.calls).toBe(1);
    expect(summary.gmail_api.failures).toBe(1);
    expect(summary.gmail_api.successes).toBe(0);
  });

  it("accumulates metrics across multiple calls", async () => {
    await gmailRequest(() => Promise.resolve("a"));
    await gmailRequest(() => Promise.resolve("b"));
    await gmailRequest(() => Promise.resolve("c"));

    const summary = getMetricsSummary();
    expect(summary.gmail_api.calls).toBe(3);
    expect(summary.gmail_api.successes).toBe(3);
  });

  // ─── Rate limiter + retry interaction ────────────────────────────────

  it("rate-limits concurrent requests while retries are happening", async () => {
    const timeline: string[] = [];
    const resolvers: Array<() => void> = [];

    // Request A: succeeds immediately
    const requestA = gmailRequest(() => {
      timeline.push("A-exec");
      return Promise.resolve("A");
    });

    // Request B: succeeds immediately
    const requestB = gmailRequest(() => {
      timeline.push("B-exec");
      return Promise.resolve("B");
    });

    // Request C: must wait because MAX_CONCURRENT = 2
    const requestC = gmailRequest(() => {
      timeline.push("C-exec");
      return Promise.resolve("C");
    });

    // A and B execute first, C waits
    await requestA;
    await requestB;
    await requestC;

    // A and B should have executed before C
    const aIdx = timeline.indexOf("A-exec");
    const bIdx = timeline.indexOf("B-exec");
    const cIdx = timeline.indexOf("C-exec");
    expect(aIdx).toBeLessThan(cIdx);
    expect(bIdx).toBeLessThan(cIdx);
  });

  it("releases rate-limiter slot even when retries exhaust and throw", async () => {
    // Fill both slots with permanently-failing requests
    const fail = () => {
      const err: any = new Error("503");
      err.code = 503;
      return Promise.reject(err);
    };

    const p1 = gmailRequest(fail).catch(() => {});
    const p2 = gmailRequest(fail).catch(() => {});

    await p1;
    await p2;

    // A new request should still be able to acquire a slot (not deadlocked)
    const result = await gmailRequest(() => Promise.resolve("not stuck"));
    expect(result).toBe("not stuck");
  });

  it("handles mixed success and transient failure under concurrency", async () => {
    const results: string[] = [];

    // Slot 1: immediate success
    const p1 = gmailRequest(async () => {
      results.push("fast");
      return "fast";
    });

    // Slot 2: transient failure then success (uses retry internally)
    let attempt = 0;
    const p2 = gmailRequest(async () => {
      attempt++;
      if (attempt === 1) {
        const err: any = new Error("429");
        err.code = 429;
        throw err;
      }
      results.push("retry-ok");
      return "retry-ok";
    });

    // Slot 3 (queued): immediate success
    const p3 = gmailRequest(async () => {
      results.push("queued");
      return "queued";
    });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(r1).toBe("fast");
    expect(r2).toBe("retry-ok");
    expect(r3).toBe("queued");
    expect(results).toContain("fast");
    expect(results).toContain("retry-ok");
    expect(results).toContain("queued");

    // Metrics should show 3 successful API calls
    const summary = getMetricsSummary();
    expect(summary.gmail_api.calls).toBe(3);
    expect(summary.gmail_api.successes).toBe(3);
  });
});
