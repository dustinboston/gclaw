import {describe, it, expect, vi, beforeEach} from 'vitest';

const {
	mockReadFileSync,
	mockValidate,
	mockSchedule,
	mockLoggerInfo,
	mockLoggerError,
	mockLoggerDebug,
} = vi.hoisted(() => ({
	mockReadFileSync: vi.fn(),
	mockValidate: vi.fn(),
	mockSchedule: vi.fn(),
	mockLoggerInfo: vi.fn(),
	mockLoggerError: vi.fn(),
	mockLoggerDebug: vi.fn(),
}));

vi.mock('node:fs', () => ({
	readFileSync: mockReadFileSync,
}));

vi.mock('node-cron', () => ({
	default: {
		validate: mockValidate,
		schedule: mockSchedule,
	},
}));

vi.mock('./logger.ts', () => ({
	logger: {
		info: mockLoggerInfo,
		error: mockLoggerError,
		debug: mockLoggerDebug,
	},
}));

vi.mock('./context.ts', () => ({
	runWithContext: async (fn: () => unknown) => fn(),
}));

import {startCronJobs, stopCronJobs} from './cron.ts';

type FiredTask = {
	fn: () => Promise<void>;
	stop: ReturnType<typeof vi.fn>;
};

function makeScheduleCapture(): FiredTask[] {
	const captured: FiredTask[] = [];
	mockSchedule.mockImplementation((_expr: string, fn: () => Promise<void>) => {
		const task = {fn, stop: vi.fn()};
		captured.push(task);
		return {stop: task.stop};
	});
	return captured;
}

function enoent(): NodeJS.ErrnoException {
	const error = new Error('ENOENT: no such file') as NodeJS.ErrnoException;
	error.code = 'ENOENT';
	return error;
}

const fakeAgent = {invoke: vi.fn()} as unknown as Parameters<typeof startCronJobs>[0];

describe('cron', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockValidate.mockReturnValue(true);
		mockSchedule.mockReturnValue({stop: vi.fn()});
		stopCronJobs(); // clear module-level state between tests
	});

	describe('loadJobs (via startCronJobs)', () => {
		it('does nothing when cron.json is missing', () => {
			mockReadFileSync.mockImplementationOnce(() => {
				throw enoent();
			});

			startCronJobs(fakeAgent);

			expect(mockSchedule).not.toHaveBeenCalled();
			expect(mockLoggerDebug).toHaveBeenCalledWith(
				expect.stringMatching(/no cron jobs/i),
			);
		});

		it('throws on malformed JSON', () => {
			mockReadFileSync.mockReturnValueOnce('{ not valid json');

			expect(() => startCronJobs(fakeAgent)).toThrow();
		});

		it('throws with a helpful message on schema violation', () => {
			mockReadFileSync.mockReturnValueOnce(
				JSON.stringify([{name: 'x', schedule: '* * * * *'}]), // missing prompt
			);

			expect(() => startCronJobs(fakeAgent)).toThrow(/Invalid cron\.json/);
		});

		it('propagates non-ENOENT filesystem errors', () => {
			const error = new Error('EACCES') as NodeJS.ErrnoException;
			error.code = 'EACCES';
			mockReadFileSync.mockImplementationOnce(() => {
				throw error;
			});

			expect(() => startCronJobs(fakeAgent)).toThrow('EACCES');
		});
	});

	describe('startCronJobs', () => {
		it('schedules each valid job with noOverlap and the job name', () => {
			mockReadFileSync.mockReturnValueOnce(
				JSON.stringify([
					{name: 'a', schedule: '0 2 * * *', prompt: 'p1'},
					{name: 'b', schedule: '34 12 * * *', prompt: 'p2'},
				]),
			);

			startCronJobs(fakeAgent);

			expect(mockSchedule).toHaveBeenCalledTimes(2);
			expect(mockSchedule).toHaveBeenNthCalledWith(
				1,
				'0 2 * * *',
				expect.any(Function),
				{name: 'a', noOverlap: true},
			);
			expect(mockSchedule).toHaveBeenNthCalledWith(
				2,
				'34 12 * * *',
				expect.any(Function),
				{name: 'b', noOverlap: true},
			);
		});

		it('skips and logs jobs with invalid cron expressions', () => {
			mockReadFileSync.mockReturnValueOnce(
				JSON.stringify([
					{name: 'bad', schedule: 'not-a-cron', prompt: 'p'},
					{name: 'good', schedule: '0 2 * * *', prompt: 'p'},
				]),
			);
			mockValidate.mockReturnValueOnce(false).mockReturnValueOnce(true);

			startCronJobs(fakeAgent);

			expect(mockSchedule).toHaveBeenCalledTimes(1);
			expect(mockSchedule).toHaveBeenCalledWith(
				'0 2 * * *',
				expect.any(Function),
				expect.objectContaining({name: 'good'}),
			);
			expect(mockLoggerError).toHaveBeenCalledWith(
				expect.objectContaining({job: 'bad', schedule: 'not-a-cron'}),
				expect.stringMatching(/invalid cron schedule/i),
			);
		});

		it('invokes the agent with the correct thread_id when a job fires', async () => {
			const invoke = vi
				.fn()
				.mockResolvedValue({messages: [{content: 'done'}]});
			const agent = {invoke} as unknown as Parameters<typeof startCronJobs>[0];

			mockReadFileSync.mockReturnValueOnce(
				JSON.stringify([
					{name: 'nightly-dream', schedule: '0 2 * * *', prompt: 'reflect'},
				]),
			);
			const captured = makeScheduleCapture();

			startCronJobs(agent);
			await captured[0].fn();

			expect(invoke).toHaveBeenCalledTimes(1);
			const [state, config] = invoke.mock.calls[0];
			expect(state).toEqual({messages: expect.any(Array)});
			expect(state.messages).toHaveLength(1);
			expect(config).toEqual({configurable: {thread_id: 'cron:nightly-dream'}});
			expect(mockLoggerInfo).toHaveBeenCalledWith(
				expect.objectContaining({job: 'nightly-dream'}),
				'Cron job completed',
			);
		});

		it('logs but does not rethrow when the agent fails', async () => {
			const invoke = vi.fn().mockRejectedValue(new Error('boom'));
			const agent = {invoke} as unknown as Parameters<typeof startCronJobs>[0];

			mockReadFileSync.mockReturnValueOnce(
				JSON.stringify([
					{name: 'j', schedule: '0 2 * * *', prompt: 'p'},
				]),
			);
			const captured = makeScheduleCapture();

			startCronJobs(agent);
			await expect(captured[0].fn()).resolves.toBeUndefined();

			expect(mockLoggerError).toHaveBeenCalledWith(
				expect.objectContaining({job: 'j', err: expect.any(Error)}),
				'Cron job failed',
			);
		});
	});

	describe('stopCronJobs', () => {
		it('stops every scheduled task and leaves subsequent calls as no-ops', () => {
			mockReadFileSync.mockReturnValueOnce(
				JSON.stringify([
					{name: 'a', schedule: '0 2 * * *', prompt: 'p'},
					{name: 'b', schedule: '0 3 * * *', prompt: 'p'},
				]),
			);
			const captured = makeScheduleCapture();

			startCronJobs(fakeAgent);
			stopCronJobs();

			expect(captured[0].stop).toHaveBeenCalledTimes(1);
			expect(captured[1].stop).toHaveBeenCalledTimes(1);

			stopCronJobs();
			expect(captured[0].stop).toHaveBeenCalledTimes(1); // no double-stop
		});
	});
});
