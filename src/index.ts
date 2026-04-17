/**
 * Application entry point. Sets up the Deep Agent with PostgreSQL-backed
 * conversation persistence and runs an interactive REPL. Tools are provided
 * flat to the agent; multi-step workflows (like inbox cleanup) are described
 * in `skills/` and loaded by the Deep Agent's filesystem backend.
 *
 * @module
 */

import * as readline from 'node:readline/promises';
import process from 'node:process';
import {readFileSync, appendFileSync} from 'node:fs';
import 'dotenv/config'; // eslint-disable-line import-x/no-unassigned-import
import {HumanMessage, AIMessageChunk, ToolMessage} from 'langchain';
import {PostgresSaver} from '@langchain/langgraph-checkpoint-postgres';
import {createDeepAgent, FilesystemBackend} from 'deepagents';
import {loadConfig} from './config.ts';
import {logger} from './logger.ts';
import {runWithContext} from './context.ts';
import {logMetricsSummary, getAnalytics} from './metrics.ts';
import {createSession, listSessions} from './session.ts';
import {startCronJobs, stopCronJobs} from './cron.ts';
import {pool, initDatabase} from './providers/database.ts';
import {
	gmailListEmail,
	gmailReadEmail,
	gmailArchiveEmail,
	gmailDeleteEmail,
	gmailSpamEmail,
	gmailUnarchiveEmail,
	gmailUndeleteEmail,
	gmailUnspamEmail,
} from './tools/gmail.ts';
import {calendarListEvents, calendarCreateEvent} from './tools/calendar.ts';
import {
	tasksListTasks,
	tasksCreateTask,
	tasksCompleteTask,
	tasksUpdateTask,
} from './tools/tasks.ts';
import {
	driveListFiles,
	driveReadFile,
	driveCreateFolder,
	driveMoveFile,
	driveRenameFile,
	driveUploadTextFile,
	driveTrashFile,
	driveUntrashFile,
} from './tools/drive.ts';
import {
	docsCreateDocument,
	docsReadDocument,
	docsAppendText,
	docsInsertText,
	docsReplaceText,
} from './tools/docs.ts';

// Setup
// ----------------------------------------------------------------------------

const config = loadConfig();

await initDatabase();

const checkpointer = new PostgresSaver(pool);
await checkpointer.setup();

const systemPrompt = `
You are a helpful personal assistant. You help the user manage their email, calendar, tasks, Google Drive, and Google Docs.

Today's date is ${new Date().toLocaleDateString('en-US', {
	weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
})}.

# Tools

## Email management
- gmail_list_email — list email message IDs with a given label.
- gmail_read_email — read email metadata (subject, sender, time, etc) by message ID.
- gmail_archive_email — archive (removes from inbox). Include subject, from, and reason.
- gmail_delete_email — delete (moves to trash). Include subject, from, and reason.
- gmail_spam_email — mark as spam. Include subject, from, and reason.
- gmail_unarchive_email — undo an archive.
- gmail_undelete_email — undo a delete.
- gmail_unspam_email — undo a spam.

## Calendar management
- calendar_list_events — check the calendar for open slots before scheduling.
- calendar_create_event — create a Google Calendar event.

## Task management
- tasks_list_tasks — check existing tasks before creating new ones.
- tasks_create_task — create a Google Tasks reminder for follow-up.
- tasks_complete_task — mark a task as complete.
- tasks_update_task — update a task (e.g. change title, due date).

## Drive management
- drive_list_files — list files/folders, optionally with a Drive query (e.g. name contains, mimeType filter, parent-in).
- drive_read_file — read a file's metadata (and the plain-text body for Google Docs).
- drive_create_folder — create a new folder, optionally inside a parent.
- drive_move_file — move a file or folder to a new parent. Prefer passing oldParentId so the move can be audit-undone.
- drive_rename_file — rename a file or folder. The prior name is recorded for undo.
- drive_upload_text_file — create a new text/markdown/CSV/JSON file with the given content.
- drive_trash_file — move a file or folder to trash. Include a reason.
- drive_untrash_file — undo a trash.

## Docs management
- docs_create_document — create a new blank Google Doc. The doc is created at the Drive root; chain with drive_move_file to place it in a folder.
- docs_read_document — read a doc as plain text (title + body).
- docs_append_text — append text to the end of a doc. Include explicit newlines in the text.
- docs_insert_text — insert text at a specific Docs API index (advanced; prefer append/replace for most cases).
- docs_replace_text — find-and-replace all occurrences of a string.
- To rename, move, or delete a doc, use the corresponding drive_* tools (drive_rename_file, drive_move_file, drive_trash_file) with the document id.

# Guidelines

- Break down user requests into appropriate tool calls and coordinate the results.
- When a request involves multiple actions, use multiple tools in sequence.
- When results are already displayed to the user by a tool, do not repeat them. Just confirm the action is done.
- For requests that span multiple domains (e.g. "what do I have going on today"), call the relevant tools and combine the results.
- For multi-step workflows like cleaning up an inbox, follow the matching skill if one is loaded.
`.trim();

const agent = createDeepAgent({
	model: config.googleAiModel,
	backend: new FilesystemBackend({rootDir: process.cwd(), virtualMode: true}),
	skills: ['/skills/'],
	tools: [
		// Email
		gmailListEmail,
		gmailReadEmail,
		gmailArchiveEmail,
		gmailDeleteEmail,
		gmailSpamEmail,
		gmailUnarchiveEmail,
		gmailUndeleteEmail,
		gmailUnspamEmail,
		// Calendar
		calendarListEvents,
		calendarCreateEvent,
		// Tasks
		tasksListTasks,
		tasksCreateTask,
		tasksCompleteTask,
		tasksUpdateTask,
		// Drive
		driveListFiles,
		driveReadFile,
		driveCreateFolder,
		driveMoveFile,
		driveRenameFile,
		driveUploadTextFile,
		driveTrashFile,
		driveUntrashFile,
		// Docs
		docsCreateDocument,
		docsReadDocument,
		docsAppendText,
		docsInsertText,
		docsReplaceText,
	],
	systemPrompt,
	checkpointer,
});

