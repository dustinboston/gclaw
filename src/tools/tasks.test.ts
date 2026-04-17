import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockTasklistsList, mockTasksList, mockTasksPatch, mockTasksInsert } =
  vi.hoisted(() => ({
    mockTasklistsList: vi.fn(),
    mockTasksList: vi.fn(),
    mockTasksPatch: vi.fn().mockResolvedValue({}),
    mockTasksInsert: vi.fn().mockResolvedValue({}),
  }));

vi.mock("../providers/tasks.ts", () => ({
  tasks: {
    tasklists: { list: mockTasklistsList },
    tasks: {
      list: mockTasksList,
      patch: mockTasksPatch,
      insert: mockTasksInsert,
    },
  },
  tasksRequest: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock("../config.ts", () => ({
  loadConfig: () => ({ defaultTaskListId: "@default" }),
}));

import {
  tasksListTasks,
  tasksCompleteTask,
  tasksUpdateTask,
  tasksCreateTask,
} from "./tasks.ts";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tasksListTasks", () => {
  it("fetches tasks from all task lists", async () => {
    mockTasklistsList.mockResolvedValue({
      data: { items: [{ id: "list1", title: "My Tasks" }] },
    });
    mockTasksList.mockResolvedValue({
      data: {
        items: [
          {
            id: "t1",
            title: "Buy milk",
            notes: "2%",
            status: "needsAction",
            due: "2026-04-10T00:00:00.000Z",
          },
        ],
      },
    });

    const result = JSON.parse(
      await tasksListTasks.invoke({ showCompleted: false, maxResults: 100 }),
    );
    expect(result).toEqual([
      {
        id: "t1",
        list: "My Tasks",
        listId: "list1",
        title: "Buy milk",
        notes: "2%",
        status: "needsAction",
        due: "2026-04-10T00:00:00.000Z",
      },
    ]);
  });

  it("handles empty task lists", async () => {
    mockTasklistsList.mockResolvedValue({ data: { items: undefined } });
    const result = JSON.parse(
      await tasksListTasks.invoke({ showCompleted: false }),
    );
    expect(result).toEqual([]);
  });

  it("handles task lists with no tasks", async () => {
    mockTasklistsList.mockResolvedValue({
      data: { items: [{ id: "list1", title: "Empty" }] },
    });
    mockTasksList.mockResolvedValue({ data: { items: undefined } });
    const result = JSON.parse(
      await tasksListTasks.invoke({ showCompleted: false }),
    );
    expect(result).toEqual([]);
  });

  it("defaults missing notes and due to empty/null", async () => {
    mockTasklistsList.mockResolvedValue({
      data: { items: [{ id: "list1", title: "Tasks" }] },
    });
    mockTasksList.mockResolvedValue({
      data: {
        items: [{ id: "t1", title: "No details", status: "needsAction" }],
      },
    });
    const result = JSON.parse(
      await tasksListTasks.invoke({ showCompleted: false }),
    );
    expect(result[0].notes).toBe("");
    expect(result[0].due).toBeNull();
  });

  it("passes showCompleted and showHidden", async () => {
    mockTasklistsList.mockResolvedValue({
      data: { items: [{ id: "list1", title: "Tasks" }] },
    });
    mockTasksList.mockResolvedValue({ data: { items: [] } });
    await tasksListTasks.invoke({ showCompleted: true, maxResults: 50 });
    expect(mockTasksList).toHaveBeenCalledWith({
      tasklist: "list1",
      showCompleted: true,
      showHidden: true,
      maxResults: 50,
    });
  });
});

describe("tasksCompleteTask", () => {
  it("patches task with completed status", async () => {
    const result = await tasksCompleteTask.invoke({ id: "t1", listId: "list1" });
    expect(mockTasksPatch).toHaveBeenCalledWith({
      tasklist: "list1",
      task: "t1",
      requestBody: { status: "completed" },
    });
    expect(result).toBe("Task t1 marked as completed.");
  });
});

describe("tasksUpdateTask", () => {
  it("patches task with all provided fields", async () => {
    const result = await tasksUpdateTask.invoke({
      id: "t1",
      listId: "list1",
      title: "New Title",
      notes: "New notes",
      due: "2026-04-15T00:00:00.000Z",
    });
    expect(mockTasksPatch).toHaveBeenCalledWith({
      tasklist: "list1",
      task: "t1",
      requestBody: {
        title: "New Title",
        notes: "New notes",
        due: "2026-04-15T00:00:00.000Z",
      },
    });
    expect(result).toBe("Task t1 updated.");
  });

  it("only includes defined fields in the request body", async () => {
    await tasksUpdateTask.invoke({ id: "t1", listId: "list1", title: "Only title" });
    expect(mockTasksPatch).toHaveBeenCalledWith({
      tasklist: "list1",
      task: "t1",
      requestBody: { title: "Only title" },
    });
  });

  it("sends empty body when no optional fields provided", async () => {
    await tasksUpdateTask.invoke({ id: "t1", listId: "list1" });
    expect(mockTasksPatch).toHaveBeenCalledWith({
      tasklist: "list1",
      task: "t1",
      requestBody: {},
    });
  });
});

describe("tasksCreateTask", () => {
  it("inserts task into the specified list", async () => {
    const result = await tasksCreateTask.invoke({
      title: "Buy milk",
      notes: "2%",
      listId: "list1",
    });
    expect(mockTasksInsert).toHaveBeenCalledWith({
      tasklist: "list1",
      requestBody: { title: "Buy milk", notes: "2%" },
    });
    expect(result).toBe('Task "Buy milk" created successfully.');
  });

  it("uses @default when no listId provided", async () => {
    await tasksCreateTask.invoke({ title: "Something", notes: "" });
    expect(mockTasksInsert).toHaveBeenCalledWith({
      tasklist: "@default",
      requestBody: { title: "Something", notes: "" },
    });
  });
});
