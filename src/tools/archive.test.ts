import { describe, it, expect, vi } from "vitest";

const { mockModify } = vi.hoisted(() => ({
  mockModify: vi.fn().mockResolvedValue({}),
}));

vi.mock("../providers/gmail.ts", () => ({
  gmail: { users: { messages: { modify: mockModify } } },
  gmailRequest: vi.fn((fn: () => any) => fn()),
}));

import { archiveEmail } from "./archive.ts";

describe("archiveEmail", () => {
  it("removes INBOX label", async () => {
    const result = await archiveEmail.invoke({ id: "msg1" });
    expect(mockModify).toHaveBeenCalledWith({
      userId: "me",
      id: "msg1",
      requestBody: { removeLabelIds: ["INBOX"] },
    });
    expect(result).toBe("Email msg1 archived successfully.");
  });
});
