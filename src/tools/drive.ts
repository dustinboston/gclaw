/**
 * LangChain tools for Google Drive operations. Provides file listing, reading,
 * folder creation, moves, renames, text-file uploads, and trash/untrash. All
 * destructive operations are logged to the audit trail with enough metadata
 * for a later undo (prior name, prior parent).
 *
 * @module
 */

import {tool} from 'langchain';
import z from 'zod';
import {drive, driveRequest} from '../providers/drive.ts';
import {logAudit, type AuditMetadata} from '../audit.ts';

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

const fileFields = 'id, name, mimeType, parents, modifiedTime, trashed, webViewLink';

/** Lists files in Drive, optionally filtered by a Drive query string. */
export const driveListFiles = tool(
	async ({query, pageSize, includeTrashed}) => {
		const effectiveQuery = query && query.trim().length > 0
			? query
			: (includeTrashed ? undefined : 'trashed = false');

		const response = await driveRequest(async () =>
			drive.files.list({
				q: effectiveQuery,
				pageSize,
				fields: `files(${fileFields})`,
				spaces: 'drive',
			}));

		return JSON.stringify(response.data.files ?? []);
	},
	{
		name: 'drive_list_files',
		description:
			'List files and folders in Google Drive. Pass a Drive query string '
			+ '(e.g. "name contains \'report\'", "mimeType = \'application/vnd.google-apps.folder\'", '
			+ '"\'FOLDER_ID\' in parents") to filter, or omit it to list recent files. '
			+ 'Returns id, name, mimeType, parents, modifiedTime, trashed, webViewLink.',
		schema: z.object({
			query: z
				.string()
				.optional()
				.describe('Drive query string (see https://developers.google.com/drive/api/guides/search-files).'),
			pageSize: z
				.number()
				.default(50)
				.describe('Maximum number of files to return (1–1000).'),
			includeTrashed: z
				.boolean()
				.default(false)
				.describe('If true, include trashed files when no custom query is provided.'),
		}),
	},
);

/** Reads a Drive file's metadata. For Google Docs, also exports the body as plain text. */
export const driveReadFile = tool(
	async ({id}) => {
		const metaResponse = await driveRequest(async () =>
			drive.files.get({
				fileId: id,
				fields: `${fileFields}, size, createdTime, owners(displayName, emailAddress)`,
			}));
		const meta = metaResponse.data;

		let body: string | undefined;
		if (meta.mimeType === 'application/vnd.google-apps.document') {
			const exportResponse = await driveRequest(async () =>
				drive.files.export(
					{fileId: id, mimeType: 'text/plain'},
					{responseType: 'text'},
				));
			// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
			body = exportResponse.data as string;
		}

		return JSON.stringify({...meta, body});
	},
	{
		name: 'drive_read_file',
		description:
			'Read a Google Drive file\'s metadata (name, mimeType, parents, size, modifiedTime, webViewLink). '
			+ 'For Google Docs the plain-text body is also returned under "body". '
			+ 'Binary/unsupported files return metadata only.',
		schema: z.object({
			id: z.string().describe('The file ID from drive_list_files.'),
		}),
	},
);

