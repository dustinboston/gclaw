import {join} from 'node:path';
import process from 'node:process';
import pino from 'pino';
import {getRequestId} from './context.ts';

const logFile = process.env.LOG_FILE ?? 'winbox.log';
const destination = join(import.meta.dirname, '..', logFile);

export const logger = pino({
	level: process.env.LOG_LEVEL ?? 'info',
	mixin() {
		const requestId = getRequestId();
		return requestId ? {requestId} : {};
	},
	transport: {target: 'pino/file', options: {destination}},
});
