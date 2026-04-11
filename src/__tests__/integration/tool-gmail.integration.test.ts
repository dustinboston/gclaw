/**
 * Integration tests for Gmail tools → provider → audit chain.
 *
 * These tests exercise the full stack from tool invocation through
 * gmailRequest (rate limiter + withRetry + withMetrics) to the Gmail SDK,
 * with only the Google SDK methods and filesystem mocked at the boundary.
 *
 * Unlike unit tests, these do NOT mock withRetry, withMetrics, or gmailRequest.
 * The real retry logic, rate limiter, metrics, and audit logging all execute.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Boundary mocks (Google SDK + filesystem) ───────────────────────────

vi.mock("../../logger.ts", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../context.ts", () => ({
  getRequestId: () => "int-test-req",
}));

vi.mock("../../config.ts", () => ({
  loadConfig: () => ({
    googleClientId: "test-id",
    googleClientSecret: "test-secret",
    oauthRedirectUrl: "http://localhost:3000",
    gmailMaxConcurrent: 2,
    tokenEncryptionKey: "test-key",
    openaiModel: "gpt-4o",
  }),
}));

vi.mock("../../crypto.ts", () => ({
  encrypt: vi.fn((p: string) => ({ encrypted: true, data: p })),
  decrypt: vi.fn((p: any) => p.data),
  isEncrypted: vi.fn((d: any) => d?.encrypted === true),
}));

const { mockAppendFileSync } = vi.hoisted(() => ({
  mockAppendFileSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: mockAppendFileSync,
}));

// Gmail SDK mock — the lowest boundary
const { mockList, mockGet, mockModify, mockTrash, mockUntrash } = vi.hoisted(
  () => ({
    mockList: vi.fn(),
    mockGet: vi.fn(),
    mockModify: vi.fn(),
    mockTrash: vi.fn(),
    mockUntrash: vi.fn(),
  }),
);

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class OAuth2 {
        setCredentials = vi.fn();
        on = vi.fn();
      },
    },
    gmail: vi.fn().mockReturnValue({
      users: {
        messages: {
          list: mockList,
          get: mockGet,
          modify: mockModify,
          trash: mockTrash,
          untrash: mockUntrash,
        },
      },
    }),
  },
}));

// NOTE: withRetry, withMetrics, gmailRequest, audit — all REAL

import {
  listEmail,
  readEmail,
  archiveEmail,
  deleteEmail,
  spamEmail,
  unarchiveEmail,
  undeleteEmail,
  unspamEmail,
} from "../../tools/gmail.ts";
import { resetMetrics, getMetricsSummary } from "../../metrics.ts";

// ── Helpers ────────────────────────────────────────────────────────────

function fakeEmailHeaders(id: string, from: string, subject: string) {
  return {
    data: {
      id,
      threadId: `thread-${id}`,
      labelIds: ["INBOX"],
      snippet: "Preview text…",
      payload: {
        headers: [
          { name: "From", value: from },
          { name: "To", value: "me@example.com" },
          { name: "Subject", value: subject },
          { name: "Date", value: "2026-04-10T12:00:00Z" },
        ],
      },
    },
  };
}

function parseAuditLines(): Array<Record<string, unknown>> {
  return mockAppendFileSync.mock.calls
    .map((call: any[]) => {
      try {
        return JSON.parse(call[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("Tool → provider → audit integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMetrics();
  });

  // ─── listEmail ──────────────────────────────────────────────────────

  describe("listEmail", () => {
    it("lists emails through the full provider stack", async () => {
      mockList.mockResolvedValue({
        data: {
          messages: [
            { id: "msg-1", threadId: "t-1" },
            { id: "msg-2", threadId: "t-2" },
          ],
        },
      });

      const result = await listEmail.invoke({ label: "INBOX", maxResults: 10 });
      const parsed = JSON.parse(result);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe("msg-1");
      expect(mockList).toHaveBeenCalledWith({
        userId: "me",
        labelIds: ["INBOX"],
        maxResults: 10,
      });

      // Metrics recorded
      const summary = getMetricsSummary();
      expect(summary.gmail_api.calls).toBe(1);
      expect(summary.gmail_api.successes).toBe(1);
    });

    it("retries transient errors and succeeds", async () => {
      let attempt = 0;
      mockList.mockImplementation(() => {
        attempt++;
        if (attempt === 1) {
          const err: any = new Error("Rate limit");
          err.code = 429;
          throw err;
        }
        return { data: { messages: [{ id: "msg-1", threadId: "t-1" }] } };
      });

      const result = await listEmail.invoke({ label: "INBOX", maxResults: 5 });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(1);
      expect(attempt).toBe(2);
    });

    it("returns empty array when no messages", async () => {
      mockList.mockResolvedValue({ data: {} });

      const result = await listEmail.invoke({ label: "INBOX", maxResults: 10 });
      expect(JSON.parse(result)).toEqual([]);
    });
  });

  // ─── readEmail ──────────────────────────────────────────────────────

  describe("readEmail", () => {
    it("reads email metadata through the full stack", async () => {
      mockGet.mockResolvedValue(
        fakeEmailHeaders("msg-1", "alice@co.com", "Meeting tomorrow"),
      );

      const result = await readEmail.invoke({ id: "msg-1" });
      const parsed = JSON.parse(result);

      expect(parsed.id).toBe("msg-1");
      expect(parsed.from).toBe("alice@co.com");
      expect(parsed.subject).toBe("Meeting tomorrow");
      expect(parsed.labels).toEqual(["INBOX"]);

      expect(mockGet).toHaveBeenCalledWith({
        userId: "me",
        id: "msg-1",
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date", "List-Unsubscribe"],
      });
    });
  });

  // ─── archiveEmail ───────────────────────────────────────────────────

  describe("archiveEmail", () => {
    it("archives email and writes audit log", async () => {
      mockModify.mockResolvedValue({ data: {} });

      const result = await archiveEmail.invoke({
        id: "msg-1",
        subject: "Newsletter",
        from: "news@co.com",
        reason: "Unsubscribed newsletter",
      });

      expect(result).toContain("archived successfully");
      expect(mockModify).toHaveBeenCalledWith({
        userId: "me",
        id: "msg-1",
        requestBody: { removeLabelIds: ["INBOX"] },
      });

      // Audit log written
      const audits = parseAuditLines();
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        action: "archive",
        emailId: "msg-1",
        result: "success",
        subject: "Newsletter",
        from: "news@co.com",
        reason: "Unsubscribed newsletter",
        requestId: "int-test-req",
      });
    });

    it("retries a transient 503 during archive and still audits", async () => {
      let attempt = 0;
      mockModify.mockImplementation(() => {
        attempt++;
        if (attempt === 1) {
          const err: any = new Error("Service unavailable");
          err.code = 503;
          throw err;
        }
        return { data: {} };
      });

      const result = await archiveEmail.invoke({
        id: "msg-2",
        subject: "Report",
        from: "boss@co.com",
        reason: "Already reviewed",
      });

      expect(result).toContain("archived successfully");
      expect(attempt).toBe(2);

      const audits = parseAuditLines();
      expect(audits[0]).toMatchObject({
        action: "archive",
        emailId: "msg-2",
        result: "success",
      });
    });

    it("audits failure when all retries exhausted", async () => {
      mockModify.mockImplementation(() => {
        const err: any = new Error("Permanent error");
        err.code = 403;
        throw err;
      });

      await expect(
        archiveEmail.invoke({ id: "msg-3", subject: "Test", from: "a@b.com" }),
      ).rejects.toThrow("Permanent error");

      const audits = parseAuditLines();
      expect(audits[0]).toMatchObject({
        action: "archive",
        emailId: "msg-3",
        result: "failure",
      });
    });
  });

  // ─── deleteEmail ────────────────────────────────────────────────────

  describe("deleteEmail", () => {
    it("deletes email and writes audit log", async () => {
      mockTrash.mockResolvedValue({ data: {} });

      const result = await deleteEmail.invoke({
        id: "msg-4",
        subject: "Spam offer",
        from: "spam@bad.com",
        reason: "Spam",
      });

      expect(result).toContain("deleted successfully");
      expect(mockTrash).toHaveBeenCalledWith({ userId: "me", id: "msg-4" });

      const audits = parseAuditLines();
      expect(audits[0]).toMatchObject({
        action: "delete",
        emailId: "msg-4",
        result: "success",
        subject: "Spam offer",
        reason: "Spam",
      });
    });
  });

  // ─── spamEmail ──────────────────────────────────────────────────────

  describe("spamEmail", () => {
    it("marks email as spam and writes audit log", async () => {
      mockModify.mockResolvedValue({ data: {} });

      const result = await spamEmail.invoke({
        id: "msg-5",
        subject: "You won $1M",
        from: "prince@scam.com",
        reason: "Phishing attempt",
      });

      expect(result).toContain("marked as spam");
      expect(mockModify).toHaveBeenCalledWith({
        userId: "me",
        id: "msg-5",
        requestBody: {
          addLabelIds: ["SPAM"],
          removeLabelIds: ["INBOX"],
        },
      });

      const audits = parseAuditLines();
      expect(audits[0]).toMatchObject({
        action: "spam",
        emailId: "msg-5",
        result: "success",
        reason: "Phishing attempt",
      });
    });
  });

  // ─── Undo tools ─────────────────────────────────────────────────────

  describe("undo tools", () => {
    it("unarchiveEmail moves back to inbox and audits", async () => {
      mockModify.mockResolvedValue({ data: {} });

      const result = await unarchiveEmail.invoke({ id: "msg-6" });

      expect(result).toContain("moved back to inbox");
      expect(mockModify).toHaveBeenCalledWith({
        userId: "me",
        id: "msg-6",
        requestBody: { addLabelIds: ["INBOX"] },
      });

      const audits = parseAuditLines();
      expect(audits[0]).toMatchObject({
        action: "unarchive",
        emailId: "msg-6",
        result: "success",
      });
    });

    it("undeleteEmail restores from trash and audits", async () => {
      mockUntrash.mockResolvedValue({ data: {} });

      const result = await undeleteEmail.invoke({ id: "msg-7" });

      expect(result).toContain("restored from trash");

      const audits = parseAuditLines();
      expect(audits[0]).toMatchObject({
        action: "undelete",
        emailId: "msg-7",
        result: "success",
      });
    });

    it("unspamEmail removes SPAM label and audits", async () => {
      mockModify.mockResolvedValue({ data: {} });

      const result = await unspamEmail.invoke({ id: "msg-8" });

      expect(result).toContain("unmarked as spam");
      expect(mockModify).toHaveBeenCalledWith({
        userId: "me",
        id: "msg-8",
        requestBody: {
          removeLabelIds: ["SPAM"],
          addLabelIds: ["INBOX"],
        },
      });

      const audits = parseAuditLines();
      expect(audits[0]).toMatchObject({
        action: "unspam",
        emailId: "msg-8",
        result: "success",
      });
    });
  });

  // ─── Multi-operation sequences ──────────────────────────────────────

  describe("multi-operation sequences", () => {
    it("list → read → archive chain produces correct metrics", async () => {
      // Step 1: List
      mockList.mockResolvedValue({
        data: { messages: [{ id: "msg-10", threadId: "t-10" }] },
      });
      const listed = JSON.parse(
        await listEmail.invoke({ label: "INBOX", maxResults: 5 }),
      );

      // Step 2: Read
      mockGet.mockResolvedValue(
        fakeEmailHeaders("msg-10", "promo@co.com", "Spring Sale"),
      );
      const read = JSON.parse(await readEmail.invoke({ id: listed[0].id }));

      // Step 3: Archive
      mockModify.mockResolvedValue({ data: {} });
      await archiveEmail.invoke({
        id: read.id,
        subject: read.subject,
        from: read.from,
        reason: "Promotional email",
      });

      // Metrics: 3 gmail_api calls, all successful
      const summary = getMetricsSummary();
      expect(summary.gmail_api.calls).toBe(3);
      expect(summary.gmail_api.successes).toBe(3);
      expect(summary.gmail_api.failures).toBe(0);

      // Audit: only archive (read/list are not destructive)
      const audits = parseAuditLines();
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        action: "archive",
        emailId: "msg-10",
        subject: "Spring Sale",
        from: "promo@co.com",
      });
    });

    it("concurrent destructive operations are rate-limited and all audited", async () => {
      mockModify.mockResolvedValue({ data: {} });
      mockTrash.mockResolvedValue({ data: {} });

      // Fire 3 destructive operations concurrently (MAX_CONCURRENT = 2)
      const [r1, r2, r3] = await Promise.all([
        archiveEmail.invoke({
          id: "m1",
          subject: "A",
          from: "a@a.com",
          reason: "cleanup",
        }),
        deleteEmail.invoke({
          id: "m2",
          subject: "B",
          from: "b@b.com",
          reason: "spam",
        }),
        spamEmail.invoke({
          id: "m3",
          subject: "C",
          from: "c@c.com",
          reason: "phishing",
        }),
      ]);

      expect(r1).toContain("archived");
      expect(r2).toContain("deleted");
      expect(r3).toContain("marked as spam");

      // All 3 audited
      const audits = parseAuditLines();
      expect(audits).toHaveLength(3);
      const actions = audits.map((a) => a.action).sort();
      expect(actions).toEqual(["archive", "delete", "spam"]);

      // Metrics: 3 calls
      const summary = getMetricsSummary();
      expect(summary.gmail_api.calls).toBe(3);
    });
  });
});
