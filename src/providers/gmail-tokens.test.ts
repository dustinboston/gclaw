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
