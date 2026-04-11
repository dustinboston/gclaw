/**
 * Google Calendar API client
 */

import {google} from 'googleapis';
import {withRetry} from '../retry.ts';
import {withMetrics} from '../metrics.ts';
import {loadConfig} from '../config.ts';
import {auth} from './gmail.ts';

const config = loadConfig();

export const calendar = google.calendar({version: 'v3', auth});

// Rate limiter to avoid "Too many concurrent requests" errors from Google.
const maxConcurrent = config.calendarMaxConcurrent;
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

export async function calendarRequest<T>(fn: () => Promise<T>): Promise<T> {
	await acquire();
	try {
		return await withMetrics('calendar_api', async () => withRetry(fn));
	} finally {
		release();
	}
}