/** Creates a new folder. Logged to audit trail. */
export const driveCreateFolder = tool(
	async ({name, parentId, reason}) => {
		const meta: AuditMetadata = {subject: name, from: parentId, reason};
		try {
			const response = await driveRequest(async () =>
				drive.files.create({
					requestBody: {
						name,
						mimeType: 'application/vnd.google-apps.folder',
						parents: parentId ? [parentId] : undefined,
					},
					fields: fileFields,
				}));
			const folderId = response.data.id ?? 'unknown';
			await logAudit('drive', 'create_folder', folderId, 'success', meta);
			return `Folder "${name}" created (id: ${folderId}).`;
		} catch (error) {
			await logAudit('drive', 'create_folder', name, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'drive_create_folder',
		description: 'Create a new folder in Google Drive. Returns the new folder id.',
		schema: z.object({
			name: z.string().describe('Name for the new folder.'),
			parentId: z
				.string()
				.optional()
				.describe('Parent folder id (from drive_list_files). Defaults to the Drive root.'),
			reason: z.string().optional().describe('Why this folder is being created (for audit trail).'),
		}),
	},
);

/** Moves a file to a different parent folder. Logs prior parent for undo. */
export const driveMoveFile = tool(
	async ({id, newParentId, oldParentId, reason}) => {
		const meta: AuditMetadata = {from: oldParentId, reason};
		try {
			let removeParents = oldParentId;
			if (!removeParents) {
				const current = await driveRequest(async () =>
					drive.files.get({fileId: id, fields: 'parents, name'}));
				removeParents = (current.data.parents ?? []).join(',');
				meta.subject = current.data.name ?? undefined;
				meta.from = removeParents;
			}

			await driveRequest(async () =>
				drive.files.update({
					fileId: id,
					addParents: newParentId,
					removeParents,
					fields: 'id, parents',
				}));
			await logAudit('drive', 'move_file', id, 'success', meta);
			return `File ${id} moved to folder ${newParentId}.`;
		} catch (error) {
			await logAudit('drive', 'move_file', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'drive_move_file',
		description:
      'Move a Drive file or folder to a new parent folder. If oldParentId is omitted, the current parents are looked up and recorded for undo.',
		schema: z.object({
			id: z.string().describe('The file or folder id to move.'),
			newParentId: z.string().describe('The destination folder id.'),
			oldParentId: z
				.string()
				.optional()
				.describe('The current parent folder id (recorded in the audit log so the move can be undone).'),
			reason: z.string().optional().describe('Why this move is happening (for audit trail).'),
		}),
	},
);

/** Renames a file. Logs the prior name for undo. */
export const driveRenameFile = tool(
	async ({id, newName, reason}) => {
		const meta: AuditMetadata = {subject: newName, reason};
		try {
			const current = await driveRequest(async () =>
				drive.files.get({fileId: id, fields: 'name'}));
			meta.from = current.data.name ?? undefined;

			await driveRequest(async () =>
				drive.files.update({
					fileId: id,
					requestBody: {name: newName},
					fields: 'id, name',
				}));
			await logAudit('drive', 'rename_file', id, 'success', meta);
			return `File ${id} renamed to "${newName}" (was "${meta.from ?? 'unknown'}").`;
		} catch (error) {
			await logAudit('drive', 'rename_file', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'drive_rename_file',
		description: 'Rename a file or folder in Drive. The prior name is recorded in the audit log.',
		schema: z.object({
			id: z.string().describe('The file or folder id to rename.'),
			newName: z.string().describe('The new name for the file or folder.'),
			reason: z.string().optional().describe('Why this rename is happening (for audit trail).'),
		}),
	},
);

/** Uploads a new text or markdown file to Drive. */
export const driveUploadTextFile = tool(
	async ({name, content, mimeType, parentId, reason}) => {
		const meta: AuditMetadata = {subject: name, from: parentId, reason};
		try {
			const response = await driveRequest(async () =>
				drive.files.create({
					requestBody: {
						name,
						parents: parentId ? [parentId] : undefined,
					},
					media: {
						mimeType,
						body: content,
					},
					fields: fileFields,
				}));
			const fileId = response.data.id ?? 'unknown';
			await logAudit('drive', 'upload_file', fileId, 'success', meta);
			return `File "${name}" uploaded (id: ${fileId}).`;
		} catch (error) {
			await logAudit('drive', 'upload_file', name, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'drive_upload_text_file',
		description:
      'Create a new text-based file in Drive (plain text, markdown, CSV, JSON, etc). For binary formats use other means.',
		schema: z.object({
			name: z.string().describe('Name of the new file, including extension (e.g. "notes.md").'),
			content: z.string().describe('The text content of the file.'),
			mimeType: z
				.string()
				.default('text/plain')
				.describe('MIME type of the content (e.g. text/plain, text/markdown, text/csv, application/json).'),
			parentId: z
				.string()
				.optional()
				.describe('Parent folder id (from drive_list_files). Defaults to the Drive root.'),
			reason: z.string().optional().describe('Why this file is being created (for audit trail).'),
		}),
	},
);

/** Moves a file to Drive's trash. Logged to audit trail. */
export const driveTrashFile = tool(
	async ({id, reason}) => {
		const meta: AuditMetadata = {reason};
		try {
			const current = await driveRequest(async () =>
				drive.files.get({fileId: id, fields: 'name'}));
			meta.subject = current.data.name ?? undefined;

			await driveRequest(async () =>
				drive.files.update({
					fileId: id,
					requestBody: {trashed: true},
					fields: 'id, trashed',
				}));
			await logAudit('drive', 'trash_file', id, 'success', meta);
			return `File ${id} moved to trash.`;
		} catch (error) {
			await logAudit('drive', 'trash_file', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'drive_trash_file',
		description: 'Move a Drive file or folder to the trash. Include a reason for the audit trail.',
		schema: z.object({
			id: z.string().describe('The file or folder id to trash.'),
			reason: z.string().optional().describe('Why this is being trashed (for audit trail).'),
		}),
	},
);

/** Restores a file from trash. Logged to audit trail. */
export const driveUntrashFile = tool(
	async ({id}) => {
		try {
			await driveRequest(async () =>
				drive.files.update({
					fileId: id,
					requestBody: {trashed: false},
					fields: 'id, trashed',
				}));
			await logAudit('drive', 'untrash_file', id, 'success');
			return `File ${id} restored from trash.`;
		} catch (error) {
			await logAudit('drive', 'untrash_file', id, 'failure', getErrorMessage(error));
			throw error;
		}
	},
	{
		name: 'drive_untrash_file',
		description: 'Undo a trash by restoring a Drive file or folder from the trash.',
		schema: z.object({
			id: z.string().describe('The file or folder id to restore from trash.'),
		}),
	},
);
