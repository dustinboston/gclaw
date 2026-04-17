# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

G-Claw is an AI personal assistant that manages a user's Gmail inbox, Google Calendar, Google Tasks, and Google Drive. It is built on [Deep Agents](https://github.com/langchain-ai/deepagentsjs) (LangGraph under the hood) and uses a Gemini model by default, with Google APIs for Gmail, Calendar, Tasks, and Drive access.

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

Optional env vars (with defaults): `LOG_LEVEL` (`info`), `LOG_FILE` (`gclaw.log`), `GOOGLE_AI_MODEL` (`google-genai:gemini-3.1-pro-preview`), `GOOGLE_AI_THINKING_LEVEL` (`off`), `OAUTH_REDIRECT_URL` (`http://localhost:3000`), `OAUTH_PORT` (`3000`), `GMAIL_MAX_CONCURRENT` (`2`), `CALENDAR_MAX_CONCURRENT` (`2`), `TASKS_MAX_CONCURRENT` (`2`), `DRIVE_MAX_CONCURRENT` (`2`), `DEFAULT_CALENDAR_ID` (`primary`), `DEFAULT_TASK_LIST_ID` (`@default`), `DATABASE_URL` (`postgresql://gclaw:gclaw@localhost:5432/gclaw`). All config is validated at startup via Zod in `src/config.ts`.

OAuth scopes granted: Gmail (full), Calendar, Tasks, Drive (full). If you extend the scope list in `scripts/authorize.ts`, re-run `pnpm authorize` to refresh the token with the new scopes.

## Architecture

**Deep Agent with flat tools and skills:**

`src/index.ts` constructs a single Deep Agent via `createDeepAgent(...)` configured with:

- A `FilesystemBackend` rooted at the project directory (virtual mode). This is how Deep Agents loads skills and exposes a sandboxed filesystem to the agent.
- `skills: ["/skills/"]` — at startup, every `SKILL.md` under `skills/` is discovered and injected into the agent's prompt so the agent can follow multi-step procedures (e.g. inbox cleanup) without needing a dedicated sub-agent.
- A flat `tools` array covering Gmail, Calendar, Tasks, and Drive (see below). Tool selection is handled by the Deep Agent's planning middleware rather than by a hand-written supervisor.
- `PostgresSaver` as the checkpointer, so conversation history persists across restarts.

The agent runs inside an interactive REPL (stdin/stdout). Each user request gets a UUID `requestId` via `AsyncLocalStorage` that is auto-injected into every log line, giving end-to-end traceability across tool calls.

**Tools** (all defined under `src/tools/`):

- Gmail: `gmail_list_email`, `gmail_read_email`, `gmail_archive_email`, `gmail_delete_email`, `gmail_spam_email`, `gmail_unarchive_email`, `gmail_undelete_email`, `gmail_unspam_email`
- Calendar: `calendar_list_events`, `calendar_create_event`
- Tasks: `tasks_list_tasks`, `tasks_create_task`, `tasks_complete_task`, `tasks_update_task`
- Drive: `drive_list_files`, `drive_read_file`, `drive_create_folder`, `drive_move_file`, `drive_rename_file`, `drive_upload_text_file`, `drive_trash_file`, `drive_untrash_file`

All tool names use a `{product}_{action}` prefix to avoid collisions with Deep Agents built-ins (e.g. `read_file`). Keep this convention when adding new tools.

**Skills** (under `skills/<name>/SKILL.md`):

- `cleanup-inbox` — describes the full inbox triage workflow (list → read → act → summarize) along with the decision rules that classify each email. The Deep Agent runtime discovers this skill on startup and the agent invokes the workflow when the user asks it to clean up the inbox.

Skills are plain Markdown files with YAML frontmatter. Adding a new skill is as simple as dropping a new `skills/<name>/SKILL.md` in place — no code changes, no sub-agent wiring.

**Scheduled tasks:**

- Recurring agent invocations are declared in `cron.json` at the project root (gitignored — prompts can contain personal context). Each entry is `{name, schedule, prompt}`, Zod-validated at startup. Missing file = no jobs; malformed file = fail-fast.
- Jobs run in-process via `node-cron` (v4) while `pnpm start` is running. No catch-up for missed fires; no hot reload — edits require restart.
- Each job uses `cron:<name>` as its `thread_id`, so its conversation history accumulates in its own session (visible via `/sessions`, resumable via `/resume cron:<name>`). `noOverlap: true` prevents a slow run from stacking on itself.
- Output is routed to the pino logger (not stdout) to avoid clobbering the REPL prompt. Look for `Cron job scheduled` / `Cron job completed` / `Cron job failed` entries in `gclaw.log`.

