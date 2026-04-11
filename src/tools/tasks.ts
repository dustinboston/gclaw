import { HumanMessage, tool, AIMessageChunk } from "langchain";
import z from "zod";
import { tasks, tasksRequest } from "../providers/tasks.ts";
import { loadConfig } from "../config.ts";
import { logger } from "../logger.ts";

export const manageTasks = tool(
  async ({ request }) => {
    try {
      const { tasksAgent } = await import("../agents/tasks.ts");
      const stream = await tasksAgent.stream(
        { messages: [new HumanMessage(request)] },
        { recursionLimit: 50, streamMode: "messages" },
      );

      let lastText = "";

      for await (const [message] of stream) {
        if (!(message instanceof AIMessageChunk)) continue;
        if (message.text) {
          lastText += message.text;
        }
      }

      if (lastText) process.stdout.write("\n");
      return "Task request complete. Results already displayed to user.";
    } catch (error) {
      logger.error({ err: error }, "Tasks agent failed");
      return `Task request failed: ${(error as Error).message}`;
    }
  },
  {
    name: "manage_tasks",
    description: `
    Manage the user's tasks using Google Tasks.
    Use this for any task-related request: listing tasks, creating new tasks,
    completing tasks, or doing a weekly review.
    Input: natural language task request (e.g. 'list my top 5 tasks')
    `,
    schema: z.object({
      request: z.string().describe("Natural language task request"),
    }),
  },
);

export const listTasks = tool(
  async ({ showCompleted, maxResults }) => {
    const listsRes = await tasksRequest(() => tasks.tasklists.list());
    const taskLists = listsRes.data.items ?? [];

    const allTasks = await Promise.all(
      taskLists.map(async (tl) => {
        const res = await tasksRequest(() =>
          tasks.tasks.list({
            tasklist: tl.id!,
            showCompleted,
            showHidden: showCompleted,
            maxResults,
          }),
        );
        return (res.data.items ?? []).map((t) => ({
          id: t.id,
          list: tl.title,
          listId: tl.id,
          title: t.title,
          notes: t.notes ?? "",
          status: t.status,
          due: t.due ?? null,
        }));
      }),
    );

    return JSON.stringify(allTasks.flat());
  },
  {
    name: "list_tasks",
    description:
      "List tasks from Google Tasks. Returns tasks with id, title, notes, status, and due date.",
    schema: z.object({
      showCompleted: z
        .boolean()
        .default(false)
        .describe("Whether to include completed tasks"),
      maxResults: z
        .number()
        .default(100)
        .describe("Maximum number of tasks to return"),
    }),
  },
);

export const completeTask = tool(
  async ({ id, listId }) => {
    await tasksRequest(() =>
      tasks.tasks.patch({
        tasklist: listId,
        task: id,
        requestBody: {
          status: "completed",
        },
      }),
    );
    return `Task ${id} marked as completed.`;
  },
  {
    name: "complete_task",
    description:
      "Mark a task as completed in Google Tasks. Requires id and listId from list_tasks.",
    schema: z.object({
      id: z.string().describe("The task ID from list_tasks"),
      listId: z.string().describe("The task list ID from list_tasks"),
    }),
  },
);

export const updateTask = tool(
  async ({ id, listId, title, notes, due }) => {
    const body: Record<string, string> = {};
    if (title !== undefined) body.title = title;
    if (notes !== undefined) body.notes = notes;
    if (due !== undefined) body.due = due;
    await tasksRequest(() =>
      tasks.tasks.patch({
        tasklist: listId,
        task: id,
        requestBody: body,
      }),
    );
    return `Task ${id} updated.`;
  },
  {
    name: "update_task",
    description:
      "Update an existing task's title, notes, or due date. Requires id and listId from list_tasks.",
    schema: z.object({
      id: z.string().describe("The task ID from list_tasks"),
      listId: z.string().describe("The task list ID from list_tasks"),
      title: z.string().optional().describe("New title for the task"),
      notes: z.string().optional().describe("New notes for the task"),
      due: z.string().optional().describe("New due date in ISO 8601 format (e.g. 2026-04-10T00:00:00.000Z)"),
    }),
  },
);

export const createTask = tool(
  async ({ title, notes, listId }) => {
    const config = loadConfig();
    await tasksRequest(() =>
      tasks.tasks.insert({
        tasklist: listId ?? config.defaultTaskListId,
        requestBody: {
          title,
          notes,
        },
      }),
    );
    return `Task "${title}" created successfully.`;
  },
  {
    name: "create_task",
    description:
      "Create a task in Google Tasks. Use this when an action item needs to be tracked.",
    schema: z.object({
      title: z.string().describe("Short title for the task"),
      notes: z
        .string()
        .describe("Additional details or context for the task"),
      listId: z
        .string()
        .optional()
        .describe("Task list ID to add to (from list_tasks). Defaults to the user's default list."),
    }),
  },
);
