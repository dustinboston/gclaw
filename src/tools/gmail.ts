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
export const gmailListEmail = tool(
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
		name: 'gmail_list_email',
		description:
      'List emails from a Gmail label. Returns an array of { id, threadId } objects. Use gmail_read_email to get the full message.',
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
export const gmailReadEmail = tool(
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
		name: 'gmail_read_email',
		description:
      'Read an email\'s metadata (from, to, subject, date, snippet, labels) via the Gmail API. Requires an ID.',
		schema: z.object({
			id: z.string().describe('The message ID to read'),
		}),
	},
);

/** Archives an email by removing the INBOX label. Logged to audit trail. */
export const gmailArchiveEmail = tool(
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
			await logAudit('email', 'archive', id, 'success', meta);
			return `Email ${id} archived successfully.`;
		} catch (error) {
			await logAudit('email', 'archive', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'gmail_archive_email',
		description: 'Archive an email via the Gmail API. Requires an ID. Include subject, from, and reason for audit trail.',
		schema: z.object({
			id: z.string().describe('The message ID from gmail_list_email or gmail_read_email'),
			subject: z.string().optional().describe('The email subject (for audit trail)'),
			from: z.string().optional().describe('The email sender (for audit trail)'),
			reason: z.string().optional().describe('Why this action was taken (for audit trail)'),
		}),
	},
);

/** Moves an email to trash. Logged to audit trail. */
export const gmailDeleteEmail = tool(
	async ({id, subject, from, reason}) => {
		const meta: AuditMetadata = {subject, from, reason};
		try {
			await gmailRequest(async () =>
				gmail.users.messages.trash({
					userId: 'me',
					id,
				}));
			await logAudit('email', 'delete', id, 'success', meta);
			return `Email ${id} deleted successfully.`;
		} catch (error) {
			await logAudit('email', 'delete', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'gmail_delete_email',
		description: 'Delete an email via the Gmail API. Requires an ID. Include subject, from, and reason for audit trail.',
		schema: z.object({
			id: z.string().describe('The message ID from gmail_list_email or gmail_read_email'),
			subject: z.string().optional().describe('The email subject (for audit trail)'),
			from: z.string().optional().describe('The email sender (for audit trail)'),
			reason: z.string().optional().describe('Why this action was taken (for audit trail)'),
		}),
	},
);

/** Marks an email as spam (adds SPAM label, removes INBOX). Logged to audit trail. */
export const gmailSpamEmail = tool(
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
			await logAudit('email', 'spam', id, 'success', meta);
			return `Email ${id} marked as spam successfully.`;
		} catch (error) {
			await logAudit('email', 'spam', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'gmail_spam_email',
		description: 'Mark an email as spam via the Gmail API. Requires an ID. Include subject, from, and reason for audit trail.',
		schema: z.object({
			id: z.string().describe('The message ID from gmail_list_email or gmail_read_email'),
			subject: z.string().optional().describe('The email subject (for audit trail)'),
			from: z.string().optional().describe('The email sender (for audit trail)'),
			reason: z.string().optional().describe('Why this action was taken (for audit trail)'),
		}),
	},
);

/** Undoes an archive by re-adding the INBOX label. Logged to audit trail. */
export const gmailUnarchiveEmail = tool(
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
			await logAudit('email', 'unarchive', id, 'success');
			return `Email ${id} moved back to inbox.`;
		} catch (error) {
			await logAudit('email', 'unarchive', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'gmail_unarchive_email',
		description: 'Undo an archive by moving the email back to the inbox. Requires an ID.',
		schema: z.object({
			id: z.string().describe('The message ID to unarchive'),
		}),
	},
);

/** Restores an email from trash. Logged to audit trail. */
export const gmailUndeleteEmail = tool(
	async ({id}) => {
		try {
			await gmailRequest(async () =>
				gmail.users.messages.untrash({
					userId: 'me',
					id,
				}));
			await logAudit('email', 'undelete', id, 'success');
			return `Email ${id} restored from trash.`;
		} catch (error) {
			await logAudit('email', 'undelete', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'gmail_undelete_email',
		description: 'Undo a delete by restoring the email from trash. Requires an ID.',
		schema: z.object({
			id: z.string().describe('The message ID to restore from trash'),
		}),
	},
);

/** Removes the SPAM label and moves an email back to inbox. Logged to audit trail. */
export const gmailUnspamEmail = tool(
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
			await logAudit('email', 'unspam', id, 'success');
			return `Email ${id} unmarked as spam and moved back to inbox.`;
		} catch (error) {
			await logAudit('email', 'unspam', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'gmail_unspam_email',
		description: 'Undo a spam action by removing the SPAM label and moving back to inbox. Requires an ID.',
		schema: z.object({
			id: z.string().describe('The message ID to unspam'),
		}),
	},
);
