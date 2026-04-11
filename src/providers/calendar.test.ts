import { describe, it, expect, vi } from "vitest";

const { mockCalendar } = vi.hoisted(() => ({
  mockCalendar: { calendarList: {}, events: {} },
}));

vi.mock("googleapis", () => ({
  google: {
    calendar: vi.fn().mockReturnValue(mockCalendar),
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
  }),
}));

import { calendar } from "./calendar.ts";

describe("calendar provider", () => {
  it("exports a calendar client", () => {
    expect(calendar).toBe(mockCalendar);
  });
});
