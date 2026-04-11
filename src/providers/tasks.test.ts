import { describe, it, expect, vi } from "vitest";

const { mockTasks } = vi.hoisted(() => ({
  mockTasks: { tasklists: {}, tasks: {} },
}));

vi.mock("googleapis", () => ({
  google: {
    tasks: vi.fn().mockReturnValue(mockTasks),
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
    tasksMaxConcurrent: 2,
    tokenEncryptionKey: "test-key",
  }),
}));

import { tasks, tasksRequest } from "./tasks.ts";

describe("tasks provider", () => {
  it("exports a tasks client", () => {
    expect(tasks).toBe(mockTasks);
  });

  it("exports tasksRequest that executes the function", async () => {
    const result = await tasksRequest(() => Promise.resolve("data"));
    expect(result).toBe("data");
  });

  it("tasksRequest propagates errors", async () => {
    await expect(
      tasksRequest(() => Promise.reject(new Error("fail"))),
    ).rejects.toThrow("fail");
  });
});
