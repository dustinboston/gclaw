import { HumanMessage, tool, AIMessageChunk } from "langchain";
import z from "zod";
import { calendar, calendarRequest } from "../providers/calendar.ts";
import { loadConfig } from "../config.ts";
import { logger } from "../logger.ts";

export const manageCalendar = tool(
  async ({ request }) => {
    try {
      const { calendarAgent } = await import("../agents/calendar.ts");
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

      if (lastText) process.stdout.write("\n");
      return "Calendar request complete. Results already displayed to user.";
    } catch (error) {
      logger.error({ err: error }, "Calendar agent failed");
      return `Calendar request failed: ${(error as Error).message}`;
    }
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

export const listEvents = tool(
  async ({ timeMin, timeMax, maxResults }) => {
    const calendarsRes = await calendarRequest(() =>
      calendar.calendarList.list(),
    );
    const calendarIds = (calendarsRes.data.items ?? []).map((c) => c.id!);

    const allEvents = await Promise.all(
      calendarIds.map(async (calendarId) => {
        const res = await calendarRequest(() =>
          calendar.events.list({
            calendarId,
            timeMin,
            timeMax,
            maxResults,
            singleEvents: true,
            orderBy: "startTime",
          }),
        );
        return (res.data.items ?? []).map((e) => ({
          id: e.id,
          calendar: e.organizer?.displayName ?? calendarId,
          summary: e.summary,
          start: e.start?.dateTime ?? e.start?.date,
          end: e.end?.dateTime ?? e.end?.date,
        }));
      }),
    );

    const events = allEvents.flat().sort((a, b) =>
      (a.start ?? "").localeCompare(b.start ?? ""),
    );

    return JSON.stringify(events);
  },
  {
    name: "list_events",
    description:
      "List upcoming Google Calendar events in a time range. Use this to find open slots before creating an event.",
    schema: z.object({
      timeMin: z
        .string()
        .describe("Start of time range in ISO 8601 format with timezone offset (e.g. 2026-04-09T00:00:00-07:00). Never use Z/UTC."),
      timeMax: z
        .string()
        .describe("End of time range in ISO 8601 format with timezone offset (e.g. 2026-04-10T00:00:00-07:00). Never use Z/UTC."),
      maxResults: z
        .number()
        .default(20)
        .describe("Maximum number of events to return"),
    }),
  },
);

export const createEvent = tool(
  async ({ summary, description, startDateTime, endDateTime }) => {
    const config = loadConfig();
    await calendarRequest(() =>
      calendar.events.insert({
        calendarId: config.defaultCalendarId,
        requestBody: {
          summary,
          description,
          start: { dateTime: startDateTime },
          end: { dateTime: endDateTime },
        },
      }),
    );
    return `Event "${summary}" created successfully.`;
  },
  {
    name: "create_event",
    description:
      "Create a Google Calendar event. Use list_events first to check for conflicts.",
    schema: z.object({
      summary: z.string().describe("Title of the event"),
      description: z
        .string()
        .describe("Details or context for the event"),
      startDateTime: z
        .string()
        .describe("Start time in ISO 8601 format (e.g. 2026-04-09T10:00:00-07:00)"),
      endDateTime: z
        .string()
        .describe("End time in ISO 8601 format (e.g. 2026-04-09T11:00:00-07:00)"),
    }),
  },
);