**Destructive operation safeguards:**

- **Undo tools** — `gmail_unarchive_email` (re-adds INBOX), `gmail_undelete_email` (untrashes), `gmail_unspam_email` (removes SPAM, re-adds INBOX), `drive_untrash_file` (restores a Drive file from trash). `drive_move_file` and `drive_rename_file` record prior parent/name in the audit log so a move/rename can be undone by calling the same tool with those values. Wired into the agent's tool set.
- **Audit trail** — every destructive and undo operation is written to the PostgreSQL `audit_log` table. Each row has a `resource` column (`email` or `drive`) and a `resource_id` (email message id or Drive file id), plus `subject`/`from`/`reason` metadata (for Drive: `subject` = file name, `from` = parent folder id or prior name).
- **Session management** — each launch starts a new conversation session. CLI commands `/new`, `/sessions`, `/resume <id>`, `/analytics` allow switching between sessions and inspecting usage. Conversation history persists across restarts via PostgreSQL.

**Key modules:**

- `src/index.ts` — Deep Agent setup, interactive REPL, streaming output with tool-call preview
- `src/providers/gmail.ts` — OAuth2 client setup, encrypted token persistence to `.tokens.json`, rate limiter with retry logic, exports authenticated `gmail` client
- `src/crypto.ts` — AES-256-GCM encryption/decryption for token storage, keyed by `TOKEN_ENCRYPTION_KEY`
- `src/retry.ts` — exponential backoff with jitter for transient API failures (429, 5xx, network errors)
- `src/audit.ts` — structured audit log for destructive operations across resources (email archive/delete/spam; Drive trash/move/rename/upload/create_folder) and their undo counterparts, written to PostgreSQL `audit_log` table. Each entry carries a `resource` dimension plus subject/from/reason metadata.
- `src/logger.ts` — structured logging via pino (writes to `gclaw.log`), configurable with `LOG_LEVEL` and `LOG_FILE`
- `src/context.ts` — `AsyncLocalStorage`-based request context; assigns a UUID `requestId` per user request, auto-injected into all pino log lines
- `src/metrics.ts` — in-memory metrics collection for tool/API call latency, success/failure rates; `withMetrics()` wrapper and `logMetricsSummary()` for periodic reporting; also persists each call to the PostgreSQL `analytics` table
- `src/config.ts` — centralized Zod-validated config from env vars, with defaults. Fails fast on missing required vars.
- `src/tools/` — LangChain tools wrapping Google API calls (Gmail, Calendar, Tasks, Drive)
- `src/providers/calendar.ts` — Google Calendar API client with concurrency-limited rate limiter, retry logic, and metrics; exports `calendarRequest()` wrapper
- `src/providers/tasks.ts` — Google Tasks API client with concurrency-limited rate limiter, retry logic, and metrics; exports `tasksRequest()` wrapper
- `src/providers/drive.ts` — Google Drive API client with concurrency-limited rate limiter, retry logic, and metrics; exports `driveRequest()` wrapper
- `src/providers/database.ts` — shared PostgreSQL connection pool (`pg.Pool`), `initDatabase()` for schema creation at startup. Exports `pool` used by the checkpointer, audit, and analytics systems.
- `src/session.ts` — session management for multi-session support. `createSession()` generates new thread IDs, `listSessions()` queries checkpoint history, `sessionExists()` checks for existing sessions.
- `src/cron.ts` — in-process cron via `node-cron`. Loads and Zod-validates `cron.json`, schedules each job with `noOverlap: true`, invokes the agent under `thread_id: cron:<name>`. Exports `startCronJobs(agent)` / `stopCronJobs()`, wired into `src/index.ts` startup and shutdown.
- `skills/` — Markdown skills loaded by the Deep Agent backend at startup.
- `scripts/authorize.ts` — one-time OAuth2 authorization flow (local HTTP server on port 3000)

**Runtime:** Node.js with native TypeScript support (no build step). ESM modules (`"type": "module"` in package.json). Uses `--env-file=.env` for environment loading in npm scripts. Requires Docker for PostgreSQL (run `pnpm db:up` before `pnpm start`).
