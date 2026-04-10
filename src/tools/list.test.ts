import { describe, it, expect, vi } from "vitest";

const { mockList } = vi.hoisted(() => ({ mockList: vi.fn() }));

vi.mock("../providers/gmail.ts", () => ({
  gmail: { users: { messages: { list: mockList } } },
  gmailRequest: vi.fn((fn: () => any) => fn()),
}));

import { listEmail } from "./list.ts";

describe("listEmail", () => {
  it("returns messages as JSON", async () => {
    mockList.mockResolvedValue({
      data: { messages: [{ id: "1", threadId: "t1" }] },
    });
    const result = await listEmail.invoke({ label: "INBOX", maxResults: 10 });
    expect(mockList).toHaveBeenCalledWith({
      userId: "me",
      labelIds: ["INBOX"],
      maxResults: 10,
    });
    expect(result).toBe(JSON.stringify([{ id: "1", threadId: "t1" }]));
  });

  it("returns empty array when no messages", async () => {
    mockList.mockResolvedValue({ data: {} });
    const result = await listEmail.invoke({ label: "SPAM", maxResults: 5 });
    expect(result).toBe("[]");
  });
});
