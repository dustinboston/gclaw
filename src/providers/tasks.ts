/**
 * Google Tasks API client with concurrency-limited rate limiter,
 * retry logic, and metrics. Reuses the OAuth2 client from the Gmail provider.
 *
 * @module
 */

import {google} from 'googleapis';
import {withRetry} from '../retry.ts';
import {withMetrics} from '../metrics.ts';
import {loadConfig} from '../config.ts';
import {auth} from './gmail.ts';

const config = loadConfig();

/** Authenticated Google Tasks API v1 client instance. */
export const tasks = google.tasks({version: 'v1', auth});

// Rate limiter to avoid "Too many concurrent requests" errors from Google.
const maxConcurrent = config.tasksMaxConcurrent;
let active = 0;
const queue: Array<() => void> = [];

async function acquire(): Promise<void> {
	if (active < maxConcurrent) {
		active++;
		return;
	}

	return new Promise(resolve => {
		queue.push(resolve);
	});
}

function release() {
	if (queue.length > 0) {
		queue.shift()!();
	} else {
		active--;
	}
}

/**
 * Executes a Tasks API call with concurrency limiting, retry, and metrics.
 * At most {@link Config.tasksMaxConcurrent} requests run in parallel.
 */
export async function tasksRequest<T>(fn: () => Promise<T>): Promise<T> {
	await acquire();
	try {
		return await withMetrics('tasks_api', async () => withRetry(fn));
	} finally {
		release();
	}
}
