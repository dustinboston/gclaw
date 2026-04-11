# Deployment Guide

## Prerequisites

- **Node.js** v22+ (with native TypeScript execution via `--experimental-strip-types`)
- **pnpm** (v10.15+)
- A **Google Cloud project** with the Gmail, Calendar, and Tasks APIs enabled
- An **OpenAI API key**

## 1. Google Cloud Setup

### Create OAuth 2.0 Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).
3. Navigate to **APIs & Services > Library** and enable:
   - Gmail API
   - Google Calendar API
   - Google Tasks API
4. Navigate to **APIs & Services > Credentials**.
5. Click **Create Credentials > OAuth 2.0 Client ID**.
6. Set the application type to **Web application**.
7. Under **Authorized redirect URIs**, add `http://localhost:3000` (or your custom `OAUTH_REDIRECT_URL`).
8. Copy the **Client ID** and **Client Secret**.

### Configure the OAuth Consent Screen

1. Navigate to **APIs & Services > OAuth consent screen**.
2. Select **External** user type (or **Internal** for Google Workspace).
3. Fill in the required fields (app name, support email).
4. Add the following scopes:
   - `https://mail.google.com/`
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/tasks`
5. Add your Google account as a test user (required while the app is in "Testing" status).

## 2. Environment Configuration

Create a `.env` file in the project root:

```bash
# Required
GOOGLE_AI_API_KEY=sk-...
GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
TOKEN_ENCRYPTION_KEY=<64-char hex string>

# Optional (defaults shown)
GOOGLE_AI_MODEL=gemini-3.1-pro-preview
LOG_LEVEL=info
LOG_FILE=winbox.log
OAUTH_REDIRECT_URL=http://localhost:3000
OAUTH_PORT=3000
GMAIL_MAX_CONCURRENT=2
CALENDAR_MAX_CONCURRENT=2
TASKS_MAX_CONCURRENT=2
DEFAULT_CALENDAR_ID=primary
DEFAULT_TASK_LIST_ID=@default
```

Generate `TOKEN_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

All environment variables are validated at startup via Zod (`src/config.ts`). Missing required variables cause an immediate, descriptive failure.

## 3. Install Dependencies

```bash
pnpm install
```

## 4. Authorize with Google

```bash
pnpm authorize
```

This:

1. Starts a local HTTP server on `OAUTH_PORT` (default 3000).
2. Opens a browser to the Google OAuth consent screen.
3. After you grant access, exchanges the authorization code for tokens.
4. Saves the tokens encrypted (AES-256-GCM) to `.tokens.json` in the project root.

Re-run `pnpm authorize` if you encounter `invalid_grant` errors (tokens expire or are revoked).

## 5. Run the Application

### Interactive Mode

```bash
pnpm start
```

This launches the conversational CLI. Type requests in natural language and type `exit` to quit.

### Compiled Binary (via Bun)

If Bun is available, you can compile a standalone binary:

```bash
pnpm build
```

This produces `bin/winbox`. Run it the same way, but ensure `.env` and `.tokens.json` are in the working directory.

## 6. Verify the Deployment

After starting, test each domain:

```text
> what's on my agenda today
> list my tasks
> show me my inbox
```

Check the following files for operational health:

| File         | Purpose                                      |
| ------------ | -------------------------------------------- |
| `winbox.log` | Structured application logs (JSON, via pino) |
| `audit.log`  | Audit trail for destructive email operations |

## Configuration Reference

### Required Variables

| Variable               | Description                                      |
| ---------------------- | ------------------------------------------------ |
| `OPENAI_API_KEY`       | OpenAI API key for the LLM                       |
| `GOOGLE_CLIENT_ID`     | Google OAuth 2.0 client ID                       |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 client secret                   |
| `TOKEN_ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM token encryption |

### Optional Variables

| Variable                  | Default                 | Description                                       |
| ------------------------- | ----------------------- | ------------------------------------------------- |
| `OPENAI_MODEL`            | `gpt-5.4`               | OpenAI model name                                 |
| `LOG_LEVEL`               | `info`                  | Pino log level (`debug`, `info`, `warn`, `error`) |
| `LOG_FILE`                | `winbox.log`            | Path for the application log file                 |
| `OAUTH_REDIRECT_URL`      | `http://localhost:3000` | OAuth redirect URI                                |
| `OAUTH_PORT`              | `3000`                  | Port for the OAuth callback server                |
| `GMAIL_MAX_CONCURRENT`    | `2`                     | Max concurrent Gmail API requests                 |
| `CALENDAR_MAX_CONCURRENT` | `2`                     | Max concurrent Calendar API requests              |
| `TASKS_MAX_CONCURRENT`    | `2`                     | Max concurrent Tasks API requests                 |
| `DEFAULT_CALENDAR_ID`     | `primary`               | Calendar ID for creating events                   |
| `DEFAULT_TASK_LIST_ID`    | `@default`              | Task list ID for creating tasks                   |

## Security Considerations

- **Never commit `.env` or `.tokens.json`** to version control.
- `TOKEN_ENCRYPTION_KEY` protects OAuth tokens at rest. Losing it means re-running `pnpm authorize`.
- Tokens are encrypted with AES-256-GCM using scrypt-derived keys, with unique random salt and IV per encryption. Auth tags prevent tampering.
- Token refresh happens automatically. When Google issues new tokens, they are re-encrypted and merged with existing credentials.
- Concurrency limits (`*_MAX_CONCURRENT`) prevent Google API rate limit errors. Increase only if your quota supports it.

## Troubleshooting

| Symptom                        | Fix                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_grant`                | Re-run `pnpm authorize`                                                                                                                  |
| Missing env var error at start | Check `.env` against the required variables list above                                                                                   |
| `Too many concurrent requests` | Lower `*_MAX_CONCURRENT` values                                                                                                          |
| 429 / 5xx from Google APIs     | Automatic retry (3 attempts, exponential backoff) handles transient failures. Check quota in Google Cloud Console for persistent errors. |
| Empty responses from agents    | Check `winbox.log` for errors. Verify `OPENAI_API_KEY` is valid.                                                                         |
| `ECONNRESET` / `ETIMEDOUT`     | Transient network issue; retried automatically                                                                                           |
