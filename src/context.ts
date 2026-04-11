/**
 * {@link AsyncLocalStorage}-based request context. Assigns a UUID
 * `requestId` per user request, automatically injected into all pino log
 * lines for end-to-end tracing.
 *
 * @module
 */

import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';

/** Per-request context propagated through async call chains. */
export type RequestContext = {
	requestId: string;
	startedAt: number;
};

const storage = new AsyncLocalStorage<RequestContext>();

/** Executes {@link fn} inside a new {@link RequestContext} with a fresh UUID. */
export function runWithContext<T>(fn: () => T): T {
	const ctx: RequestContext = {
		requestId: randomUUID(),
		startedAt: Date.now(),
	};
	return storage.run(ctx, fn);
}

/** Returns the current {@link RequestContext}, or `undefined` if called outside {@link runWithContext}. */
export function getContext(): RequestContext | undefined {
	return storage.getStore();
}

/** Shorthand for `getContext()?.requestId`. */
export function getRequestId(): string | undefined {
	return storage.getStore()?.requestId;
}
