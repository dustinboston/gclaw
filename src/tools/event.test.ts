import { describe, it, expect, vi } from "vitest";

const { mockCalendarListList, mockEventsList, mockEventsInsert } = vi.hoisted(
  () => ({
    mockCalendarListList: vi.fn(),
    mockEventsList: vi.fn(),
    mockEventsInsert: vi.fn().mockResolvedValue({}),
  }),
);

vi.mock("../providers/calendar.ts", () => ({
  calendar: {
    calendarList: { list: mockCalendarListList },
    events: { list: mockEventsList, insert: mockEventsInsert },
  },
}));

import { listEvents, createEvent } from "./event.ts";

describe("listEvents", () => {
  it("fetches events from all calendars and sorts by start time", async () => {
    mockCalendarListList.mockResolvedValue({
      data: { items: [{ id: "cal1" }, { id: "cal2" }] },
    });
    mockEventsList
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "e2",
              organizer: { displayName: "Work" },
              summary: "Lunch",
              start: { dateTime: "2026-04-09T12:00:00-07:00" },
              end: { dateTime: "2026-04-09T13:00:00-07:00" },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "e1",
              organizer: {},
              summary: "Standup",
              start: { dateTime: "2026-04-09T09:00:00-07:00" },
              end: { dateTime: "2026-04-09T09:30:00-07:00" },
            },
          ],
        },
      });

    const result = JSON.parse(
      await listEvents.invoke({
        timeMin: "2026-04-09T00:00:00-07:00",
        timeMax: "2026-04-10T00:00:00-07:00",
        maxResults: 20,
      }),
    );

    expect(result).toHaveLength(2);
    expect(result[0].summary).toBe("Standup");
    expect(result[1].summary).toBe("Lunch");
  });

  it("handles empty calendar list", async () => {
    mockCalendarListList.mockResolvedValue({ data: { items: undefined } });
    const result = JSON.parse(
      await listEvents.invoke({
        timeMin: "2026-04-09T00:00:00-07:00",
        timeMax: "2026-04-10T00:00:00-07:00",
      }),
    );
    expect(result).toEqual([]);
  });

  it("handles calendars with no events", async () => {
    mockCalendarListList.mockResolvedValue({
      data: { items: [{ id: "cal1" }] },
    });
    mockEventsList.mockResolvedValue({ data: { items: undefined } });
    const result = JSON.parse(
      await listEvents.invoke({
        timeMin: "2026-04-09T00:00:00-07:00",
        timeMax: "2026-04-10T00:00:00-07:00",
      }),
    );
    expect(result).toEqual([]);
  });

  it("uses date fallback for all-day events", async () => {
    mockCalendarListList.mockResolvedValue({
      data: { items: [{ id: "cal1" }] },
    });
    mockEventsList.mockResolvedValue({
      data: {
        items: [
          {
            id: "e1",
            organizer: {},
            summary: "All Day",
            start: { date: "2026-04-09" },
            end: { date: "2026-04-10" },
          },
        ],
      },
    });
    const result = JSON.parse(
      await listEvents.invoke({
        timeMin: "2026-04-09T00:00:00-07:00",
        timeMax: "2026-04-10T00:00:00-07:00",
      }),
    );
    expect(result[0].start).toBe("2026-04-09");
  });

  it("handles events with missing start/end times", async () => {
    mockCalendarListList.mockResolvedValue({
      data: { items: [{ id: "cal1" }] },
    });
    mockEventsList.mockResolvedValue({
      data: {
        items: [
          { id: "e1", summary: "No times", start: {}, end: {} },
        ],
      },
    });
    const result = JSON.parse(
      await listEvents.invoke({
        timeMin: "2026-04-09T00:00:00-07:00",
        timeMax: "2026-04-10T00:00:00-07:00",
      }),
    );
    expect(result[0].start).toBeUndefined();
  });

  it("falls back to calendarId when organizer has no displayName", async () => {
    mockCalendarListList.mockResolvedValue({
      data: { items: [{ id: "cal1" }] },
    });
    mockEventsList.mockResolvedValue({
      data: {
        items: [
          {
            id: "e1",
            summary: "Test",
            start: { dateTime: "2026-04-09T10:00:00-07:00" },
            end: { dateTime: "2026-04-09T11:00:00-07:00" },
          },
        ],
      },
    });
    const result = JSON.parse(
      await listEvents.invoke({
        timeMin: "2026-04-09T00:00:00-07:00",
        timeMax: "2026-04-10T00:00:00-07:00",
      }),
    );
    expect(result[0].calendar).toBe("cal1");
  });
});

describe("createEvent", () => {
  it("inserts event and returns success message", async () => {
    const result = await createEvent.invoke({
      summary: "Team Sync",
      description: "Weekly sync",
      startDateTime: "2026-04-09T10:00:00-07:00",
      endDateTime: "2026-04-09T11:00:00-07:00",
    });
    expect(mockEventsInsert).toHaveBeenCalledWith({
      calendarId: "primary",
      requestBody: {
        summary: "Team Sync",
        description: "Weekly sync",
        start: { dateTime: "2026-04-09T10:00:00-07:00" },
        end: { dateTime: "2026-04-09T11:00:00-07:00" },
      },
    });
    expect(result).toBe('Event "Team Sync" created successfully.');
  });
});
