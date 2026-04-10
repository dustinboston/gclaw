import { describe, it, expect, vi } from "vitest";

const { mockList, mockGet, mockModify, mockTrash } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockGet: vi.fn(),
  mockModify: vi.fn().mockResolvedValue({}),
  mockTrash: vi.fn().mockResolvedValue({}),
}));

vi.mock("../providers/gmail.ts", () => ({
  gmail: {
    users: {
      messages: {
        list: mockList,
        get: mockGet,
        modify: mockModify,
        trash: mockTrash,
      },
    },
  },
  gmailRequest: vi.fn((fn: () => any) => fn()),
}));

import {
  listEmail,
  readEmail,
  archiveEmail,
  deleteEmail,
  spamEmail,
} from "./gmail.ts";

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

describe("deleteEmail", () => {
  it("moves message to trash", async () => {
    const result = await deleteEmail.invoke({ id: "msg1" });
    expect(mockTrash).toHaveBeenCalledWith({ userId: "me", id: "msg1" });
    expect(result).toBe("Email msg1 deleted successfully.");
  });
});

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
