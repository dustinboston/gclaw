# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

G-Claw is an AI personal assistant that manages a user's Gmail inbox, Google Calendar, and Google Tasks. It is built on [Deep Agents](https://github.com/langchain-ai/deepagentsjs) (LangGraph under the hood) and uses a Gemini model by default, with Google APIs for Gmail, Calendar, and Tasks access.

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

Requires a `.env` file with: `GOOGLE_AI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`. Google OAuth tokens are stored encrypted in `.tokens.json` (created by `pnpm authorize`). Generate an encryption key with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. If you get `invalid_grant`, re-run `pnpm authorize`.

Optional env vars (with defaults): `LOG_LEVEL` (`info`), `LOG_FILE` (`gclaw.log`), `GOOGLE_AI_MODEL` (`google-genai:gemini-3.1-pro-preview`), `GOOGLE_AI_THINKING_LEVEL` (`off`), `OAUTH_REDIRECT_URL` (`http://localhost:3000`), `OAUTH_PORT` (`3000`), `GMAIL_MAX_CONCURRENT` (`2`), `CALENDAR_MAX_CONCURRENT` (`2`), `TASKS_MAX_CONCURRENT` (`2`), `DEFAULT_CALENDAR_ID` (`primary`), `DEFAULT_TASK_LIST_ID` (`@default`), `DATABASE_URL` (`postgresql://gclaw:gclaw@localhost:5432/gclaw`). All config is validated at startup via Zod in `src/config.ts`.

## Architecture

**Deep Agent with flat tools and skills:**

`src/index.ts` constructs a single Deep Agent via `createDeepAgent(...)` configured with:

- A `FilesystemBackend` rooted at the project directory (virtual mode). This is how Deep Agents loads skills and exposes a sandboxed filesystem to the agent.
- `skills: ["/skills/"]` — at startup, every `SKILL.md` under `skills/` is discovered and injected into the agent's prompt so the agent can follow multi-step procedures (e.g. inbox cleanup) without needing a dedicated sub-agent.
- A flat `tools` array covering Gmail, Calendar, and Tasks (see below). Tool selection is handled by the Deep Agent's planning middleware rather than by a hand-written supervisor.
- `PostgresSaver` as the checkpointer, so conversation history persists across restarts.

The agent runs inside an interactive REPL (stdin/stdout). Each user request gets a UUID `requestId` via `AsyncLocalStorage` that is auto-injected into every log line, giving end-to-end traceability across tool calls.

**Tools** (all defined under `src/tools/`):

- Gmail: `list_email`, `read_email`, `archive_email`, `delete_email`, `spam_email`, `unarchive_email`, `undelete_email`, `unspam_email`
- Calendar: `list_events`, `create_event`
- Tasks: `list_tasks`, `create_task`, `complete_task`, `update_task`

**Skills** (under `skills/<name>/SKILL.md`):

- `cleanup-inbox` — describes the full inbox triage workflow (list → read → act → summarize) along with the decision rules that classify each email. The Deep Agent runtime discovers this skill on startup and the agent invokes the workflow when the user asks it to clean up the inbox.

Skills are plain Markdown files with YAML frontmatter. Adding a new skill is as simple as dropping a new `skills/<name>/SKILL.md` in place — no code changes, no sub-agent wiring.

**Destructive operation safeguards:**

- **Undo tools** — `unarchive_email` (re-adds INBOX), `undelete_email` (untrashes), `unspam_email` (removes SPAM, re-adds INBOX). Wired into the agent's tool set.
- **Audit trail** — every destructive and undo operation is written to the PostgreSQL `audit_log` table with email metadata (subject, from) and the reason for the action.
- **Session management** — each launch starts a new conversation session. CLI commands `/new`, `/sessions`, `/resume <id>`, `/analytics` allow switching between sessions and inspecting usage. Conversation history persists across restarts via PostgreSQL.

**Key modules:**

- `src/index.ts` — Deep Agent setup, interactive REPL, streaming output with tool-call preview
- `src/providers/gmail.ts` — OAuth2 client setup, encrypted token persistence to `.tokens.json`, rate limiter with retry logic, exports authenticated `gmail` client
- `src/crypto.ts` — AES-256-GCM encryption/decryption for token storage, keyed by `TOKEN_ENCRYPTION_KEY`
- `src/retry.ts` — exponential backoff with jitter for transient API failures (429, 5xx, network errors)
- `src/audit.ts` — structured audit log for email operations (archive, delete, spam, and their undo counterparts) written to PostgreSQL `audit_log` table. Each entry includes email metadata (subject, from) and the reason for the action.
- `src/logger.ts` — structured logging via pino (writes to `gclaw.log`), configurable with `LOG_LEVEL` and `LOG_FILE`
- `src/context.ts` — `AsyncLocalStorage`-based request context; assigns a UUID `requestId` per user request, auto-injected into all pino log lines
- `src/metrics.ts` — in-memory metrics collection for tool/API call latency, success/failure rates; `withMetrics()` wrapper and `logMetricsSummary()` for periodic reporting; also persists each call to the PostgreSQL `analytics` table
- `src/config.ts` — centralized Zod-validated config from env vars, with defaults. Fails fast on missing required vars.
- `src/tools/` — LangChain tools wrapping Google API calls (Gmail, Calendar, Tasks)
- `src/providers/calendar.ts` — Google Calendar API client with concurrency-limited rate limiter, retry logic, and metrics; exports `calendarRequest()` wrapper
- `src/providers/tasks.ts` — Google Tasks API client with concurrency-limited rate limiter, retry logic, and metrics; exports `tasksRequest()` wrapper
- `src/providers/database.ts` — shared PostgreSQL connection pool (`pg.Pool`), `initDatabase()` for schema creation at startup. Exports `pool` used by the checkpointer, audit, and analytics systems.
- `src/session.ts` — session management for multi-session support. `createSession()` generates new thread IDs, `listSessions()` queries checkpoint history, `sessionExists()` checks for existing sessions.
- `skills/` — Markdown skills loaded by the Deep Agent backend at startup.
- `scripts/authorize.ts` — one-time OAuth2 authorization flow (local HTTP server on port 3000)

**Runtime:** Node.js with native TypeScript support (no build step). ESM modules (`"type": "module"` in package.json). Uses `--env-file=.env` for environment loading in npm scripts. Requires Docker for PostgreSQL (run `pnpm db:up` before `pnpm start`).
