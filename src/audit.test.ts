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
		await logAudit('email', 'archive', 'msg123', 'success');

		expect(mockQuery).toHaveBeenCalledTimes(1);
		const [sql, params] = mockQuery.mock.calls[0];
		expect(sql).toContain('INSERT INTO audit_log');
		expect(params[2]).toBe('email');
		expect(params[3]).toBe('archive');
		expect(params[4]).toBe('msg123');
		expect(params[5]).toBe('success');
	});

	it('includes metadata fields in the insert', async () => {
		await logAudit('email', 'delete', 'msg456', 'success', {
			subject: 'Test Subject',
			from: 'sender@example.com',
			reason: 'spam-like content',
		});

		const [, params] = mockQuery.mock.calls[0];
		expect(params[6]).toBe('Test Subject');
		expect(params[7]).toBe('sender@example.com');
		expect(params[8]).toBe('spam-like content');
	});

	it('includes error field on failure', async () => {
		await logAudit('email', 'delete', 'msg456', 'failure', 'API error');

		const [, params] = mockQuery.mock.calls[0];
		expect(params[9]).toBe('API error');
	});

	it('records the drive resource for Drive actions', async () => {
		await logAudit('drive', 'trash_file', 'file123', 'success', {
			subject: 'notes.md',
			reason: 'stale scratch file',
		});

		const [, params] = mockQuery.mock.calls[0];
		expect(params[2]).toBe('drive');
		expect(params[3]).toBe('trash_file');
		expect(params[4]).toBe('file123');
		expect(params[6]).toBe('notes.md');
		expect(params[8]).toBe('stale scratch file');
	});

	it('logs to the structured logger', async () => {
		await logAudit('email', 'spam', 'msg789', 'success');
		expect(logger.info).toHaveBeenCalledWith(
			{resource: 'email', action: 'spam', resourceId: 'msg789', result: 'success'},
			'Audit: action recorded',
		);
	});

	it('handles database errors gracefully', async () => {
		mockQuery.mockRejectedValueOnce(new Error('connection refused'));

		await logAudit('email', 'archive', 'msg000', 'success');
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({err: expect.any(Error)}),
			'Failed to write audit log',
		);
	});
});
