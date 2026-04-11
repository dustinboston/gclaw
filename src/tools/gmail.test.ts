import { describe, it, expect, vi } from "vitest";

const { mockStream, mockList, mockGet, mockModify, mockTrash, mockUntrash } = vi.hoisted(() => ({
  mockStream: vi.fn(),
  mockList: vi.fn(),
  mockGet: vi.fn(),
  mockModify: vi.fn().mockResolvedValue({}),
  mockTrash: vi.fn().mockResolvedValue({}),
  mockUntrash: vi.fn().mockResolvedValue({}),
}));

vi.mock("../agents/email.ts", () => ({
  emailAgent: { stream: mockStream },
}));

vi.mock("../providers/gmail.ts", () => ({
  gmail: {
    users: {
      messages: {
        list: mockList,
        get: mockGet,
        modify: mockModify,
        trash: mockTrash,
        untrash: mockUntrash,
      },
    },
  },
  gmailRequest: vi.fn((fn: () => any) => fn()),
}));

const { mockLogAudit } = vi.hoisted(() => ({
  mockLogAudit: vi.fn(),
}));

vi.mock("../audit.ts", () => ({
  logAudit: mockLogAudit,
}));

vi.mock("../logger.ts", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  manageEmail,
  listEmail,
  readEmail,
  archiveEmail,
  deleteEmail,
  spamEmail,
  unarchiveEmail,
  undeleteEmail,
  unspamEmail,
} from "./gmail.ts";
import { AIMessageChunk, HumanMessage } from "langchain";

describe("manageEmail", () => {
  it("streams from the email agent and returns completion message", async () => {
    mockStream.mockReturnValue(
      (async function* () {
        yield [new AIMessageChunk({ content: "Processed 5 emails" })];
      })(),
    );
    const result = await manageEmail.invoke({ request: "clean my inbox" });
    expect(mockStream).toHaveBeenCalledWith(
      { messages: [expect.any(HumanMessage)] },
      { recursionLimit: 150, streamMode: "messages" },
    );
    expect(result).toBe(
      "Email request complete. Results already displayed to user.",
    );
  });

  it("handles AIMessageChunk with empty text", async () => {
    mockStream.mockReturnValue(
      (async function* () {
        yield [new AIMessageChunk({ content: "" })];
      })(),
    );
    const result = await manageEmail.invoke({ request: "emails" });
    expect(result).toBe(
      "Email request complete. Results already displayed to user.",
    );
  });

  it("skips non-AIMessageChunk messages", async () => {
    mockStream.mockReturnValue(
      (async function* () {
        yield [{ text: "not a chunk" }];
      })(),
    );
    const result = await manageEmail.invoke({ request: "emails" });
    expect(result).toBe(
      "Email request complete. Results already displayed to user.",
    );
  });
});

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
  it("removes INBOX label and logs audit with metadata", async () => {
    const result = await archiveEmail.invoke({
      id: "msg1",
      subject: "Newsletter",
      from: "news@example.com",
      reason: "Newsletter — no reference value",
    });
    expect(mockModify).toHaveBeenCalledWith({
      userId: "me",
      id: "msg1",
      requestBody: { removeLabelIds: ["INBOX"] },
    });
    expect(result).toBe("Email msg1 archived successfully.");
    expect(mockLogAudit).toHaveBeenCalledWith("archive", "msg1", "success", {
      subject: "Newsletter",
      from: "news@example.com",
      reason: "Newsletter — no reference value",
    });
  });

  it("works without optional metadata", async () => {
    const result = await archiveEmail.invoke({ id: "msg2" });
    expect(result).toBe("Email msg2 archived successfully.");
    expect(mockLogAudit).toHaveBeenCalledWith("archive", "msg2", "success", {
      subject: undefined,
      from: undefined,
      reason: undefined,
    });
  });
});

describe("deleteEmail", () => {
  it("moves message to trash and logs audit with metadata", async () => {
    const result = await deleteEmail.invoke({
      id: "msg1",
      subject: "Sale!",
      from: "promo@shop.com",
      reason: "Promotion",
    });
    expect(mockTrash).toHaveBeenCalledWith({ userId: "me", id: "msg1" });
    expect(result).toBe("Email msg1 deleted successfully.");
    expect(mockLogAudit).toHaveBeenCalledWith("delete", "msg1", "success", {
      subject: "Sale!",
      from: "promo@shop.com",
      reason: "Promotion",
    });
  });
});

describe("spamEmail", () => {
  it("adds SPAM label and removes INBOX label and logs audit with metadata", async () => {
    const result = await spamEmail.invoke({
      id: "msg1",
      subject: "You won!",
      from: "scam@bad.com",
      reason: "Phishing attempt",
    });
    expect(mockModify).toHaveBeenCalledWith({
      userId: "me",
      id: "msg1",
      requestBody: {
        addLabelIds: ["SPAM"],
        removeLabelIds: ["INBOX"],
      },
    });
    expect(result).toBe("Email msg1 marked as spam successfully.");
    expect(mockLogAudit).toHaveBeenCalledWith("spam", "msg1", "success", {
      subject: "You won!",
      from: "scam@bad.com",
      reason: "Phishing attempt",
    });
  });
});

describe("unarchiveEmail", () => {
  it("adds INBOX label back and logs audit", async () => {
    const result = await unarchiveEmail.invoke({ id: "msg1" });
    expect(mockModify).toHaveBeenCalledWith({
      userId: "me",
      id: "msg1",
      requestBody: { addLabelIds: ["INBOX"] },
    });
    expect(result).toBe("Email msg1 moved back to inbox.");
    expect(mockLogAudit).toHaveBeenCalledWith("unarchive", "msg1", "success");
  });
});

describe("undeleteEmail", () => {
  it("restores message from trash and logs audit", async () => {
    const result = await undeleteEmail.invoke({ id: "msg1" });
    expect(mockUntrash).toHaveBeenCalledWith({ userId: "me", id: "msg1" });
    expect(result).toBe("Email msg1 restored from trash.");
    expect(mockLogAudit).toHaveBeenCalledWith("undelete", "msg1", "success");
  });
});

describe("unspamEmail", () => {
  it("removes SPAM label and adds INBOX label and logs audit", async () => {
    const result = await unspamEmail.invoke({ id: "msg1" });
    expect(mockModify).toHaveBeenCalledWith({
      userId: "me",
      id: "msg1",
      requestBody: {
        removeLabelIds: ["SPAM"],
        addLabelIds: ["INBOX"],
      },
    });
    expect(result).toBe("Email msg1 unmarked as spam and moved back to inbox.");
    expect(mockLogAudit).toHaveBeenCalledWith("unspam", "msg1", "success");
  });
});
