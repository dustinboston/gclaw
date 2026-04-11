/**
 * Session management for multi-session conversation support. Each session
 * maps to a LangGraph checkpoint `thread_id`, allowing users to start new
 * conversations or resume previous ones.
 *
 * @module
 */

import {randomUUID} from 'node:crypto';
import {pool} from './providers/database.ts';

/** A conversation session with its checkpoint count. */
export type Session = {
	threadId: string;
	messageCount: number;
};

/** Creates a new session by generating a random UUID thread ID. */
export function createSession(): string {
	return randomUUID();
}

/**
 * Lists recent sessions ordered by most recently active, with checkpoint counts.
 *
 * @param limit - Maximum number of sessions to return.
 */
export async function listSessions(limit = 10): Promise<Session[]> {
	const result = await pool.query<{
		thread_id: string;
		message_count: string;
	}>(`
		SELECT
			thread_id,
			COUNT(*) AS message_count
		FROM checkpoints
		GROUP BY thread_id
		ORDER BY MAX(checkpoint_id) DESC
		LIMIT $1
	`, [limit]);

	return result.rows.map(row => ({
		threadId: row.thread_id,
		messageCount: Number(row.message_count),
	}));
}

/** Checks whether a session with the given thread ID has any checkpoints. */
export async function sessionExists(threadId: string): Promise<boolean> {
	const result = await pool.query(
		'SELECT 1 FROM checkpoints WHERE thread_id = $1 LIMIT 1',
		[threadId],
	);
	return (result.rowCount ?? 0) > 0;
}
