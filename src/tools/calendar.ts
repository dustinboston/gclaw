import { HumanMessage, tool, AIMessageChunk } from "langchain";
import { calendarAgent } from "../agents/calendar.ts";
import z from "zod";

export const manageCalendar = tool(
  async ({ request }) => {
    const stream = await calendarAgent.stream(
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

    return "Calendar request complete. Results already displayed to user.";
  },
  {
    name: "manage_calendar",
    description: `
    Manage the user's Google Calendar.
    Use this for any calendar-related request: viewing the agenda, listing events,
    scheduling meetings, or checking availability.
    Input: natural language calendar request (e.g. 'what's on my agenda today')
    `,
    schema: z.object({
      request: z.string().describe("Natural language calendar request"),
    }),
  },
);
