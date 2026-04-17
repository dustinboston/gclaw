/**
 * LangChain tools for Google Tasks operations. Provides task listing across
 * all task lists, task creation, completion, and updates.
 *
 * @module
 */

import {tool} from 'langchain';
import z from 'zod';
import {tasks, tasksRequest} from '../providers/tasks.ts';
import {loadConfig} from '../config.ts';

/** Lists tasks across all of the user's task lists. */
export const listTasks = tool(
	async ({showCompleted, maxResults}) => {
		const listsResponse = await tasksRequest(async () => tasks.tasklists.list());
		const taskLists = listsResponse.data.items ?? [];

		const allTasks = await Promise.all(taskLists.map(async tl => {
			const response = await tasksRequest(async () =>
				tasks.tasks.list({
					tasklist: tl.id!,
					showCompleted,
					showHidden: showCompleted,
					maxResults,
				}));
			return (response.data.items ?? []).map(t => ({
				id: t.id,
				list: tl.title,
				listId: tl.id,
				title: t.title,
				notes: t.notes ?? '',
				status: t.status,
				due: t.due ?? null,
			}));
		}));

		return JSON.stringify(allTasks.flat());
	},
	{
		name: 'list_tasks',
		description:
      'List tasks from Google Tasks. Returns tasks with id, title, notes, status, and due date.',
		schema: z.object({
			showCompleted: z
				.boolean()
				.default(false)
				.describe('Whether to include completed tasks'),
			maxResults: z
				.number()
				.default(100)
				.describe('Maximum number of tasks to return'),
		}),
	},
);

/** Marks a task as completed. */
export const completeTask = tool(
	async ({id, listId}) => {
		await tasksRequest(async () =>
			tasks.tasks.patch({
				tasklist: listId,
				task: id,
				requestBody: {
					status: 'completed',
				},
			}));
		return `Task ${id} marked as completed.`;
	},
	{
		name: 'complete_task',
		description:
      'Mark a task as completed in Google Tasks. Requires id and listId from list_tasks.',
		schema: z.object({
			id: z.string().describe('The task ID from list_tasks'),
			listId: z.string().describe('The task list ID from list_tasks'),
		}),
	},
);

/** Updates an existing task's title, notes, or due date. */
export const updateTask = tool(
	async ({id, listId, title, notes, due}) => {
		const body: Record<string, string> = {};
		if (title !== undefined) {
			body.title = title;
		}

		if (notes !== undefined) {
			body.notes = notes;
		}

		if (due !== undefined) {
			body.due = due;
		}

		await tasksRequest(async () =>
			tasks.tasks.patch({
				tasklist: listId,
				task: id,
				requestBody: body,
			}));
		return `Task ${id} updated.`;
	},
	{
		name: 'update_task',
		description:
      'Update an existing task\'s title, notes, or due date. Requires id and listId from list_tasks.',
		schema: z.object({
			id: z.string().describe('The task ID from list_tasks'),
			listId: z.string().describe('The task list ID from list_tasks'),
			title: z.string().optional().describe('New title for the task'),
			notes: z.string().optional().describe('New notes for the task'),
			due: z.string().optional().describe('New due date in ISO 8601 format (e.g. 2026-04-10T00:00:00.000Z)'),
		}),
	},
);

/** Creates a new task in Google Tasks. */
export const createTask = tool(
	async ({title, notes, listId}) => {
		const config = loadConfig();
		await tasksRequest(async () =>
			tasks.tasks.insert({
				tasklist: listId ?? config.defaultTaskListId,
				requestBody: {
					title,
					notes,
				},
			}));
		return `Task "${title}" created successfully.`;
	},
	{
		name: 'create_task',
		description:
      'Create a task in Google Tasks. Use this when an action item needs to be tracked.',
		schema: z.object({
			title: z.string().describe('Short title for the task'),
			notes: z
				.string()
				.describe('Additional details or context for the task'),
			listId: z
				.string()
				.optional()
				.describe('Task list ID to add to (from list_tasks). Defaults to the user\'s default list.'),
		}),
	},
);
