import { describe, it, expect, vi } from "vitest";

const { mockStream } = vi.hoisted(() => ({ mockStream: vi.fn() }));

vi.mock("../agents/tasks.ts", () => ({
  tasksAgent: { stream: mockStream },
}));

import { manageTasks } from "./tasks.ts";
import { AIMessageChunk, HumanMessage } from "langchain";

describe("manageTasks", () => {
  it("streams from tasks agent and returns completion message", async () => {
    mockStream.mockReturnValue(
      (async function* () {
        yield [new AIMessageChunk({ content: "Here are your tasks..." })];
      })(),
    );
    const result = await manageTasks.invoke({ request: "list my tasks" });
    expect(mockStream).toHaveBeenCalledWith(
      { messages: [expect.any(HumanMessage)] },
      { recursionLimit: 50, streamMode: "messages" },
    );
    expect(result).toBe(
      "Task request complete. Results already displayed to user.",
    );
  });

  it("handles AIMessageChunk with empty text", async () => {
    mockStream.mockReturnValue(
      (async function* () {
        yield [new AIMessageChunk({ content: "" })];
      })(),
    );
    const result = await manageTasks.invoke({ request: "tasks" });
    expect(result).toBe(
      "Task request complete. Results already displayed to user.",
    );
  });

  it("skips non-AIMessageChunk messages", async () => {
    mockStream.mockReturnValue(
      (async function* () {
        yield [{ text: "not a chunk" }];
      })(),
    );
    const result = await manageTasks.invoke({ request: "tasks" });
    expect(result).toBe(
      "Task request complete. Results already displayed to user.",
    );
  });
});
