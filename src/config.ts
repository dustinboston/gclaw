import process from 'node:process';
import z from 'zod';

const envVarNames: Record<string, string> = {
	openaiApiKey: 'OPENAI_API_KEY',
	openaiModel: 'OPENAI_MODEL',
	googleClientId: 'GOOGLE_CLIENT_ID',
	googleClientSecret: 'GOOGLE_CLIENT_SECRET',
	oauthRedirectUrl: 'OAUTH_REDIRECT_URL',
	oauthPort: 'OAUTH_PORT',
	tokenEncryptionKey: 'TOKEN_ENCRYPTION_KEY',
	gmailMaxConcurrent: 'GMAIL_MAX_CONCURRENT',
	calendarMaxConcurrent: 'CALENDAR_MAX_CONCURRENT',
	tasksMaxConcurrent: 'TASKS_MAX_CONCURRENT',
	defaultCalendarId: 'DEFAULT_CALENDAR_ID',
	defaultTaskListId: 'DEFAULT_TASK_LIST_ID',
	logLevel: 'LOG_LEVEL',
	logFile: 'LOG_FILE',
};

const configSchema = z.object({
	// OpenAI
	openaiApiKey: z.string().min(1),
	openaiModel: z.string().default('gpt-5.4'),

	// Google OAuth
	googleClientId: z.string().min(1),
	googleClientSecret: z.string().min(1),
	oauthRedirectUrl: z.string().default('http://localhost:3000'),
	oauthPort: z.coerce.number().default(3000),

	// Token encryption
	tokenEncryptionKey: z.string().min(1),

	// Runtime
	gmailMaxConcurrent: z.coerce.number().default(2),
	calendarMaxConcurrent: z.coerce.number().default(2),
	tasksMaxConcurrent: z.coerce.number().default(2),
	defaultCalendarId: z.string().default('primary'),
	defaultTaskListId: z.string().default('@default'),
	logLevel: z.string().default('info'),
	logFile: z.string().default('winbox.log'),
});

export type Config = z.infer<typeof configSchema>;

let _config: Config | undefined;

export function loadConfig(): Config {
	if (_config) {
		return _config;
	}

	const result = configSchema.safeParse({
		openaiApiKey: process.env.OPENAI_API_KEY,
		openaiModel: process.env.OPENAI_MODEL,
		googleClientId: process.env.GOOGLE_CLIENT_ID,
		googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
		oauthRedirectUrl: process.env.OAUTH_REDIRECT_URL,
		oauthPort: process.env.OAUTH_PORT,
		tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY,
		gmailMaxConcurrent: process.env.GMAIL_MAX_CONCURRENT,
		calendarMaxConcurrent: process.env.CALENDAR_MAX_CONCURRENT,
		tasksMaxConcurrent: process.env.TASKS_MAX_CONCURRENT,
		defaultCalendarId: process.env.DEFAULT_CALENDAR_ID,
		defaultTaskListId: process.env.DEFAULT_TASK_LIST_ID,
		logLevel: process.env.LOG_LEVEL,
		logFile: process.env.LOG_FILE,
	});

	if (!result.success) {
		const errors = result.error.issues
			.map(i => {
				const field = String(i.path[0]);
				const envVar = envVarNames[field] ?? field;
				return `  - ${envVar} is required`;
			})
			.join('\n');
		throw new Error(`\nMissing environment variables:\n${errors}\n\n`
			+ 'Hint: generate TOKEN_ENCRYPTION_KEY with:\n'
			+ '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n');
	}

	_config = result.data;
	return _config;
}

/** Reset cached config — for testing only. */
export function resetConfig(): void {
	_config = undefined;
}
