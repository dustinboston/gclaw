/**
 * In-process cron jobs that invoke the Deep Agent on a schedule. Jobs fire
 * only while the main process is running; output is routed to the logger
 * rather than stdout so scheduled runs don't interleave with the interactive
 * REPL prompt. Each job uses a stable `cron:<name>` thread ID so its history
 * accumulates in its own session, visible via `/sessions`.
 *
 * @module
 */

import {readFileSync} from 'node:fs';
import cron, {type ScheduledTask} from 'node-cron';
import {HumanMessage} from 'langchain';
import type {createDeepAgent} from 'deepagents';
import z from 'zod';
import {logger} from './logger.ts';
import {runWithContext} from './context.ts';

type Agent = ReturnType<typeof createDeepAgent>;

const cronJobSchema = z.object({
	/** Stable identifier — used for logging and as the checkpoint thread ID. */
	name: z.string().min(1),
	/** Standard 5-field cron expression, evaluated in the system timezone. */
	schedule: z.string().min(1),
	/** The prompt sent to the agent when the job fires. */
	prompt: z.string().min(1),
});

const cronConfigSchema = z.array(cronJobSchema);

type CronJob = z.infer<typeof cronJobSchema>;

const configPath = new URL('../cron.json', import.meta.url);

function loadJobs(): CronJob[] {
	let raw: string;
	try {
		raw = readFileSync(configPath, 'utf8');
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			return [];
		}

		throw error;
	}

	const parsed = cronConfigSchema.safeParse(JSON.parse(raw));
	if (!parsed.success) {
		throw new Error(`Invalid cron.json:\n${z.prettifyError(parsed.error)}`);
	}

	return parsed.data;
}

const scheduled: ScheduledTask[] = [];

async function runJob(agent: Agent, job: CronJob): Promise<void> {
	const start = Date.now();
	logger.info({job: job.name, schedule: job.schedule}, 'Cron job started');

	await runWithContext(async () => {
		try {
			const runConfig = {configurable: {thread_id: `cron:${job.name}`}}; // eslint-disable-line @typescript-eslint/naming-convention
			const result = await agent.invoke(
				{messages: [new HumanMessage(job.prompt)]},
				runConfig,
			);
			const last = result.messages?.at(-1);
			const text = typeof last?.content === 'string' ? last.content : '';
			logger.info(
				{job: job.name, durationMs: Date.now() - start, output: text.slice(0, 500)},
				'Cron job completed',
			);
		} catch (error) {
			logger.error({err: error, job: job.name}, 'Cron job failed');
		}
	});
}

/** Registers every declared cron job with node-cron. */
export function startCronJobs(agent: Agent): void {
	const jobs = loadJobs();
	if (jobs.length === 0) {
		logger.debug('No cron jobs configured (cron.json missing or empty)');
		return;
	}

	for (const job of jobs) {
		if (!cron.validate(job.schedule)) {
			logger.error({job: job.name, schedule: job.schedule}, 'Invalid cron schedule — skipping');
			continue;
		}

		const task = cron.schedule(
			job.schedule,
			async () => runJob(agent, job),
			{name: job.name, noOverlap: true},
		);
		scheduled.push(task);
		logger.info({job: job.name, schedule: job.schedule}, 'Cron job scheduled');
	}
}

/** Stops all scheduled cron jobs. */
export function stopCronJobs(): void {
	for (const task of scheduled) {
		void task.stop();
	}

	scheduled.length = 0;
}
