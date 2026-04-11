/**
 * Shared LangChain LLM instance backed by Google Generative AI (Gemini).
 * Used by all agents (supervisor, email, calendar, tasks, clean).
 *
 * @module
 */

import {ChatGoogleGenerativeAI} from '@langchain/google-genai';
import {loadConfig} from './config.ts';

const thinkingLevelMap = {
	off: undefined,
	low: 'LOW',
	medium: 'MEDIUM',
	high: 'HIGH',
} as const;

const config = loadConfig();
const thinkingLevel = thinkingLevelMap[config.googleAiThinkingLevel];

/** Pre-configured LLM instance shared across all agents. */
export const model = new ChatGoogleGenerativeAI({
	model: config.googleAiModel,
	temperature: 0,
	...(thinkingLevel && {thinkingConfig: {thinkingLevel}}),
});
