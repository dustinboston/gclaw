import { describe, it, expect, vi } from "vitest";

const {
  MockAIMessageChunk,
  mockAgentStream,
  mockRlQuestion,
  mockRlClose,
  mockStdoutWrite,
} = vi.hoisted(() => {
  class MockAIMessageChunk {
    text: string;
    constructor({ content }: { content: string }) {
      this.text = content;
    }
  }

  return {
    MockAIMessageChunk,
    mockAgentStream: vi.fn().mockImplementation(() =>
      (async function* () {
        const msg = Object.assign(
          Object.create(MockAIMessageChunk.prototype),
          { text: "response" },
        );
        yield [msg];
      })(),
    ),
    mockRlQuestion: vi
      .fn()
      .mockResolvedValueOnce("hello")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("exit"),
    mockRlClose: vi.fn(),
    mockStdoutWrite: vi.fn(),
  };
});

vi.mock("dotenv/config", () => ({}));
vi.mock("@langchain/langgraph", () => ({
  MemorySaver: class MemorySaver {},
}));
vi.mock("langchain", () => ({
  createAgent: vi.fn().mockReturnValue({ stream: mockAgentStream }),
  HumanMessage: class HumanMessage {
    constructor(public content: string) {}
  },
  AIMessageChunk: MockAIMessageChunk,
}));
vi.mock("./tools/clean.ts", () => ({ cleanEmail: {} }));
vi.mock("./tools/gmail.ts", () => ({
  manageEmail: {},
  listEmail: {},
  readEmail: {},
  archiveEmail: {},
  deleteEmail: {},
  spamEmail: {},
}));
vi.mock("./tools/calendar.ts", () => ({
  manageCalendar: {},
  listEvents: {},
  createEvent: {},
}));
vi.mock("./tools/tasks.ts", () => ({
  manageTasks: {},
  listTasks: {},
  completeTask: {},
  updateTask: {},
  createTask: {},
}));
vi.mock("./model.ts", () => ({ model: {} }));
vi.mock("./agents-file.ts", () => ({
  loadAgentsFile: vi.fn().mockResolvedValue("agent file content"),
}));
vi.mock("./logger.ts", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn().mockReturnValue({
    question: mockRlQuestion,
    close: mockRlClose,
  }),
}));

const originalWrite = process.stdout.write;
process.stdout.write = mockStdoutWrite as any;

await import("./index.ts");

process.stdout.write = originalWrite;

describe("supervisor agent (index.ts)", () => {
  it("streams response for non-empty input", () => {
    expect(mockAgentStream).toHaveBeenCalledTimes(1);
    expect(mockStdoutWrite).toHaveBeenCalledWith("response");
  });

  it("skips empty input", () => {
    // Only 1 stream call despite 3 question calls (empty is skipped, exit breaks)
    expect(mockAgentStream).toHaveBeenCalledTimes(1);
  });

  it("closes readline on exit", () => {
    expect(mockRlClose).toHaveBeenCalled();
  });
});
