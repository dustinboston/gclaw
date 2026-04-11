/**
 * Structured audit log for destructive email operations (archive, delete,
 * spam) and their undo counterparts. Each entry is written to the
 * `audit_log` table in PostgreSQL with email metadata and the reason for
 * the action.
 *
 * @module
 */

import {logger} from './logger.ts';
import {getRequestId} from './context.ts';
import {pool} from './providers/database.ts';

/** Destructive or undo email operations that are recorded in the audit log. */
export type AuditAction = 'archive' | 'delete' | 'spam' | 'unarchive' | 'undelete' | 'unspam';

/** Optional email metadata attached to an audit log entry. */
export type AuditMetadata = {
	subject?: string;
	from?: string;
	reason?: string;
};

/**
 * Writes an audit log entry to PostgreSQL. Logs to pino regardless of
 * whether the database write succeeds.
 *
 * @param errorOrMetadata - Either an error message string (for failures) or
 *   an {@link AuditMetadata} object with subject/from/reason.
 */
export async function logAudit(
	action: AuditAction,
	emailId: string,
	result: 'success' | 'failure',
	errorOrMetadata?: string | AuditMetadata,
): Promise<void> {
	let subject: string | undefined;
	let from: string | undefined;
	let reason: string | undefined;
	let error: string | undefined;

	if (typeof errorOrMetadata === 'string') {
		reason = errorOrMetadata;
		if (result === 'failure') {
			error = errorOrMetadata;
		}
	} else if (errorOrMetadata) {
		subject = errorOrMetadata.subject;
		from = errorOrMetadata.from;
		reason = errorOrMetadata.reason;
	}

	const timestamp = new Date().toISOString();
	const requestId = getRequestId();

	try {
		await pool.query(
			`INSERT INTO audit_log (timestamp, request_id, action, email_id, result, subject, "from", reason, error)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			[timestamp, requestId, action, emailId, result, subject, from, reason, error],
		);
	} catch (writeError) {
		logger.error({err: writeError, action, emailId}, 'Failed to write audit log');
	}

	logger.info({action, emailId, result}, 'Audit: email action');
}
