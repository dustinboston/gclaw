/**
 * LangChain tools for Google Docs operations. Provides document creation,
 * reading (plain-text extraction from the structured Docs body), appending,
 * inserting, and find/replace. Content edits are recorded in the audit
 * trail. File-level operations (rename, move, trash) are handled by the
 * Drive tools.
 *
 * @module
 */

import {tool} from 'langchain';
import z from 'zod';
import type {docs_v1} from 'googleapis';
import {docs, docsRequest} from '../providers/docs.ts';
import {logAudit, type AuditMetadata} from '../audit.ts';

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Walks a Docs body and concatenates every textRun into a single string. */
function extractText(body: docs_v1.Schema$Body | undefined): string {
	if (!body?.content) {
		return '';
	}

	const parts: string[] = [];
	for (const element of body.content) {
		if (!element.paragraph?.elements) {
			continue;
		}

		for (const run of element.paragraph.elements) {
			if (run.textRun?.content) {
				parts.push(run.textRun.content);
			}
		}
	}

	return parts.join('');
}

/** Creates a new Google Doc at the Drive root. Logged to audit trail. */
export const docsCreateDocument = tool(
	async ({title, reason}) => {
		const meta: AuditMetadata = {subject: title, reason};
		try {
			const response = await docsRequest(async () =>
				docs.documents.create({requestBody: {title}}));
			const documentId = response.data.documentId ?? 'unknown';
			await logAudit('docs', 'create_document', documentId, 'success', meta);
			return `Document "${title}" created (id: ${documentId}). URL: https://docs.google.com/document/d/${documentId}/edit`;
		} catch (error) {
			await logAudit('docs', 'create_document', title, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'docs_create_document',
		description:
			'Create a new blank Google Doc with the given title. Returns the documentId and edit URL. '
			+ 'The doc is created at the Drive root; use drive_move_file to place it in a folder.',
		schema: z.object({
			title: z.string().describe('Title for the new document.'),
			reason: z.string().optional().describe('Why this doc is being created (for audit trail).'),
		}),
	},
);

/** Reads a Google Doc and returns its title plus a plain-text body. */
export const docsReadDocument = tool(
	async ({id}) => {
		const response = await docsRequest(async () =>
			docs.documents.get({documentId: id}));
		const doc = response.data;
		const body = extractText(doc.body ?? undefined);
		return JSON.stringify({
			documentId: doc.documentId,
			title: doc.title,
			body,
		});
	},
	{
		name: 'docs_read_document',
		description:
			'Read a Google Doc as plain text. Returns documentId, title, and body '
			+ '(plain text extracted from the doc structure).',
		schema: z.object({
			id: z.string().describe('The document id (from drive_list_files or docs_create_document).'),
		}),
	},
);

/** Appends text to the end of a Google Doc. Logged to audit trail. */
export const docsAppendText = tool(
	async ({id, text, reason}) => {
		const meta: AuditMetadata = {reason};
		try {
			await docsRequest(async () =>
				docs.documents.batchUpdate({
					documentId: id,
					requestBody: {
						requests: [
							{insertText: {endOfSegmentLocation: {segmentId: ''}, text}},
						],
					},
				}));
			await logAudit('docs', 'append_text', id, 'success', meta);
			return `Appended ${text.length} characters to document ${id}.`;
		} catch (error) {
			await logAudit('docs', 'append_text', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'docs_append_text',
		description:
			'Append text to the end of a Google Doc. Include explicit newlines in the text if needed '
			+ '(e.g. "\\n- new note\\n"). Include a reason for the audit trail.',
		schema: z.object({
			id: z.string().describe('The document id.'),
			text: z.string().describe('Text to append.'),
			reason: z.string().optional().describe('Why this text is being appended (for audit trail).'),
		}),
	},
);

/** Inserts text at a specific character index in a Google Doc. */
export const docsInsertText = tool(
	async ({id, index, text, reason}) => {
		const meta: AuditMetadata = {reason};
		try {
			await docsRequest(async () =>
				docs.documents.batchUpdate({
					documentId: id,
					requestBody: {
						requests: [
							{insertText: {location: {index}, text}},
						],
					},
				}));
			await logAudit('docs', 'insert_text', id, 'success', meta);
			return `Inserted ${text.length} characters at index ${index} in document ${id}.`;
		} catch (error) {
			await logAudit('docs', 'insert_text', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'docs_insert_text',
		description:
			'Insert text at a specific index in a Google Doc. Index 1 is the start of the body. '
			+ 'For most cases prefer docs_append_text or docs_replace_text — insertion indexes come from '
			+ 'the Docs API structure, not from reading the plain-text body.',
		schema: z.object({
			id: z.string().describe('The document id.'),
			index: z.number().describe('The character index at which to insert. Index 1 is the start of the body.'),
			text: z.string().describe('Text to insert.'),
			reason: z.string().optional().describe('Why this text is being inserted (for audit trail).'),
		}),
	},
);

/** Replaces all occurrences of a string in a Google Doc. Logged to audit trail. */
export const docsReplaceText = tool(
	async ({id, find, replace, matchCase, reason}) => {
		const meta: AuditMetadata = {from: find, subject: replace, reason};
		try {
			const response = await docsRequest(async () =>
				docs.documents.batchUpdate({
					documentId: id,
					requestBody: {
						requests: [
							{
								replaceAllText: {
									containsText: {text: find, matchCase},
									replaceText: replace,
								},
							},
						],
					},
				}));
			const occurrences = response.data.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0;
			await logAudit('docs', 'replace_text', id, 'success', meta);
			return `Replaced ${occurrences} occurrence(s) of "${find}" with "${replace}" in document ${id}.`;
		} catch (error) {
			await logAudit('docs', 'replace_text', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'docs_replace_text',
		description:
			'Find and replace all occurrences of a string in a Google Doc. '
			+ 'Returns the number of occurrences changed (0 if the string was not found).',
		schema: z.object({
			id: z.string().describe('The document id.'),
			find: z.string().describe('The exact text to search for.'),
			replace: z.string().describe('The text to replace it with.'),
			matchCase: z.boolean().default(false).describe('Whether the search is case-sensitive.'),
			reason: z.string().optional().describe('Why this replacement is happening (for audit trail).'),
		}),
	},
);
