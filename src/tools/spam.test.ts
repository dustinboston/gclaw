import { describe, it, expect, vi } from "vitest";

const { mockModify } = vi.hoisted(() => ({
  mockModify: vi.fn().mockResolvedValue({}),
}));

vi.mock("../providers/gmail.ts", () => ({
  gmail: { users: { messages: { modify: mockModify } } },
  gmailRequest: vi.fn((fn: () => any) => fn()),
}));

import { spamEmail } from "./spam.ts";

describe("spamEmail", () => {
  it("adds SPAM label and removes INBOX label", async () => {
    const result = await spamEmail.invoke({ id: "msg1" });
    expect(mockModify).toHaveBeenCalledWith({
      userId: "me",
      id: "msg1",
      requestBody: {
        addLabelIds: ["SPAM"],
        removeLabelIds: ["INBOX"],
      },
    });
    expect(result).toBe("Email msg1 marked as spam successfully.");
  });
});
