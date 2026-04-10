import { HumanMessage, tool, AIMessageChunk } from "langchain";
import { tasksAgent } from "../agents/tasks.ts";
import z from "zod";

export const manageTasks = tool(
  async ({ request }) => {
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

    return "Task request complete. Results already displayed to user.";
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
