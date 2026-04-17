/**
 * Structured audit log for destructive operations across resources (email
 * archive/delete/spam, Drive trash/move/rename/upload) and their undo
 * counterparts. Each entry is written to the `audit_log` table in PostgreSQL
 * with resource metadata and the reason for the action.
 *
 * @module
 */

import {logger} from './logger.ts';
import {getRequestId} from './context.ts';
import {pool} from './providers/database.ts';

/** Resource domain an audit entry applies to. */
export type AuditResource = 'email' | 'drive';

/** Destructive or undo operations that are recorded in the audit log. */
export type AuditAction =
	// Email
	| 'archive' | 'delete' | 'spam' | 'unarchive' | 'undelete' | 'unspam'
	// Drive
	| 'trash_file' | 'untrash_file' | 'move_file' | 'rename_file'
	| 'create_folder' | 'upload_file';

/**
 * Optional metadata attached to an audit log entry. For email: `subject`
 * and `from` are the email headers. For Drive: `subject` is the file name
 * and `from` is the parent folder id (or the prior name/parent for
 * move/rename so undo is possible).
 */
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
	resource: AuditResource,
	action: AuditAction,
	resourceId: string,
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
			`INSERT INTO audit_log (timestamp, request_id, resource, action, resource_id, result, subject, "from", reason, error)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			[timestamp, requestId, resource, action, resourceId, result, subject, from, reason, error],
		);
	} catch (writeError) {
		logger.error({err: writeError, resource, action, resourceId}, 'Failed to write audit log');
	}

	logger.info({resource, action, resourceId, result}, 'Audit: action recorded');
}
