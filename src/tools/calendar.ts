/**
 * LangChain tools for Google Calendar operations. Provides event listing
 * across all calendars and event creation on the default calendar.
 *
 * @module
 */

import {tool} from 'langchain';
import z from 'zod';
import {calendar, calendarRequest} from '../providers/calendar.ts';
import {loadConfig} from '../config.ts';

/** Lists events across all of the user's calendars in a time range. */
export const listEvents = tool(
	async ({timeMin, timeMax, maxResults}) => {
		const calendarsResponse = await calendarRequest(async () =>
			calendar.calendarList.list());
		const calendarIds = (calendarsResponse.data.items ?? []).map(c => c.id!);

		type CalendarEvent = {
			id: string | undefined;
			calendar: string;
			summary: string | undefined;
			start: string | undefined;
			end: string | undefined;
		};

		const allEvents: CalendarEvent[][] = await Promise.all(calendarIds.map(async calendarId => {
			const response = await calendarRequest(async () =>
				calendar.events.list({
					calendarId,
					timeMin,
					timeMax,
					maxResults,
					singleEvents: true,
					orderBy: 'startTime',
				}));
			return (response.data.items ?? []).map(event => ({
				id: event.id ?? undefined,
				calendar: event.organizer?.displayName ?? calendarId,
				summary: event.summary ?? undefined,
				start: event.start?.dateTime ?? event.start?.date ?? undefined,
				end: event.end?.dateTime ?? event.end?.date ?? undefined,
			}));
		}));

		const events: CalendarEvent[] = [];
		for (const group of allEvents) {
			events.push(...group);
		}

		events.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));

		return JSON.stringify(events);
	},
	{
		name: 'list_events',
		description:
      'List upcoming Google Calendar events in a time range. Use this to find open slots before creating an event.',
		schema: z.object({
			timeMin: z
				.string()
				.describe('Start of time range in ISO 8601 format with timezone offset (e.g. 2026-04-09T00:00:00-07:00). Never use Z/UTC.'),
			timeMax: z
				.string()
				.describe('End of time range in ISO 8601 format with timezone offset (e.g. 2026-04-10T00:00:00-07:00). Never use Z/UTC.'),
			maxResults: z
				.number()
				.default(20)
				.describe('Maximum number of events to return'),
		}),
	},
);

/** Creates an event on the user's default calendar. */
export const createEvent = tool(
	async ({summary, description, startDateTime, endDateTime}) => {
		const config = loadConfig();
		await calendarRequest(async () =>
			calendar.events.insert({
				calendarId: config.defaultCalendarId,
				requestBody: {
					summary,
					description,
					start: {dateTime: startDateTime},
					end: {dateTime: endDateTime},
				},
			}));
		return `Event "${summary}" created successfully.`;
	},
	{
		name: 'create_event',
		description:
      'Create a Google Calendar event. Use list_events first to check for conflicts.',
		schema: z.object({
			summary: z.string().describe('Title of the event'),
			description: z
				.string()
				.describe('Details or context for the event'),
			startDateTime: z
				.string()
				.describe('Start time in ISO 8601 format (e.g. 2026-04-09T10:00:00-07:00)'),
			endDateTime: z
				.string()
				.describe('End time in ISO 8601 format (e.g. 2026-04-09T11:00:00-07:00)'),
		}),
	},
);
