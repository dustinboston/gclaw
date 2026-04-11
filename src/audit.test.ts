import {describe, it, expect, vi, beforeEach} from 'vitest';

const {mockQuery} = vi.hoisted(() => ({
	mockQuery: vi.fn().mockResolvedValue({rows: []}),
}));

vi.mock('./providers/database.ts', () => ({
	pool: {query: mockQuery},
}));

vi.mock('./logger.ts', () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
	},
}));

import {logAudit} from './audit.ts';
import {logger} from './logger.ts';

describe('logAudit', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('inserts an audit entry into the database', async () => {
		await logAudit('archive', 'msg123', 'success');

		expect(mockQuery).toHaveBeenCalledTimes(1);
		const [sql, params] = mockQuery.mock.calls[0];
		expect(sql).toContain('INSERT INTO audit_log');
		expect(params[2]).toBe('archive');
		expect(params[3]).toBe('msg123');
		expect(params[4]).toBe('success');
	});

	it('includes metadata fields in the insert', async () => {
		await logAudit('delete', 'msg456', 'success', {
			subject: 'Test Subject',
			from: 'sender@example.com',
			reason: 'spam-like content',
		});

		const [, params] = mockQuery.mock.calls[0];
		expect(params[5]).toBe('Test Subject');
		expect(params[6]).toBe('sender@example.com');
		expect(params[7]).toBe('spam-like content');
	});

	it('includes error field on failure', async () => {
		await logAudit('delete', 'msg456', 'failure', 'API error');

		const [, params] = mockQuery.mock.calls[0];
		expect(params[8]).toBe('API error');
	});

	it('logs to the structured logger', async () => {
		await logAudit('spam', 'msg789', 'success');
		expect(logger.info).toHaveBeenCalledWith(
			{action: 'spam', emailId: 'msg789', result: 'success'},
			'Audit: email action',
		);
	});

	it('handles database errors gracefully', async () => {
		mockQuery.mockRejectedValueOnce(new Error('connection refused'));

		await logAudit('archive', 'msg000', 'success');
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({err: expect.any(Error)}),
			'Failed to write audit log',
		);
	});
});
