# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Winbox is an AI personal assistant that manages a user's Gmail inbox. It uses a two-tier LangChain agent architecture backed by OpenAI, with Google APIs for Gmail access.

## Commands

```bash
pnpm install          # Install dependencies
pnpm authorize        # Run OAuth2 flow to get/refresh Google tokens (opens browser)
pnpm start            # Run the application
pnpm test             # Run tests
pnpm typecheck        # Type-check without emitting
```

## Environment

Requires a `.env` file with: `OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`. Google OAuth tokens are stored encrypted in `.tokens.json` (created by `pnpm authorize`). Generate an encryption key with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. If you get `invalid_grant`, re-run `pnpm authorize`.

Optional env vars (with defaults): `LOG_LEVEL` (`info`), `OPENAI_MODEL` (`gpt-5.4`), `OAUTH_REDIRECT_URL` (`http://localhost:3000`), `OAUTH_PORT` (`3000`), `GMAIL_MAX_CONCURRENT` (`2`), `DEFAULT_CALENDAR_ID` (`primary`), `DEFAULT_TASK_LIST_ID` (`@default`). All config is validated at startup via Zod in `src/config.ts`.

## Architecture

**Two-tier agent system:**

1. **Supervisor agent** (`src/index.ts`) — top-level agent with a single `clean_email` tool. Receives high-level user requests.
2. **Email agent** (`src/agents/email.ts`) — specialized sub-agent invoked by `clean_email`. Has granular Gmail tools: `list_email`, `read_email`, `archive_email`, `delete_email`, `spam_email`.

**Key modules:**

- `src/providers/gmail.ts` — OAuth2 client setup, encrypted token persistence to `.tokens.json`, rate limiter with retry logic, exports authenticated `gmail` client
- `src/crypto.ts` — AES-256-GCM encryption/decryption for token storage, keyed by `TOKEN_ENCRYPTION_KEY`
- `src/retry.ts` — exponential backoff with jitter for transient API failures (429, 5xx, network errors)
- `src/audit.ts` — structured audit log for destructive email operations (archive, delete, spam) written to `audit.log`
- `src/logger.ts` — structured logging via pino (writes to stderr), configurable with `LOG_LEVEL`
- `src/config.ts` — centralized Zod-validated config from env vars, with defaults. Fails fast on missing required vars.
- `src/model.ts` — shared OpenAI model instance used by both agents
- `src/tools/` — each file exports one LangChain tool wrapping a Gmail API call
- `src/agents-file.ts` — loads an agent instruction file (AGENTS.md, CLAUDE.md, etc.) from the project root and injects it into the email agent's system prompt at runtime. Not cached, so edits are picked up without restart.
- `scripts/authorize.ts` — one-time OAuth2 authorization flow (local HTTP server on port 3000)

**Runtime:** Node.js with native TypeScript support (no build step). ESM modules (`"type": "module"` in package.json). Uses `--env-file=.env` for environment loading in npm scripts.
