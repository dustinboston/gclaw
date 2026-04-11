/**
 * Exponential backoff with jitter for transient API failures.
 * Retries on 408, 429, 5xx status codes and common network errors
 * (ECONNRESET, ETIMEDOUT, ENOTFOUND, socket hang up).
 *
 * @module
 */

import process from 'node:process';
import {logger} from './logger.ts';

/** Options for {@link withRetry}. */
export type RetryOptions = {
	maxAttempts?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
};

const retryableStatusCodes = new Set([408, 429, 500, 502, 503, 504]);

type ErrorLike = {
	code?: number;
	status?: number;
	statusCode?: number;
	message?: string;
};

function isRetryable(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) {
		return false;
	}

	const {code, status, statusCode} = error as ErrorLike;
	const statusValue = code ?? status ?? statusCode;

	if (typeof statusValue === 'number' && retryableStatusCodes.has(statusValue)) {
		return true;
	}

	const message = (error as ErrorLike).message ?? '';
	if (
		typeof message === 'string'
		&& (message.includes('ECONNRESET')
			|| message.includes('ETIMEDOUT')
			|| message.includes('ENOTFOUND')
			|| message.includes('socket hang up'))
	) {
		return true;
	}

	return false;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

/**
 * Executes {@link fn} with automatic retries on transient errors.
 * Uses exponential backoff with random jitter (0.75x - 1.25x).
 *
 * @throws The original error if all attempts are exhausted or the error is not retryable.
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	options: RetryOptions = {},
): Promise<T> {
	const {maxAttempts = 3, baseDelayMs = 500, maxDelayMs = 10_000} = options;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			// eslint-disable-next-line no-await-in-loop
			return await fn();
		} catch (error) {
			if (attempt === maxAttempts || !isRetryable(error)) {
				throw error;
			}

			const jitter = (Math.random() * 0.5) + 0.75; // 0.75–1.25
			const delay = Math.min((baseDelayMs * (2 ** (attempt - 1))) * jitter, maxDelayMs);

			logger.warn(
				{
					attempt, maxAttempts, delayMs: Math.round(delay), error: getErrorMessage(error),
				},
				'Retrying after transient error',
			);

			// eslint-disable-next-line no-await-in-loop
			await new Promise<void>(resolve => {
				setTimeout(resolve, delay);
			});
		}
	}

	throw new Error('Unreachable');
}
