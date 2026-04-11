# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Winbox is an AI personal assistant that manages a user's Gmail inbox, Google Calendar, and Google Tasks. It uses a multi-tier LangChain agent architecture backed by OpenAI, with Google APIs for Gmail, Calendar, and Tasks access.

## Commands

```bash
pnpm install          # Install dependencies
pnpm authorize        # Run OAuth2 flow to get/refresh Google tokens (opens browser)
pnpm start            # Run the application
pnpm test             # Run tests
pnpm typecheck        # Type-check without emitting
pnpm db:up            # Start PostgreSQL in Docker (required before pnpm start)
pnpm db:down          # Stop PostgreSQL
pnpm db:reset         # Destroy database volume and restart fresh
```

## Environment

Requires a `.env` file with: `OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`. Google OAuth tokens are stored encrypted in `.tokens.json` (created by `pnpm authorize`). Generate an encryption key with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. If you get `invalid_grant`, re-run `pnpm authorize`.

Optional env vars (with defaults): `LOG_LEVEL` (`info`), `LOG_FILE` (`winbox.log`), `OPENAI_MODEL` (`gpt-5.4`), `OAUTH_REDIRECT_URL` (`http://localhost:3000`), `OAUTH_PORT` (`3000`), `GMAIL_MAX_CONCURRENT` (`2`), `CALENDAR_MAX_CONCURRENT` (`2`), `TASKS_MAX_CONCURRENT` (`2`), `DEFAULT_CALENDAR_ID` (`primary`), `DEFAULT_TASK_LIST_ID` (`@default`), `DATABASE_URL` (`postgresql://winbox:winbox@localhost:5432/winbox`). All config is validated at startup via Zod in `src/config.ts`.

## Architecture

**Multi-tier agent system:**

1. **Supervisor agent** (`src/index.ts`) — top-level agent with tools: `clean_email`, `manage_email`, `manage_calendar`, `manage_tasks`. Routes user requests to specialized sub-agents. Uses `PostgresSaver` for persistent conversation history across restarts.
2. **Clean agent** (`src/agents/clean.ts`) — two-phase cleanup agent invoked by `clean_email`. Phase 1 (plan): reads all inbox emails and proposes actions without executing. Phase 2 (execute): after user confirmation, executes the approved plan. Created via `createCleanAgent("plan" | "execute")`.
3. **Email agent** (`src/agents/email.ts`) — specialized sub-agent invoked by `manage_email`. Has granular Gmail tools: `list_email`, `read_email`, `archive_email`, `delete_email`, `spam_email`, plus undo tools: `unarchive_email`, `undelete_email`, `unspam_email`.
4. **Calendar agent** (`src/agents/calendar.ts`) — sub-agent invoked by `manage_calendar`. Tools: `list_events`, `create_event`.
5. **Tasks agent** (`src/agents/tasks.ts`) — sub-agent invoked by `manage_tasks`. Tools: `list_tasks`, `create_task`.

**Destructive operation safeguards:**

- **Confirmation flow** — `clean_email` tool (`src/tools/clean.ts`) runs a two-phase flow: plan → user confirmation → execute. No destructive actions happen without explicit user approval.
- **Undo tools** — `unarchive_email` (re-adds INBOX label), `undelete_email` (untrashes), `unspam_email` (removes SPAM, re-adds INBOX). Available via the email agent.
- **Audit trail** — all destructive and undo operations are logged to PostgreSQL `audit_log` table with email metadata (subject, from) and the reason for the action.
- **Session management** — each launch starts a new conversation session. CLI commands `/new`, `/sessions`, `/resume <id>` allow switching between sessions. Conversation history persists across restarts via PostgreSQL.

**Key modules:**

- `src/providers/gmail.ts` — OAuth2 client setup, encrypted token persistence to `.tokens.json`, rate limiter with retry logic, exports authenticated `gmail` client
- `src/crypto.ts` — AES-256-GCM encryption/decryption for token storage, keyed by `TOKEN_ENCRYPTION_KEY`
- `src/retry.ts` — exponential backoff with jitter for transient API failures (429, 5xx, network errors)
- `src/audit.ts` — structured audit log for email operations (archive, delete, spam, and their undo counterparts) written to PostgreSQL `audit_log` table. Each entry includes email metadata (subject, from) and the reason for the action.
- `src/logger.ts` — structured logging via pino (writes to `winbox.log`), configurable with `LOG_LEVEL` and `LOG_FILE`
- `src/context.ts` — `AsyncLocalStorage`-based request context; assigns a UUID `requestId` per user request, auto-injected into all pino log lines
- `src/metrics.ts` — in-memory metrics collection for tool/API call latency, success/failure rates; `withMetrics()` wrapper and `logMetricsSummary()` for periodic reporting
- `src/config.ts` — centralized Zod-validated config from env vars, with defaults. Fails fast on missing required vars.
- `src/model.ts` — shared OpenAI model instance used by both agents
- `src/tools/` — each file exports LangChain tools wrapping Google API calls (Gmail, Calendar, Tasks)
- `src/providers/calendar.ts` — Google Calendar API client with concurrency-limited rate limiter, retry logic, and metrics; exports `calendarRequest()` wrapper
- `src/providers/tasks.ts` — Google Tasks API client with concurrency-limited rate limiter, retry logic, and metrics; exports `tasksRequest()` wrapper
- `src/providers/database.ts` — shared PostgreSQL connection pool (`pg.Pool`), `initDatabase()` for schema creation at startup. Exports `pool` used by both the checkpointer and audit system.
- `src/session.ts` — session management for multi-session support. `createSession()` generates new thread IDs, `listSessions()` queries checkpoint history, `sessionExists()` checks for existing sessions.
- `src/agents-file.ts` — loads an agent instruction file (AGENTS.md, CLAUDE.md, etc.) from the project root and injects it into the email agent's system prompt at runtime. Not cached, so edits are picked up without restart.
- `scripts/authorize.ts` — one-time OAuth2 authorization flow (local HTTP server on port 3000)

**Runtime:** Node.js with native TypeScript support (no build step). ESM modules (`"type": "module"` in package.json). Uses `--env-file=.env` for environment loading in npm scripts. Requires Docker for PostgreSQL (run `pnpm db:up` before `pnpm start`).
