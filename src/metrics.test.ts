import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./logger.ts", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  recordToolCall,
  withMetrics,
  getMetricsSummary,
  logMetricsSummary,
  resetMetrics,
} from "./metrics.ts";
import { logger } from "./logger.ts";

describe("metrics", () => {
  beforeEach(() => {
    resetMetrics();
    vi.clearAllMocks();
  });

  describe("recordToolCall", () => {
    it("records a successful tool call", () => {
      recordToolCall("test_tool", 150, true);

      const summary = getMetricsSummary();
      expect(summary.test_tool).toEqual({
        calls: 1,
        successes: 1,
        failures: 0,
        totalDurationMs: 150,
        avgDurationMs: 150,
      });
    });

    it("records a failed tool call", () => {
      recordToolCall("test_tool", 50, false);

      const summary = getMetricsSummary();
      expect(summary.test_tool.failures).toBe(1);
      expect(summary.test_tool.successes).toBe(0);
    });

    it("accumulates metrics across multiple calls", () => {
      recordToolCall("api", 100, true);
      recordToolCall("api", 200, true);
      recordToolCall("api", 50, false);

      const summary = getMetricsSummary();
      expect(summary.api.calls).toBe(3);
      expect(summary.api.successes).toBe(2);
      expect(summary.api.failures).toBe(1);
      expect(summary.api.totalDurationMs).toBe(350);
      expect(summary.api.avgDurationMs).toBe(117); // Math.round(350/3)
    });

    it("logs a debug entry per call", () => {
      recordToolCall("test_tool", 42, true);
      expect(logger.debug).toHaveBeenCalledWith(
        { tool: "test_tool", durationMs: 42, success: true },
        "Tool call metric",
      );
    });
  });

  describe("withMetrics", () => {
    it("records success and returns the result", async () => {
      const result = await withMetrics("my_tool", async () => "ok");
      expect(result).toBe("ok");

      const summary = getMetricsSummary();
      expect(summary.my_tool.successes).toBe(1);
      expect(summary.my_tool.failures).toBe(0);
    });

    it("records failure and re-throws the error", async () => {
      await expect(
        withMetrics("my_tool", async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      const summary = getMetricsSummary();
      expect(summary.my_tool.failures).toBe(1);
      expect(summary.my_tool.successes).toBe(0);
    });

    it("tracks duration", async () => {
      await withMetrics("my_tool", async () => {
        // Tiny delay to ensure non-zero duration
      });

      const summary = getMetricsSummary();
      expect(summary.my_tool.totalDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("logMetricsSummary", () => {
    it("logs when there are metrics", () => {
      recordToolCall("api", 100, true);
      logMetricsSummary();
      expect(logger.info).toHaveBeenCalledWith(
        { metrics: expect.objectContaining({ api: expect.any(Object) }) },
        "Metrics summary",
      );
    });

    it("does not log when there are no metrics", () => {
      logMetricsSummary();
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe("resetMetrics", () => {
    it("clears all recorded metrics", () => {
      recordToolCall("api", 100, true);
      resetMetrics();
      expect(getMetricsSummary()).toEqual({});
    });
  });
});
