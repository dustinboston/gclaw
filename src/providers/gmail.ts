import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {google, type Auth} from 'googleapis';
import {encrypt, decrypt, isEncrypted} from '../crypto.ts';
import {withRetry} from '../retry.ts';
import {logger} from '../logger.ts';
import {loadConfig} from '../config.ts';
import {withMetrics} from '../metrics.ts';

const config = loadConfig();
const tokensPath = join(import.meta.dirname, '../../.tokens.json');

const auth = new google.auth.OAuth2(
	config.googleClientId,
	config.googleClientSecret,
	config.oauthRedirectUrl,
);

if (existsSync(tokensPath)) {
	const raw: unknown = JSON.parse(readFileSync(tokensPath, 'utf8'));
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	const tokens = (isEncrypted(raw) ? JSON.parse(decrypt(raw)) : raw) as Auth.Credentials;
	auth.setCredentials(tokens);
	logger.debug('Loaded OAuth tokens from disk');
}

function loadExistingTokens(): Auth.Credentials {
	if (!existsSync(tokensPath)) {
		return {};
	}

	const raw: unknown = JSON.parse(readFileSync(tokensPath, 'utf8'));
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return (isEncrypted(raw) ? JSON.parse(decrypt(raw)) : raw) as Auth.Credentials;
}

auth.on('tokens', tokens => {
	const existing = loadExistingTokens();
	const merged = {...existing, ...tokens};
	writeFileSync(tokensPath, JSON.stringify(encrypt(JSON.stringify(merged))));
	logger.info('OAuth tokens refreshed and saved (encrypted)');
});

export {auth};

const rawGmail = google.gmail({version: 'v1', auth});

// Rate limiter to avoid "Too many concurrent requests" errors from Google.
const maxConcurrent = config.gmailMaxConcurrent;
let active = 0;
const queue: Array<() => void> = [];

async function acquire(): Promise<void> {
	if (active < maxConcurrent) {
		active++;
		return;
	}

	return new Promise(resolve => {
		queue.push(resolve);
	});
}

function release() {
	if (queue.length > 0) {
		queue.shift()!();
	} else {
		active--;
	}
}

export async function gmailRequest<T>(fn: () => Promise<T>): Promise<T> {
	await acquire();
	try {
		return await withMetrics('gmail_api', async () => withRetry(fn));
	} finally {
		release();
	}
}

export const gmail = rawGmail;
