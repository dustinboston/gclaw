import { describe, it, expect, vi } from "vitest";

const { mockSetCredentials } = vi.hoisted(() => ({
  mockSetCredentials: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class OAuth2 {
        setCredentials = mockSetCredentials;
        on = vi.fn();
      },
    },
    gmail: vi.fn().mockReturnValue({}),
  },
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi
    .fn()
    .mockReturnValue(JSON.stringify({ access_token: "saved_token" })),
  writeFileSync: vi.fn(),
}));

vi.mock("../crypto.ts", () => ({
  encrypt: vi.fn((plaintext: string) => ({
    encrypted: true,
    data: plaintext,
  })),
  decrypt: vi.fn((payload: any) => payload.data),
  isEncrypted: vi.fn(() => false),
}));

vi.mock("../retry.ts", () => ({
  withRetry: vi.fn((fn: () => any) => fn()),
}));

vi.mock("../logger.ts", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../config.ts", () => ({
  loadConfig: () => ({
    googleClientId: "test-id",
    googleClientSecret: "test-secret",
    oauthRedirectUrl: "http://localhost:3000",
    gmailMaxConcurrent: 2,
  }),
}));

import { auth } from "./gmail.ts";

describe("gmail provider with existing tokens", () => {
  it("loads tokens from file on startup", () => {
    expect(mockSetCredentials).toHaveBeenCalledWith({
      access_token: "saved_token",
    });
  });

  it("exports auth", () => {
    expect(auth).toBeDefined();
  });
});
