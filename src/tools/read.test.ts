import { describe, it, expect, vi } from "vitest";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock("../providers/gmail.ts", () => ({
  gmail: { users: { messages: { get: mockGet } } },
  gmailRequest: vi.fn((fn: () => any) => fn()),
}));

import { readEmail } from "./read.ts";

describe("readEmail", () => {
  it("extracts headers and metadata", async () => {
    mockGet.mockResolvedValue({
      data: {
        id: "msg1",
        threadId: "t1",
        labelIds: ["INBOX"],
        snippet: "Hello...",
        payload: {
          headers: [
            { name: "From", value: "alice@test.com" },
            { name: "To", value: "bob@test.com" },
            { name: "Subject", value: "Hi" },
            { name: "Date", value: "2026-01-01" },
          ],
        },
      },
    });

    const result = JSON.parse(await readEmail.invoke({ id: "msg1" }));

    expect(mockGet).toHaveBeenCalledWith({
      userId: "me",
      id: "msg1",
      format: "metadata",
      metadataHeaders: ["From", "To", "Subject", "Date", "List-Unsubscribe"],
    });
    expect(result).toEqual({
      id: "msg1",
      threadId: "t1",
      labels: ["INBOX"],
      from: "alice@test.com",
      to: "bob@test.com",
      subject: "Hi",
      date: "2026-01-01",
      snippet: "Hello...",
    });
  });

  it("handles missing headers gracefully", async () => {
    mockGet.mockResolvedValue({
      data: {
        id: "msg2",
        threadId: "t2",
        labelIds: [],
        snippet: "",
        payload: { headers: [] },
      },
    });

    const result = JSON.parse(await readEmail.invoke({ id: "msg2" }));
    expect(result.from).toBe("");
    expect(result.subject).toBe("");
  });

  it("handles missing payload", async () => {
    mockGet.mockResolvedValue({
      data: {
        id: "msg3",
        threadId: "t3",
        labelIds: null,
        snippet: "",
        payload: null,
      },
    });

    const result = JSON.parse(await readEmail.invoke({ id: "msg3" }));
    expect(result.labels).toBeNull();
    expect(result.from).toBe("");
  });
});
