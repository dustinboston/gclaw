/**
 * Integration tests for the clean email two-phase confirmation flow.
 *
 * Tests the cleanEmail tool's orchestration: plan → confirm → execute.
 * The agent boundary is mocked (since LangGraph requires a real LLM for
 * tool calling), but the streaming logic, confirmation flow, and error
 * handling all execute for real.
 *
 * This complements:
 * - clean.test.ts (unit): mocks everything, tests individual branches
 * - tool-gmail.integration.test.ts: tests tool → provider → audit chain
 *
 * Here we test the coordination between phases and verify that the
 * confirmation gate actually prevents execution when rejected.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Agent mock — returns scripted tool-call and text streams ───────────

const { mockPlanStream, mockExecuteStream } = vi.hoisted(() => ({
  mockPlanStream: vi.fn(),
  mockExecuteStream: vi.fn(),
}));

vi.mock("../../agents/clean.ts", () => ({
  createCleanAgent: vi.fn((mode: string) => ({
    stream: mode === "plan" ? mockPlanStream : mockExecuteStream,
  })),
}));

vi.mock("../../logger.ts", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Readline mock for confirmation
const { mockQuestion, mockClose } = vi.hoisted(() => ({
  mockQuestion: vi.fn(),
  mockClose: vi.fn(),
}));

vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn(() => ({
    question: mockQuestion,
    close: mockClose,
  })),
}));

import { cleanEmail } from "../../tools/clean.ts";
import { createCleanAgent } from "../../agents/clean.ts";
import { AIMessageChunk, HumanMessage } from "langchain";

// ── Helpers ────────────────────────────────────────────────────────────

function makeStream(chunks: string[]) {
  return (async function* () {
    for (const chunk of chunks) {
      yield [new AIMessageChunk({ content: chunk })];
    }
  })();
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("Clean email flow integration", () => {
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutSpy.mockClear();
  });

  it("full happy path: plan → user confirms → execute", async () => {
    const planText =
      '=== Proposed Plan ===\n- [Delete] "Newsletter" from news@co.com — newsletter\n- [Archive] "Receipt" from shop@co.com — receipt\n\nSummary: 1 archive, 1 delete';
    mockPlanStream.mockReturnValue(makeStream([planText]));
    mockQuestion.mockResolvedValue("yes");
    mockExecuteStream.mockReturnValue(
      makeStream(["Deleted: 1\nArchived: 1"]),
    );

    const result = await cleanEmail.invoke({ request: "clean up my inbox" });

    // Plan agent was created with "plan" mode
    expect(createCleanAgent).toHaveBeenCalledWith("plan");

    // Plan was displayed to user via stdout
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining("=== Proposed Plan ==="),
    );

    // User was asked to confirm
    expect(mockQuestion).toHaveBeenCalledWith("Execute this plan? (yes/no): ");

    // Execute agent was created with "execute" mode
    expect(createCleanAgent).toHaveBeenCalledWith("execute");

    // Final result
    expect(result).toBe(
      "Email cleanup complete. Results already displayed to user.",
    );
  });

  it("plan → user rejects → no execution", async () => {
    mockPlanStream.mockReturnValue(
      makeStream(['=== Proposed Plan ===\n- [Spam] "Phishing" from bad@co.com']),
    );
    mockQuestion.mockResolvedValue("no");

    const result = await cleanEmail.invoke({ request: "clean inbox" });

    expect(createCleanAgent).toHaveBeenCalledWith("plan");
    expect(createCleanAgent).not.toHaveBeenCalledWith("execute");
    expect(mockExecuteStream).not.toHaveBeenCalled();
    expect(result).toBe("Email cleanup cancelled by user.");
  });

  it("empty plan short-circuits without asking for confirmation", async () => {
    mockPlanStream.mockReturnValue(makeStream(["", "  "]));

    const result = await cleanEmail.invoke({ request: "clean" });

    expect(result).toBe("No emails to process.");
    expect(mockQuestion).not.toHaveBeenCalled();
    expect(mockExecuteStream).not.toHaveBeenCalled();
  });

  it("plan agent failure returns error message without crashing", async () => {
    mockPlanStream.mockImplementation(() => {
      throw new Error("Google API quota exceeded");
    });

    const result = await cleanEmail.invoke({ request: "clean inbox" });

    expect(result).toBe(
      "Email cleanup failed: Google API quota exceeded",
    );
    expect(mockQuestion).not.toHaveBeenCalled();
    expect(mockExecuteStream).not.toHaveBeenCalled();
  });

  it("execute agent failure after confirmation returns error", async () => {
    mockPlanStream.mockReturnValue(
      makeStream(["=== Plan ===\n- [Delete] some email"]),
    );
    mockQuestion.mockResolvedValue("y");
    mockExecuteStream.mockImplementation(() => {
      throw new Error("Token expired");
    });

    const result = await cleanEmail.invoke({ request: "clean" });

    expect(result).toBe("Email cleanup failed: Token expired");
  });

  it("streamed plan is accumulated across multiple chunks", async () => {
    mockPlanStream.mockReturnValue(
      makeStream([
        "=== Proposed Plan ===\n",
        '- [Archive] "Email 1" from a@co.com\n',
        '- [Delete] "Email 2" from b@co.com\n',
        "Summary: 1 archive, 1 delete",
      ]),
    );
    mockQuestion.mockResolvedValue("yes");
    mockExecuteStream.mockReturnValue(makeStream(["Done"]));

    const result = await cleanEmail.invoke({ request: "clean inbox" });

    expect(result).toBe(
      "Email cleanup complete. Results already displayed to user.",
    );

    // The accumulated plan should have been displayed
    const displayedText = stdoutSpy.mock.calls
      .map((c: any[]) => c[0])
      .join("");
    expect(displayedText).toContain("=== Proposed Plan ===");
    expect(displayedText).toContain("Email 1");
    expect(displayedText).toContain("Email 2");
  });

  it("various affirmative answers are accepted", async () => {
    for (const answer of ["yes", "Yes", "YES", "y", "Y", "yeah"]) {
      vi.clearAllMocks();
      mockPlanStream.mockReturnValue(makeStream(["Plan: do stuff"]));
      mockQuestion.mockResolvedValue(answer);
      mockExecuteStream.mockReturnValue(makeStream(["Done"]));

      const result = await cleanEmail.invoke({ request: "clean" });
      expect(result).toBe(
        "Email cleanup complete. Results already displayed to user.",
      );
    }
  });

  it("non-yes answers reject the plan", async () => {
    for (const answer of ["no", "No", "nah", "cancel", ""]) {
      vi.clearAllMocks();
      mockPlanStream.mockReturnValue(makeStream(["Plan: do stuff"]));
      mockQuestion.mockResolvedValue(answer);

      const result = await cleanEmail.invoke({ request: "clean" });
      expect(result).toBe("Email cleanup cancelled by user.");
      expect(mockExecuteStream).not.toHaveBeenCalled();
    }
  });
});
