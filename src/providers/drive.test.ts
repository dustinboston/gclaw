import { describe, it, expect, vi } from "vitest";

const { mockDrive } = vi.hoisted(() => ({
  mockDrive: { files: {} },
}));

vi.mock("googleapis", () => ({
  google: {
    drive: vi.fn().mockReturnValue(mockDrive),
    auth: {
      OAuth2: class OAuth2 {
        setCredentials = vi.fn();
        on = vi.fn();
      },
    },
    gmail: vi.fn().mockReturnValue({}),
  },
}));
vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("../crypto.ts", () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  isEncrypted: vi.fn(() => false),
}));

vi.mock("../retry.ts", () => ({
  withRetry: vi.fn((fn: () => any) => fn()),
}));

vi.mock("../logger.ts", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../config.ts", () => ({
  loadConfig: () => ({
    googleClientId: "test-id",
    googleClientSecret: "test-secret",
    oauthRedirectUrl: "http://localhost:3000",
    gmailMaxConcurrent: 2,
    driveMaxConcurrent: 2,
    tokenEncryptionKey: "test-key",
  }),
}));

import { drive, driveRequest } from "./drive.ts";

describe("drive provider", () => {
  it("exports a drive client", () => {
    expect(drive).toBe(mockDrive);
  });

  it("exports driveRequest that executes the function", async () => {
    const result = await driveRequest(() => Promise.resolve("data"));
    expect(result).toBe("data");
  });

  it("driveRequest propagates errors", async () => {
    await expect(
      driveRequest(() => Promise.reject(new Error("fail"))),
    ).rejects.toThrow("fail");
  });

  it("driveRequest serializes calls beyond the concurrency limit", async () => {
    // driveMaxConcurrent = 2. Fire 3 at once; the 3rd must wait for one to complete.
    let running = 0;
    let peak = 0;
    const makeFn = () => async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise(r => setTimeout(r, 10));
      running--;
      return "ok";
    };

    const results = await Promise.all([
      driveRequest(makeFn()),
      driveRequest(makeFn()),
      driveRequest(makeFn()),
    ]);

    expect(results).toEqual(["ok", "ok", "ok"]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("driveRequest releases the slot even when the inner call throws", async () => {
    // Fail twice to exhaust concurrency slots, then verify a later call still runs.
    await expect(driveRequest(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(driveRequest(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    const ok = await driveRequest(() => Promise.resolve("recovered"));
    expect(ok).toBe("recovered");
  });
});
