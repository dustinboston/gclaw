/**
 * LangChain tools for Gmail operations. Provides granular email management
 * (list, read, archive, delete, spam) and their undo counterparts. All
 * destructive operations are logged to the audit trail.
 *
 * @module
 */

import {tool} from 'langchain';
import z from 'zod';
import {gmail, gmailRequest} from '../providers/gmail.ts';
import {logAudit, type AuditMetadata} from '../audit.ts';

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Lists message IDs from a Gmail label. */
export const listEmail = tool(
	async ({label, maxResults}) => {
		const response = await gmailRequest(async () =>
			gmail.users.messages.list({
				userId: 'me',
				labelIds: [label],
				maxResults,
			}));
		const messages = response.data.messages ?? [];
		return JSON.stringify(messages);
	},
	{
		name: 'list_email',
		description:
      'List emails from a Gmail label. Returns an array of { id, threadId } objects. Use read_email to get the full message.',
		schema: z.object({
			label: z
				.string()
				.default('INBOX')
				.describe('Gmail label to list messages from (e.g. INBOX, SPAM)'),
			maxResults: z
				.number()
				.default(50)
				.describe('Maximum number of messages to return'),
		}),
	},
);

/** Reads an email's metadata (from, to, subject, date, snippet, labels). */
export const readEmail = tool(
	async ({id}) => {
		const response = await gmailRequest(async () =>
			gmail.users.messages.get({
				userId: 'me',
				id,
				format: 'metadata',
				metadataHeaders: ['From', 'To', 'Subject', 'Date', 'List-Unsubscribe'],
			}));

		const getHeader = (name: string) =>
			response.data.payload?.headers?.find(h => h.name === name)?.value ?? '';

		return JSON.stringify({
			id: response.data.id,
			threadId: response.data.threadId,
			labels: response.data.labelIds,
			from: getHeader('From'),
			to: getHeader('To'),
			subject: getHeader('Subject'),
			date: getHeader('Date'),
			snippet: response.data.snippet,
		});
	},
	{
		name: 'read_email',
		description:
      'Read an email\'s metadata (from, to, subject, date, snippet, labels) via the Gmail API. Requires an ID.',
		schema: z.object({
			id: z.string().describe('The message ID to read'),
		}),
	},
);

/** Archives an email by removing the INBOX label. Logged to audit trail. */
export const archiveEmail = tool(
	async ({id, subject, from, reason}) => {
		const meta: AuditMetadata = {subject, from, reason};
		try {
			await gmailRequest(async () =>
				gmail.users.messages.modify({
					userId: 'me',
					id,
					requestBody: {
						removeLabelIds: ['INBOX'],
					},
				}));
			await logAudit('archive', id, 'success', meta);
			return `Email ${id} archived successfully.`;
		} catch (error) {
			await logAudit('archive', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'archive_email',
		description: 'Archive an email via the Gmail API. Requires an ID. Include subject, from, and reason for audit trail.',
		schema: z.object({
			id: z.string().describe('The message ID from list_email or read_email'),
			subject: z.string().optional().describe('The email subject (for audit trail)'),
			from: z.string().optional().describe('The email sender (for audit trail)'),
			reason: z.string().optional().describe('Why this action was taken (for audit trail)'),
		}),
	},
);

/** Moves an email to trash. Logged to audit trail. */
export const deleteEmail = tool(
	async ({id, subject, from, reason}) => {
		const meta: AuditMetadata = {subject, from, reason};
		try {
			await gmailRequest(async () =>
				gmail.users.messages.trash({
					userId: 'me',
					id,
				}));
			await logAudit('delete', id, 'success', meta);
			return `Email ${id} deleted successfully.`;
		} catch (error) {
			await logAudit('delete', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'delete_email',
		description: 'Delete an email via the Gmail API. Requires an ID. Include subject, from, and reason for audit trail.',
		schema: z.object({
			id: z.string().describe('The message ID from list_email or read_email'),
			subject: z.string().optional().describe('The email subject (for audit trail)'),
			from: z.string().optional().describe('The email sender (for audit trail)'),
			reason: z.string().optional().describe('Why this action was taken (for audit trail)'),
		}),
	},
);

/** Marks an email as spam (adds SPAM label, removes INBOX). Logged to audit trail. */
export const spamEmail = tool(
	async ({id, subject, from, reason}) => {
		const meta: AuditMetadata = {subject, from, reason};
		try {
			await gmailRequest(async () =>
				gmail.users.messages.modify({
					userId: 'me',
					id,
					requestBody: {
						addLabelIds: ['SPAM'],
						removeLabelIds: ['INBOX'],
					},
				}));
			await logAudit('spam', id, 'success', meta);
			return `Email ${id} marked as spam successfully.`;
		} catch (error) {
			await logAudit('spam', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'spam_email',
		description: 'Mark an email as spam via the Gmail API. Requires an ID. Include subject, from, and reason for audit trail.',
		schema: z.object({
			id: z.string().describe('The message ID from list_email or read_email'),
			subject: z.string().optional().describe('The email subject (for audit trail)'),
			from: z.string().optional().describe('The email sender (for audit trail)'),
			reason: z.string().optional().describe('Why this action was taken (for audit trail)'),
		}),
	},
);

/** Undoes an archive by re-adding the INBOX label. Logged to audit trail. */
export const unarchiveEmail = tool(
	async ({id}) => {
		try {
			await gmailRequest(async () =>
				gmail.users.messages.modify({
					userId: 'me',
					id,
					requestBody: {
						addLabelIds: ['INBOX'],
					},
				}));
			await logAudit('unarchive', id, 'success');
			return `Email ${id} moved back to inbox.`;
		} catch (error) {
			await logAudit('unarchive', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'unarchive_email',
		description: 'Undo an archive by moving the email back to the inbox. Requires an ID.',
		schema: z.object({
			id: z.string().describe('The message ID to unarchive'),
		}),
	},
);

/** Restores an email from trash. Logged to audit trail. */
export const undeleteEmail = tool(
	async ({id}) => {
		try {
			await gmailRequest(async () =>
				gmail.users.messages.untrash({
					userId: 'me',
					id,
				}));
			await logAudit('undelete', id, 'success');
			return `Email ${id} restored from trash.`;
		} catch (error) {
			await logAudit('undelete', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'undelete_email',
		description: 'Undo a delete by restoring the email from trash. Requires an ID.',
		schema: z.object({
			id: z.string().describe('The message ID to restore from trash'),
		}),
	},
);

/** Removes the SPAM label and moves an email back to inbox. Logged to audit trail. */
export const unspamEmail = tool(
	async ({id}) => {
		try {
			await gmailRequest(async () =>
				gmail.users.messages.modify({
					userId: 'me',
					id,
					requestBody: {
						removeLabelIds: ['SPAM'],
						addLabelIds: ['INBOX'],
					},
				}));
			await logAudit('unspam', id, 'success');
			return `Email ${id} unmarked as spam and moved back to inbox.`;
		} catch (error) {
			await logAudit('unspam', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'unspam_email',
		description: 'Undo a spam action by removing the SPAM label and moving back to inbox. Requires an ID.',
		schema: z.object({
			id: z.string().describe('The message ID to unspam'),
		}),
	},
);
