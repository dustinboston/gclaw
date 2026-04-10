import { describe, it, expect, vi } from "vitest";

const { mockTrash } = vi.hoisted(() => ({
  mockTrash: vi.fn().mockResolvedValue({}),
}));

vi.mock("../providers/gmail.ts", () => ({
  gmail: { users: { messages: { trash: mockTrash } } },
  gmailRequest: vi.fn((fn: () => any) => fn()),
}));

import { deleteEmail } from "./delete.ts";

describe("deleteEmail", () => {
  it("moves message to trash", async () => {
    const result = await deleteEmail.invoke({ id: "msg1" });
    expect(mockTrash).toHaveBeenCalledWith({ userId: "me", id: "msg1" });
    expect(result).toBe("Email msg1 deleted successfully.");
  });
});
