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

import { tasks } from "./tasks.ts";

describe("tasks provider", () => {
  it("exports a tasks client", () => {
    expect(tasks).toBe(mockTasks);
  });
});
