import {appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {logger} from './logger.ts';
import {getRequestId} from './context.ts';

const auditLogPath = join(import.meta.dirname, '../audit.log');

export type AuditAction = 'archive' | 'delete' | 'spam' | 'unarchive' | 'undelete' | 'unspam';

export type AuditMetadata = {
	subject?: string;
	from?: string;
	reason?: string;
};

type AuditEntry = {
	timestamp: string;
	requestId?: string;
	action: AuditAction;
	emailId: string;
	result: 'success' | 'failure';
	subject?: string;
	from?: string;
	reason?: string;
	error?: string;
};

export function logAudit(
	action: AuditAction,
	emailId: string,
	result: 'success' | 'failure',
	errorOrMetadata?: string | AuditMetadata,
): void {
	const metadata: AuditMetadata
		= typeof errorOrMetadata === 'string'
			? {reason: errorOrMetadata}
			: errorOrMetadata ?? {};

	const entry: AuditEntry = {
		timestamp: new Date().toISOString(),
		requestId: getRequestId(),
		action,
		emailId,
		result,
	};

	if (metadata.subject) {
		entry.subject = metadata.subject;
	}

	if (metadata.from) {
		entry.from = metadata.from;
	}

	if (metadata.reason) {
		entry.reason = metadata.reason;
	}

	if (result === 'failure' && typeof errorOrMetadata === 'string') {
		entry.error = errorOrMetadata;
	}

	const line = JSON.stringify(entry) + '\n';

	try {
		appendFileSync(auditLogPath, line);
	} catch (error) {
		logger.error({err: error, entry}, 'Failed to write audit log');
	}

	logger.info({action, emailId, result}, 'Audit: email action');
}
