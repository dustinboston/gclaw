import { tool } from "langchain";
import z from "zod";
import { calendar } from "../providers/calendar.ts";

export const listEvents = tool(
  async ({ timeMin, timeMax, maxResults }) => {
    const calendarsRes = await calendar.calendarList.list();
    const calendarIds = (calendarsRes.data.items ?? []).map((c) => c.id!);

    const allEvents = await Promise.all(
      calendarIds.map(async (calendarId) => {
        const res = await calendar.events.list({
          calendarId,
          timeMin,
          timeMax,
          maxResults,
          singleEvents: true,
          orderBy: "startTime",
        });
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
    await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary,
        description,
        start: { dateTime: startDateTime },
        end: { dateTime: endDateTime },
      },
    });
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
