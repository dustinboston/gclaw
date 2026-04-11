import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';

export type RequestContext = {
	requestId: string;
	startedAt: number;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(fn: () => T): T {
	const ctx: RequestContext = {
		requestId: randomUUID(),
		startedAt: Date.now(),
	};
	return storage.run(ctx, fn);
}

export function getContext(): RequestContext | undefined {
	return storage.getStore();
}

export function getRequestId(): string | undefined {
	return storage.getStore()?.requestId;
}
