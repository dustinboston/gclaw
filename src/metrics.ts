/**
 * In-memory and persistent metrics collection for tool and API call
 * performance. Tracks call counts, success/failure rates, and latency.
 * Metrics are persisted to the `analytics` table in PostgreSQL on every call
 * (fire-and-forget) and can be queried via {@link getAnalytics}.
 *
 * @module
 */

import {logger} from './logger.ts';
import {getRequestId} from './context.ts';
import {pool} from './providers/database.ts';

type ToolMetric = {
	calls: number;
	successes: number;
	failures: number;
	totalDurationMs: number;
};

const toolMetrics = new Map<string, ToolMetric>();

function getOrCreate(name: string): ToolMetric {
	let m = toolMetrics.get(name);
	if (!m) {
		m = {
			calls: 0, successes: 0, failures: 0, totalDurationMs: 0,
		};
		toolMetrics.set(name, m);
	}

	return m;
}

/** Records a single tool call's outcome and persists it to PostgreSQL. */
export function recordToolCall(
	name: string,
	durationMs: number,
	success: boolean,
): void {
	const m = getOrCreate(name);
	m.calls++;
	m.totalDurationMs += durationMs;
	if (success) {
		m.successes++;
	} else {
		m.failures++;
	}

	logger.debug(
		{tool: name, durationMs: Math.round(durationMs), success},
		'Tool call metric',
	);

	// Persist to PostgreSQL (fire-and-forget)
	const requestId = getRequestId();
	pool.query(
		`INSERT INTO analytics (request_id, tool, duration_ms, success)
		 VALUES ($1, $2, $3, $4)`,
		[requestId, name, Math.round(durationMs), success],
	).catch(error => {
		logger.error({err: error, tool: name}, 'Failed to write analytics');
	});
}

/**
 * Wraps an async operation, automatically timing it and recording the result
 * via {@link recordToolCall}.
 */
export async function withMetrics<T>(
	name: string,
	fn: () => Promise<T>,
): Promise<T> {
	const start = performance.now();
	let success = true;
	try {
		return await fn();
	} catch (error) {
		success = false;
		throw error;
	} finally {
		recordToolCall(name, performance.now() - start, success);
	}
}

/** Returns a snapshot of in-memory metrics for all tracked tools. */
export function getMetricsSummary(): Record<
	string,
  ToolMetric & {avgDurationMs: number}
> {
	const summary: Record<string, ToolMetric & {avgDurationMs: number}> = {};
	for (const [name, m] of toolMetrics) {
		summary[name] = {
			...m,
			totalDurationMs: Math.round(m.totalDurationMs),
			avgDurationMs: m.calls > 0 ? Math.round(m.totalDurationMs / m.calls) : 0,
		};
	}

	return summary;
}

/** Aggregated analytics for a single tool, as returned by {@link getAnalytics}. */
export type AnalyticsSummary = {
	tool: string;
	totalCalls: number;
	successes: number;
	failures: number;
	avgDurationMs: number;
	maxDurationMs: number;
	minDurationMs: number;
};

/**
 * Queries aggregated tool analytics from PostgreSQL.
 *
 * @param since - Start of the time window. Defaults to the last 24 hours.
 */
export async function getAnalytics(since?: Date): Promise<AnalyticsSummary[]> {
	const sinceDate = since ?? new Date(Date.now() - (24 * 60 * 60 * 1000));
	const result = await pool.query<AnalyticsSummary>(
		`SELECT
			tool,
			COUNT(*)::int AS "totalCalls",
			COUNT(*) FILTER (WHERE success)::int AS successes,
			COUNT(*) FILTER (WHERE NOT success)::int AS failures,
			ROUND(AVG(duration_ms))::int AS "avgDurationMs",
			MAX(duration_ms)::int AS "maxDurationMs",
			MIN(duration_ms)::int AS "minDurationMs"
		 FROM analytics
		 WHERE timestamp >= $1
		 GROUP BY tool
		 ORDER BY "totalCalls" DESC`,
		[sinceDate.toISOString()],
	);
	return result.rows;
}

/** Writes the current in-memory metrics summary to the log. */
export function logMetricsSummary(): void {
	const summary = getMetricsSummary();
	if (Object.keys(summary).length === 0) {
		return;
	}

	logger.info({metrics: summary}, 'Metrics summary');
}

/** Clears all in-memory metrics — for testing only. */
export function resetMetrics(): void {
	toolMetrics.clear();
}
