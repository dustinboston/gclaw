import { describe, it, expect, vi } from "vitest";

const { mockStream } = vi.hoisted(() => ({ mockStream: vi.fn() }));

vi.mock("../agents/clean.ts", () => ({
  cleanAgent: { stream: mockStream },
}));

vi.mock("../logger.ts", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { cleanEmail } from "./clean.ts";
import { AIMessageChunk, HumanMessage } from "langchain";

describe("cleanEmail", () => {
  it("streams from the email agent and returns completion message", async () => {
    mockStream.mockReturnValue(
      (async function* () {
        yield [new AIMessageChunk({ content: "Cleaned 5 emails" })];
      })(),
    );
    const result = await cleanEmail.invoke({ request: "clean my inbox" });
    expect(mockStream).toHaveBeenCalledWith(
      { messages: [expect.any(HumanMessage)] },
      { recursionLimit: 150, streamMode: "messages" },
    );
    expect(result).toBe(
      "Email cleanup complete. Results already displayed to user.",
    );
  });

  it("skips non-AIMessageChunk messages", async () => {
    mockStream.mockReturnValue(
      (async function* () {
        yield [{ text: "not an AIMessageChunk" }];
        yield [new AIMessageChunk({ content: "real" })];
      })(),
    );
    const result = await cleanEmail.invoke({ request: "clean" });
    expect(result).toBe(
      "Email cleanup complete. Results already displayed to user.",
    );
  });

  it("handles AIMessageChunk with empty text", async () => {
    mockStream.mockReturnValue(
      (async function* () {
        yield [new AIMessageChunk({ content: "" })];
      })(),
    );
    const result = await cleanEmail.invoke({ request: "clean" });
    expect(result).toBe(
      "Email cleanup complete. Results already displayed to user.",
    );
  });

  it("handles empty stream", async () => {
    mockStream.mockReturnValue((async function* () {})());
    const result = await cleanEmail.invoke({ request: "clean" });
    expect(result).toBe(
      "Email cleanup complete. Results already displayed to user.",
    );
  });
});
