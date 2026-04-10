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

import { calendar } from "./calendar.ts";

describe("calendar provider", () => {
  it("exports a calendar client", () => {
    expect(calendar).toBe(mockCalendar);
  });
});
