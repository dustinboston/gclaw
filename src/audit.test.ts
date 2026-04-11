import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAppendFileSync } = vi.hoisted(() => ({
  mockAppendFileSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  appendFileSync: mockAppendFileSync,
}));

vi.mock("./logger.ts", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logAudit } from "./audit.ts";
import { logger } from "./logger.ts";

describe("logAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes a JSON line to the audit log file", () => {
    logAudit("archive", "msg123", "success");

    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
    const [, line] = mockAppendFileSync.mock.calls[0];
    const entry = JSON.parse(line.trim());
    expect(entry.action).toBe("archive");
    expect(entry.emailId).toBe("msg123");
    expect(entry.result).toBe("success");
    expect(entry.timestamp).toBeDefined();
    expect(entry.error).toBeUndefined();
  });

  it("includes error field on failure", () => {
    logAudit("delete", "msg456", "failure", "API error");

    const [, line] = mockAppendFileSync.mock.calls[0];
    const entry = JSON.parse(line.trim());
    expect(entry.action).toBe("delete");
    expect(entry.result).toBe("failure");
    expect(entry.error).toBe("API error");
  });

  it("logs to the structured logger", () => {
    logAudit("spam", "msg789", "success");
    expect(logger.info).toHaveBeenCalledWith(
      { action: "spam", emailId: "msg789", result: "success" },
      "Audit: email action",
    );
  });

  it("handles file write errors gracefully", () => {
    mockAppendFileSync.mockImplementation(() => {
      throw new Error("disk full");
    });

    // Should not throw
    logAudit("archive", "msg000", "success");
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Failed to write audit log",
    );
  });
});
