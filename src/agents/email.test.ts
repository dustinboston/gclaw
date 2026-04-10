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

import { emailAgent } from "./email.ts";

describe("emailAgent", () => {
  it("is created via createAgent", () => {
    expect(mockCreateAgent).toHaveBeenCalledTimes(1);
    expect(emailAgent).toBeDefined();
  });

  it("has the correct tools", () => {
    const call = mockCreateAgent.mock.calls[0][0];
    const names = call.tools.map((t: any) => t.name);
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

  it("has a system prompt with workflow instructions", () => {
    const call = mockCreateAgent.mock.calls[0][0];
    expect(call.systemPrompt).toContain("email assistant");
    expect(call.systemPrompt).toContain("archive_email");
  });
});
