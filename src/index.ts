/**
 * Application entry point. Sets up the supervisor agent with PostgreSQL-backed
 * conversation persistence and runs an interactive REPL that routes user
 * requests to specialized sub-agents (email, calendar, tasks, clean).
 *
 * @module
 */

import * as readline from 'node:readline/promises';
import process from 'node:process';
import {readFileSync, appendFileSync} from 'node:fs';
import 'dotenv/config'; // eslint-disable-line import-x/no-unassigned-import
import {PostgresSaver} from '@langchain/langgraph-checkpoint-postgres';
import {createAgent, HumanMessage, AIMessageChunk} from 'langchain';
import {cleanEmail} from './tools/clean.ts';
import {manageEmail} from './tools/gmail.ts';
import {manageCalendar} from './tools/calendar.ts';
import {manageTasks} from './tools/tasks.ts';
import {model} from './model.ts';
import {loadAgentsFile} from './agents-file.ts';
import {logger} from './logger.ts';
import {runWithContext} from './context.ts';
import {logMetricsSummary, getAnalytics} from './metrics.ts';
import {pool, initDatabase} from './providers/database.ts';
import {createSession, listSessions} from './session.ts';

// Setup
// ----------------------------------------------------------------------------

await initDatabase();

const checkpointer = new PostgresSaver(pool);
await checkpointer.setup();

const agentsFile = await loadAgentsFile();

const supervisorPrompt = `
You are a helpful personal assistant. You help the user manage their email, calendar, and tasks.

Today's date is ${new Date().toLocaleDateString('en-US', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}.

# Tools

- clean_email — Clean up the user's Gmail inbox. Handles listing, reading, archiving, deleting, and marking messages as spam.
- manage_calendar — Manage Google Calendar across all the user's calendars. View the agenda, list events in a time range, schedule new meetings, and check availability.
- manage_tasks — Manage Google Tasks across all the user's task lists. List tasks, create new tasks, mark tasks complete, and run weekly reviews.
- manage_email — Manage the user's Gmail inbox. Handles listing, reading, archiving, deleting, and marking messages as spam.

# Guidelines

- Break down user requests into appropriate tool calls and coordinate the results.
- When a request involves multiple actions, use multiple tools in sequence.
- When results are already displayed to the user by a tool, do not repeat them. Just confirm the action is done.
- For requests that span multiple domains (e.g. "what do I have going on today"), call the relevant tools and combine the results.

---

${agentsFile}

`.trim();

const supervisorAgent = createAgent({
	model,
	tools: [cleanEmail, manageCalendar, manageTasks, manageEmail],
	systemPrompt: supervisorPrompt,
	checkpointer,
});

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

// Interactive loop
// ----------------------------------------------------------------------------

let currentThreadId = createSession();

const historyFile = new URL('../.command_history', import.meta.url);

let history: string[] = [];
try {
	history = readFileSync(historyFile, 'utf8').split('\n').filter(Boolean);
} catch {}

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	history,
	historySize: 500,
});

logger.debug('Winbox started');
console.log('Winbox — your personal assistant');
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
		try {
			// eslint-disable-next-line no-await-in-loop
			const rows = await getAnalytics();
			if (rows.length === 0) {
				console.log('No analytics data in the last 24 hours.\n');
			} else {
				console.log('Usage analytics (last 24h):');
				for (const r of rows) {
					console.log(`  ${r.tool}: ${r.totalCalls} calls (${r.successes} ok, ${r.failures} failed) avg ${r.avgDurationMs}ms [${r.minDurationMs}–${r.maxDurationMs}ms]`);
				}

				console.log();
			}
		} catch (error) {
			logger.error({err: error}, 'Failed to fetch analytics');
			console.log('Failed to fetch analytics.\n');
		}

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

			const config = {configurable: {thread_id: threadId}}; // eslint-disable-line @typescript-eslint/naming-convention
			const stream = await supervisorAgent.stream(
				{messages: [new HumanMessage(trimmed)]},
				{...config, streamMode: 'messages'},
			);

			for await (const [message] of stream) {
				if (message instanceof AIMessageChunk && message.text) {
					process.stdout.write(message.text);
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
await pool.end();
