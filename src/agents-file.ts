/**
 * Loads an agent instruction file (AGENTS.md, CLAUDE.md, etc.) from the
 * project root and injects it into agent system prompts at runtime.
 *
 * Not cached so that edits are picked up without restart.
 *
 * @module
 */

import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import process from 'node:process';

/**
 * Returns the contents of the first agent instruction file found in the
 * project root, checking in priority order.
 *
 * @param agents - Filenames to search for, in priority order.
 * @returns The file contents, or an empty string if none exist.
 */
export async function loadAgentsFile(agents = ['AGENTS.md', 'AGENT.md', 'CLAUDE.md', 'GEMINI.md', 'README.md']) {
	// Not using Promise.all, Promise.race, or Promise.any because we want to
	// return the first file that exists in the order below (deterministically).

	for (const agent of agents) {
		// eslint-disable-next-line no-await-in-loop
		const agentsFile = await readAgentsFile(agent);
		if (agentsFile) {
			return agentsFile;
		}
	}

	return '';
}

/**
 * Reads a single agent instruction file from the project root.
 *
 * @param agentFileName - The filename to read (e.g. `"AGENTS.md"`).
 * @returns The file contents, or an empty string if it doesn't exist or can't be read.
 */
export async function readAgentsFile(agentFileName: string) {
	const agentFile = join(process.cwd(), agentFileName);
	if (!existsSync(agentFile)) {
		return '';
	}

	try {
		const fileContent = await readFile(agentFile, 'utf8');
		return fileContent;
	} catch {
		return '';
	}
}
