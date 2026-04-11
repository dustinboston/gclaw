import {describe, it, expect, vi, beforeEach} from 'vitest';

const {mockQuery} = vi.hoisted(() => ({
	mockQuery: vi.fn().mockResolvedValue({rows: []}),
}));

vi.mock('./logger.ts', () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock('./context.ts', () => ({
	getRequestId: () => 'test-request-id',
}));

vi.mock('./providers/database.ts', () => ({
	pool: {
		query: mockQuery,
	},
}));

import {
	recordToolCall,
	withMetrics,
	getMetricsSummary,
	getAnalytics,
	logMetricsSummary,
	resetMetrics,
} from './metrics.ts';
import {logger} from './logger.ts';

describe('metrics', () => {
	beforeEach(() => {
		resetMetrics();
		vi.clearAllMocks();
	});

	describe('recordToolCall', () => {
		it('records a successful tool call', () => {
			recordToolCall('test_tool', 150, true);

			const summary = getMetricsSummary();
			expect(summary.test_tool).toEqual({
				calls: 1,
				successes: 1,
				failures: 0,
				totalDurationMs: 150,
				avgDurationMs: 150,
			});
		});

		it('records a failed tool call', () => {
			recordToolCall('test_tool', 50, false);

			const summary = getMetricsSummary();
			expect(summary.test_tool.failures).toBe(1);
			expect(summary.test_tool.successes).toBe(0);
		});

		it('accumulates metrics across multiple calls', () => {
			recordToolCall('api', 100, true);
			recordToolCall('api', 200, true);
			recordToolCall('api', 50, false);

			const summary = getMetricsSummary();
			expect(summary.api.calls).toBe(3);
			expect(summary.api.successes).toBe(2);
			expect(summary.api.failures).toBe(1);
			expect(summary.api.totalDurationMs).toBe(350);
			expect(summary.api.avgDurationMs).toBe(117); // Math.round(350/3)
		});

		it('logs a debug entry per call', () => {
			recordToolCall('test_tool', 42, true);
			expect(logger.debug).toHaveBeenCalledWith(
				{tool: 'test_tool', durationMs: 42, success: true},
				'Tool call metric',
			);
		});

		it('persists to PostgreSQL', () => {
			recordToolCall('test_tool', 42, true);
			expect(mockQuery).toHaveBeenCalledWith(
				expect.stringContaining('INSERT INTO analytics'),
				['test-request-id', 'test_tool', 42, true],
			);
		});

		it('handles database write failure gracefully', async () => {
			mockQuery.mockRejectedValueOnce(new Error('db down'));
			recordToolCall('test_tool', 42, true);

			// Allow the rejected promise to settle
			await vi.waitFor(() => {
				expect(logger.error).toHaveBeenCalledWith(
					{err: expect.any(Error), tool: 'test_tool'},
					'Failed to write analytics',
				);
			});
		});
	});

	describe('withMetrics', () => {
		it('records success and returns the result', async () => {
			const result = await withMetrics('my_tool', async () => 'ok');
			expect(result).toBe('ok');

			const summary = getMetricsSummary();
			expect(summary.my_tool.successes).toBe(1);
			expect(summary.my_tool.failures).toBe(0);
		});

		it('records failure and re-throws the error', async () => {
			await expect(
				withMetrics('my_tool', async () => {
					throw new Error('boom');
				}),
			).rejects.toThrow('boom');

			const summary = getMetricsSummary();
			expect(summary.my_tool.failures).toBe(1);
			expect(summary.my_tool.successes).toBe(0);
		});

		it('tracks duration', async () => {
			await withMetrics('my_tool', async () => {
				// Tiny delay to ensure non-zero duration
			});

			const summary = getMetricsSummary();
			expect(summary.my_tool.totalDurationMs).toBeGreaterThanOrEqual(0);
		});
	});

	describe('getAnalytics', () => {
		it('queries PostgreSQL with default 24h window', async () => {
			mockQuery.mockResolvedValueOnce({
				rows: [
					{tool: 'gmail_api', totalCalls: 10, successes: 9, failures: 1, avgDurationMs: 120, maxDurationMs: 500, minDurationMs: 30},
				],
			});

			const result = await getAnalytics();
			expect(result).toHaveLength(1);
			expect(result[0].tool).toBe('gmail_api');
			expect(mockQuery).toHaveBeenCalledWith(
				expect.stringContaining('FROM analytics'),
				[expect.any(String)],
			);
		});

		it('accepts a custom since date', async () => {
			mockQuery.mockResolvedValueOnce({rows: []});

			const since = new Date('2026-01-01');
			await getAnalytics(since);
			expect(mockQuery).toHaveBeenCalledWith(
				expect.stringContaining('FROM analytics'),
				[since.toISOString()],
			);
		});
	});

	describe('logMetricsSummary', () => {
		it('logs when there are metrics', () => {
			recordToolCall('api', 100, true);
			logMetricsSummary();
			expect(logger.info).toHaveBeenCalledWith(
				{metrics: expect.objectContaining({api: expect.any(Object)})},
				'Metrics summary',
			);
		});

		it('does not log when there are no metrics', () => {
			logMetricsSummary();
			expect(logger.info).not.toHaveBeenCalled();
		});
	});

	describe('resetMetrics', () => {
		it('clears all recorded metrics', () => {
			recordToolCall('api', 100, true);
			resetMetrics();
			expect(getMetricsSummary()).toEqual({});
		});
	});
});
