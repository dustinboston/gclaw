import { describe, it, expect, vi } from "vitest";

const { mockStream } = vi.hoisted(() => ({ mockStream: vi.fn() }));

vi.mock("../agents/calendar.ts", () => ({
  calendarAgent: { stream: mockStream },
}));

import { manageCalendar } from "./calendar.ts";
import { AIMessageChunk, HumanMessage } from "langchain";

describe("manageCalendar", () => {
  it("streams from calendar agent and returns completion message", async () => {
    mockStream.mockReturnValue(
      (async function* () {
        yield [new AIMessageChunk({ content: "Your agenda..." })];
      })(),
    );
    const result = await manageCalendar.invoke({ request: "show my agenda" });
    expect(mockStream).toHaveBeenCalledWith(
      { messages: [expect.any(HumanMessage)] },
      { recursionLimit: 50, streamMode: "messages" },
    );
    expect(result).toBe(
      "Calendar request complete. Results already displayed to user.",
    );
  });

  it("handles AIMessageChunk with empty text", async () => {
    mockStream.mockReturnValue(
      (async function* () {
        yield [new AIMessageChunk({ content: "" })];
      })(),
    );
    const result = await manageCalendar.invoke({ request: "agenda" });
    expect(result).toBe(
      "Calendar request complete. Results already displayed to user.",
    );
  });

  it("skips non-AIMessageChunk messages", async () => {
    mockStream.mockReturnValue(
      (async function* () {
        yield [{ text: "not a chunk" }];
      })(),
    );
    const result = await manageCalendar.invoke({ request: "agenda" });
    expect(result).toBe(
      "Calendar request complete. Results already displayed to user.",
    );
  });
});
