import {describe, it, expect, vi} from 'vitest';

const {mockQuery} = vi.hoisted(() => ({
	mockQuery: vi.fn().mockResolvedValue({rows: []}),
}));

vi.mock('pg', () => ({
	default: {
		Pool: class MockPool {
			query = mockQuery;
			constructor() {}
		},
	},
}));

vi.mock('../config.ts', () => ({
	loadConfig: () => ({
		databaseUrl: 'postgresql://test:test@localhost:5432/test',
	}),
}));

vi.mock('../logger.ts', () => ({
	logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn()},
}));

import {pool, initDatabase} from './database.ts';

describe('database provider', () => {
	it('exports a pool with query method', () => {
		expect(pool).toBeDefined();
		expect(pool.query).toBe(mockQuery);
	});

	it('initDatabase runs CREATE TABLE DDL', async () => {
		await initDatabase();
		expect(mockQuery).toHaveBeenCalledTimes(1);
		const sql = mockQuery.mock.calls[0][0] as string;
		expect(sql).toContain('CREATE TABLE IF NOT EXISTS audit_log');
		expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp');
		expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_audit_log_resource_id');
		expect(sql).toContain('CREATE TABLE IF NOT EXISTS analytics');
		expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_analytics_timestamp');
		expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_analytics_tool');
	});
});
