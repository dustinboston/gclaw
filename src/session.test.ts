import {describe, it, expect, vi, beforeEach} from 'vitest';

const {mockQuery} = vi.hoisted(() => ({
	mockQuery: vi.fn(),
}));

vi.mock('./providers/database.ts', () => ({
	pool: {query: mockQuery},
}));

import {createSession, listSessions, sessionExists} from './session.ts';

describe('session', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('createSession', () => {
		it('returns a UUID string', () => {
			const id = createSession();
			expect(id).toMatch(
				/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
			);
		});

		it('returns unique IDs', () => {
			const a = createSession();
			const b = createSession();
			expect(a).not.toBe(b);
		});
	});

	describe('listSessions', () => {
		it('returns formatted sessions from the database', async () => {
			mockQuery.mockResolvedValueOnce({
				rows: [
					{
						thread_id: 'abc-123',
						message_count: '5',
					},
				],
			});

			const sessions = await listSessions();
			expect(sessions).toEqual([
				{
					threadId: 'abc-123',
					messageCount: 5,
				},
			]);
		});

		it('returns empty array when no sessions exist', async () => {
			mockQuery.mockResolvedValueOnce({rows: []});
			const sessions = await listSessions();
			expect(sessions).toEqual([]);
		});

		it('passes limit parameter to query', async () => {
			mockQuery.mockResolvedValueOnce({rows: []});
			await listSessions(25);
			expect(mockQuery.mock.calls[0][1]).toEqual([25]);
		});
	});

	describe('sessionExists', () => {
		it('returns true when session exists', async () => {
			mockQuery.mockResolvedValueOnce({rowCount: 1});
			expect(await sessionExists('abc-123')).toBe(true);
		});

		it('returns false when session does not exist', async () => {
			mockQuery.mockResolvedValueOnce({rowCount: 0});
			expect(await sessionExists('no-such-id')).toBe(false);
		});
	});
});
