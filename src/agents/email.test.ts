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
  unarchiveEmail: { name: "unarchive_email" },
  undeleteEmail: { name: "undelete_email" },
  unspamEmail: { name: "unspam_email" },
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
      "unarchive_email",
      "undelete_email",
      "unspam_email",
    ]);
  });

  it("has a system prompt with Gmail instructions", () => {
    const call = mockCreateAgent.mock.calls[0][0];
    expect(call.systemPrompt).toContain("Gmail assistant");
    expect(call.systemPrompt).toContain("list_email");
  });

  it("has undo tool instructions in the system prompt", () => {
    const call = mockCreateAgent.mock.calls[0][0];
    expect(call.systemPrompt).toContain("unarchive_email");
    expect(call.systemPrompt).toContain("undelete_email");
    expect(call.systemPrompt).toContain("unspam_email");
  });
});
