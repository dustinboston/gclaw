import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPlanStream, mockExecuteStream } = vi.hoisted(() => ({
  mockPlanStream: vi.fn(),
  mockExecuteStream: vi.fn(),
}));

vi.mock("../agents/clean.ts", () => ({
  createCleanAgent: vi.fn((mode: string) => ({
    stream: mode === "plan" ? mockPlanStream : mockExecuteStream,
  })),
}));

vi.mock("../logger.ts", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock readline for confirmation
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

import { cleanEmail } from "./clean.ts";
import { AIMessageChunk, HumanMessage } from "langchain";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cleanEmail", () => {
  it("proposes a plan, confirms, then executes", async () => {
    mockPlanStream.mockReturnValue(
      (async function* () {
        yield [new AIMessageChunk({ content: "=== Proposed Plan ===\n- [Delete] \"Newsletter\" from news@co.com — newsletter" })];
      })(),
    );
    mockQuestion.mockResolvedValue("yes");
    mockExecuteStream.mockReturnValue(
      (async function* () {
        yield [new AIMessageChunk({ content: "Deleted: 1" })];
      })(),
    );

    const result = await cleanEmail.invoke({ request: "clean my inbox" });
    expect(mockPlanStream).toHaveBeenCalled();
    expect(mockQuestion).toHaveBeenCalledWith("Execute this plan? (yes/no): ");
    expect(mockExecuteStream).toHaveBeenCalled();
    expect(result).toBe("Email cleanup complete. Results already displayed to user.");
  });

  it("cancels when user rejects the plan", async () => {
    mockPlanStream.mockReturnValue(
      (async function* () {
        yield [new AIMessageChunk({ content: "=== Proposed Plan ===\n- [Delete] \"Spam\" from bad@co.com" })];
      })(),
    );
    mockQuestion.mockResolvedValue("no");

    const result = await cleanEmail.invoke({ request: "clean my inbox" });
    expect(mockPlanStream).toHaveBeenCalled();
    expect(mockExecuteStream).not.toHaveBeenCalled();
    expect(result).toBe("Email cleanup cancelled by user.");
  });

  it("returns early when plan is empty", async () => {
    mockPlanStream.mockReturnValue(
      (async function* () {
        yield [new AIMessageChunk({ content: "" })];
      })(),
    );

    const result = await cleanEmail.invoke({ request: "clean" });
    expect(result).toBe("No emails to process.");
    expect(mockQuestion).not.toHaveBeenCalled();
    expect(mockExecuteStream).not.toHaveBeenCalled();
  });

  it("handles errors gracefully", async () => {
    mockPlanStream.mockImplementation(() => {
      throw new Error("API down");
    });

    const result = await cleanEmail.invoke({ request: "clean" });
    expect(result).toBe("Email cleanup failed: API down");
  });
});
