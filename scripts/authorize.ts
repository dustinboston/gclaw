import {createServer} from 'node:http';
import {execSync} from 'node:child_process';
import 'dotenv/config'; // eslint-disable-line import-x/no-unassigned-import
import {auth} from '../src/providers/gmail.ts';
import {logger} from '../src/logger.ts';
import {loadConfig} from '../src/config.ts';

const url = auth.generateAuthUrl({
	access_type: 'offline', // eslint-disable-line @typescript-eslint/naming-convention
	prompt: 'consent',
	scope: [
		'https://mail.google.com/',
		'https://www.googleapis.com/auth/calendar',
		'https://www.googleapis.com/auth/tasks',
		'https://www.googleapis.com/auth/drive',
	],
});

const config = loadConfig();

const server = createServer((request, response) => {
	const code = new URL(request.url!, config.oauthRedirectUrl).searchParams.get('code');
	if (!code) {
		response.writeHead(400).end('Missing code parameter.');
		return;
	}

	auth.getToken(code).then(({tokens}) => {
		auth.setCredentials(tokens);
		response
			.writeHead(200, {'Content-Type': 'text/html'})
			.end('<h1>Authorized! You can close this tab.</h1>');
		logger.info('Tokens saved to .tokens.json (encrypted)');
	}).catch((error: unknown) => {
		response.writeHead(500).end('Token exchange failed.');
		logger.error({err: error}, 'Token exchange failed');
	}).finally(() => {
		server.close();
	});
});

server.listen(config.oauthPort, () => {
	logger.info('Opening browser for Google authorization');
	console.log('Opening browser for Google authorization...\n');
	execSync(`start "" "${url}"`);
});