startCronJobs(agent);

// Helpers
// ----------------------------------------------------------------------------

async function printSessions(activeThreadId: string): Promise<void> {
	try {
		const sessions = await listSessions();
		if (sessions.length === 0) {
			console.log('No previous sessions found.\n');
			return;
		}

		console.log('Recent sessions:');
		for (const s of sessions) {
			const marker = s.threadId === activeThreadId ? ' (active)' : '';
			console.log(`  ${s.threadId.slice(0, 8)}  ${s.messageCount} checkpoints${marker}`);
		}

		console.log();
	} catch (error) {
		logger.error({err: error}, 'Failed to list sessions');
		console.log('Failed to list sessions.\n');
	}
}

function truncate(text: string, max = 120): string {
	return text.length > max ? text.slice(0, max - 3) + '...' : text;
}

async function printAnalytics(): Promise<void> {
	try {
		const rows = await getAnalytics();
		if (rows.length === 0) {
			console.log('No analytics data in the last 24 hours.\n');
			return;
		}

		console.log('Usage analytics (last 24h):');
		for (const r of rows) {
			console.log(`  ${r.tool}: ${r.totalCalls} calls (${r.successes} ok, ${r.failures} failed) avg ${r.avgDurationMs}ms [${r.minDurationMs}–${r.maxDurationMs}ms]`);
		}

		console.log();
	} catch (error) {
		logger.error({err: error}, 'Failed to fetch analytics');
		console.log('Failed to fetch analytics.\n');
	}
}

function renderAiChunk(message: AIMessageChunk, seen: Set<string>): void {
	if (message.text) {
		process.stdout.write(message.text);
	}

	for (const call of message.tool_calls ?? []) {
		if (!call.id || seen.has(call.id)) {
			continue;
		}

		seen.add(call.id);
		const args = JSON.stringify(call.args ?? {});
		process.stdout.write(`\n[tool] ${call.name} ${truncate(args)}\n`);
	}
}

// Interactive loop
// ----------------------------------------------------------------------------

let currentThreadId = createSession();

const historyFile = new URL('../.command_history', import.meta.url);

let history: string[] = [];
try {
	history = readFileSync(historyFile, 'utf8').split('\n').filter(Boolean);
} catch {
	history = [];
}

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	history,
	historySize: 500,
});

logger.debug('G-Claw started');
console.log('G-Claw — your personal assistant');
console.log(`Session: ${currentThreadId.slice(0, 8)}...`);
console.log('Commands: /new, /sessions, /resume <id>, /analytics, exit\n');

while (true) {
	let input: string;
	try {
		// eslint-disable-next-line no-await-in-loop
		input = await rl.question('> ');
	} catch {
		break;
	}

	const trimmed = input.trim();

	if (!trimmed) {
		continue;
	}

	appendFileSync(historyFile, trimmed + '\n');

	if (trimmed.toLowerCase() === 'exit') {
		break;
	}

	if (trimmed === '/new') {
		currentThreadId = createSession();
		console.log(`New session: ${currentThreadId.slice(0, 8)}...\n`);
		continue;
	}

	if (trimmed === '/sessions') {
		// eslint-disable-next-line no-await-in-loop
		await printSessions(currentThreadId);
		continue;
	}

	if (trimmed === '/analytics') {
		// eslint-disable-next-line no-await-in-loop
		await printAnalytics();
		continue;
	}

	if (trimmed.startsWith('/resume ')) {
		const id = trimmed.slice(8).trim();
		try {
			// eslint-disable-next-line no-await-in-loop
			const sessions = await listSessions(100);
			const match = sessions.find(s => s.threadId === id || s.threadId.startsWith(id));
			if (match) {
				currentThreadId = match.threadId;
				console.log(`Resumed session: ${currentThreadId.slice(0, 8)}...\n`);
			} else {
				console.log(`Session not found: ${id}\n`);
			}
		} catch (error) {
			logger.error({err: error}, 'Failed to resume session');
			console.log('Failed to resume session.\n');
		}

		continue;
	}

	const threadId = currentThreadId;
	// eslint-disable-next-line no-await-in-loop
	await runWithContext(async () => {
		try {
			logger.info({input: trimmed}, 'User request');

			const runConfig = {configurable: {thread_id: threadId}}; // eslint-disable-line @typescript-eslint/naming-convention
			const stream = await agent.stream(
				{messages: [new HumanMessage(trimmed)]},
				{...runConfig, streamMode: 'messages'},
			);

			const seenToolCalls = new Set<string>();
			for await (const [message] of stream) {
				if (message instanceof AIMessageChunk) {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					renderAiChunk(message, seenToolCalls);
				} else if (message instanceof ToolMessage) {
					const content = typeof message.content === 'string'
						? message.content
						: JSON.stringify(message.content);
					process.stdout.write(`[tool:${message.name ?? 'result'}] ${truncate(content)}\n`);
				}
			}

			process.stdout.write('\n\n');
		} catch (error) {
			logger.error({err: error}, 'Agent error');
			const message = error instanceof Error ? error.message : String(error);
			console.error(`\nError: ${message}\n`);
		} finally {
			logMetricsSummary();
		}
	});
}

rl.close();
stopCronJobs();
await pool.end();
