/**
 * Structured logging via pino. Writes JSON logs to the file specified by
 * `LOG_FILE` (default `gclaw.log`). Each log entry is automatically enriched
 * with the current {@link ../context!RequestContext.requestId | requestId} when
 * available.
 *
 * @module
 */

import {join} from 'node:path';
import process from 'node:process';
import pino from 'pino';
import {getRequestId} from './context.ts';

const logFile = process.env.LOG_FILE ?? 'gclaw.log';
const destination = join(import.meta.dirname, '..', logFile);

/** Shared pino logger instance used throughout the application. */
export const logger = pino({
	level: process.env.LOG_LEVEL ?? 'info',
	mixin() {
		const requestId = getRequestId();
		return requestId ? {requestId} : {};
	},
	transport: {target: 'pino/file', options: {destination}},
});
