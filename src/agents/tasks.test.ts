import { describe, it, expect, vi } from "vitest";

const { mockCreateAgent } = vi.hoisted(() => ({
  mockCreateAgent: vi.fn().mockReturnValue({ stream: vi.fn() }),
}));

vi.mock("langchain", () => ({ createAgent: mockCreateAgent }));
vi.mock("../model.ts", () => ({ model: {} }));
vi.mock("../tools/tasks.ts", () => ({
  listTasks: { name: "list_tasks" },
  completeTask: { name: "complete_task" },
  updateTask: { name: "update_task" },
  createTask: { name: "create_task" },
}));

import { tasksAgent } from "./tasks.ts";

describe("tasksAgent", () => {
  it("is created via createAgent", () => {
    expect(mockCreateAgent).toHaveBeenCalledTimes(1);
    expect(tasksAgent).toBeDefined();
  });

  it("has the correct tools", () => {
    const call = mockCreateAgent.mock.calls[0][0];
    const names = call.tools.map((t: any) => t.name);
    expect(names).toEqual([
      "list_tasks",
      "update_task",
      "complete_task",
      "create_task",
    ]);
  });

  it("has a system prompt with GTD instructions", () => {
    const call = mockCreateAgent.mock.calls[0][0];
    expect(call.systemPrompt).toContain("task management assistant");
    expect(call.systemPrompt).toContain("GTD");
  });

  it("includes today's date in the system prompt", () => {
    const call = mockCreateAgent.mock.calls[0][0];
    expect(call.systemPrompt).toContain("Today's date is");
  });
});
