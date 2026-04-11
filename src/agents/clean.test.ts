import { describe, it, expect, vi } from "vitest";

const { mockCreateAgent } = vi.hoisted(() => ({
  mockCreateAgent: vi.fn().mockReturnValue({ stream: vi.fn() }),
}));

vi.mock("langchain", () => ({ createAgent: mockCreateAgent }));
vi.mock("../model.ts", () => ({ model: {} }));
vi.mock("../tools/gmail.ts", () => ({
  listEmail: { name: "list_email" },
  readEmail: { name: "read_email" },
  archiveEmail: { name: "archive_email" },
  deleteEmail: { name: "delete_email" },
  spamEmail: { name: "spam_email" },
}));
vi.mock("../tools/tasks.ts", () => ({
  createTask: { name: "create_task" },
}));
vi.mock("../tools/calendar.ts", () => ({
  listEvents: { name: "list_events" },
  createEvent: { name: "create_event" },
}));

import { createCleanAgent } from "./clean.ts";

describe("createCleanAgent", () => {
  it("creates a plan agent with only read tools", () => {
    createCleanAgent("plan");
    const lastCall = mockCreateAgent.mock.calls[mockCreateAgent.mock.calls.length - 1][0];
    const names = lastCall.tools.map((t: any) => t.name);
    expect(names).toEqual(["list_email", "read_email"]);
  });

  it("creates an execute agent with all tools", () => {
    createCleanAgent("execute");
    const lastCall = mockCreateAgent.mock.calls[mockCreateAgent.mock.calls.length - 1][0];
    const names = lastCall.tools.map((t: any) => t.name);
    expect(names).toEqual([
      "list_email",
      "read_email",
      "archive_email",
      "delete_email",
      "spam_email",
      "create_task",
      "list_events",
      "create_event",
    ]);
  });

  it("plan agent prompt contains 'PROPOSE' and no destructive instructions", () => {
    createCleanAgent("plan");
    const lastCall = mockCreateAgent.mock.calls[mockCreateAgent.mock.calls.length - 1][0];
    expect(lastCall.systemPrompt).toContain("PROPOSE");
    expect(lastCall.systemPrompt).toContain("Do NOT execute any destructive actions");
  });

  it("execute agent prompt contains execution instructions", () => {
    createCleanAgent("execute");
    const lastCall = mockCreateAgent.mock.calls[mockCreateAgent.mock.calls.length - 1][0];
    expect(lastCall.systemPrompt).toContain("EXECUTE");
    expect(lastCall.systemPrompt).toContain("audit trail");
  });
});
