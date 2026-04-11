import {logger} from './logger.ts';

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
}

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

export function logMetricsSummary(): void {
	const summary = getMetricsSummary();
	if (Object.keys(summary).length === 0) {
		return;
	}

	logger.info({metrics: summary}, 'Metrics summary');
}

export function resetMetrics(): void {
	toolMetrics.clear();
}
