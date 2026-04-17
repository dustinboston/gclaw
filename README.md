# G-Claw

![The Google "G" next to a lobster claw](./logo.png)

G-Claw is an AI personal assistant built with Node.js, TypeScript, and [Deep Agents](https://github.com/langchain-ai/deepagentsjs) (LangGraph under the hood). It manages your Gmail inbox, Google Calendar, Google Tasks, and Google Drive through a conversational CLI, defaulting to a Gemini model.

## Features

- **Flat tool access** — a single Deep Agent with Gmail, Calendar, Tasks, and Drive tools decides what to call. No hand-written supervisor, no sub-agent tier.
- **Skills** — multi-step workflows (like inbox cleanup) live in `skills/<name>/SKILL.md`. Add or tune a workflow by editing Markdown; no code changes required.
- **Destructive Operation Safeguards** — undo tools for every destructive action (`gmail_unarchive_email`, `gmail_undelete_email`, `gmail_unspam_email`, `drive_untrash_file`) and a structured audit log with resource metadata and reasons.
- **Persistent sessions** — conversation state is stored in PostgreSQL via LangGraph's `PostgresSaver`. Commands `/new`, `/sessions`, `/resume <id>` let you switch between conversations.
- **Scheduled tasks** — declare recurring agent prompts in `cron.json` (e.g. a nightly "dream"). Jobs fire in-process via `node-cron` while `pnpm start` is running; each job runs in its own checkpointed session.
- **Observability** — structured logging (pino), request correlation IDs, per-tool metrics, analytics persistence, and `/analytics` for a last-24h summary.
- **Security** — AES-256-GCM encrypted token storage, Zod-validated config, exponential backoff with jitter for API retries.

## Prerequisites

- **Node.js** (with native TypeScript support)
- **pnpm**
- **Docker** (for the PostgreSQL dependency)
- A `.env` file with the following required variables:
  - `GOOGLE_AI_API_KEY`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `TOKEN_ENCRYPTION_KEY` — generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Optional variables (with defaults): `LOG_LEVEL` (`info`), `LOG_FILE` (`gclaw.log`), `GOOGLE_AI_MODEL` (`google-genai:gemini-3.1-pro-preview`), `GOOGLE_AI_THINKING_LEVEL` (`off`), `OAUTH_REDIRECT_URL` (`http://localhost:3000`), `OAUTH_PORT` (`3000`), `GMAIL_MAX_CONCURRENT` (`2`), `CALENDAR_MAX_CONCURRENT` (`2`), `TASKS_MAX_CONCURRENT` (`2`), `DEFAULT_CALENDAR_ID` (`primary`), `DEFAULT_TASK_LIST_ID` (`@default`), `DATABASE_URL` (`postgresql://gclaw:gclaw@localhost:5432/gclaw`).

## Installation

```bash
pnpm install
pnpm db:up            # start PostgreSQL in Docker
```

## Authorization

Before running the app for the first time (or if you get an `invalid_grant` error), authorize with Google:

```bash
pnpm authorize
```

This opens your browser for Google sign-in, exchanges the authorization code for tokens, and saves them encrypted to `.tokens.json`.

## Usage

```bash
pnpm start
```

Inside the REPL:

- `/new` — start a new conversation session.
- `/sessions` — list recent sessions with checkpoint counts.
- `/resume <id>` — resume a previous session (prefix match).
- `/analytics` — show tool usage stats from the last 24 hours.
- `exit` — quit.

## Scheduled tasks

G-Claw can invoke the agent on a recurring schedule. Create `cron.json` in the project root (it's gitignored by default, since prompts may contain personal context):

```json
[
  {
    "name": "nightly-dream",
    "schedule": "0 2 * * *",
    "prompt": "Reflect on today's inbox and tasks. Write a short 'dream' — a creative, speculative note about patterns you noticed — and save it to Drive as a markdown file in the folder 'Dreams'."
  }
]
```

Each entry has:

- `name` — stable identifier. Also used as the checkpoint `thread_id` (prefixed `cron:`), so each job's history accumulates in its own session visible via `/sessions` and `/resume cron:<name>`.
- `schedule` — standard 5-field cron expression in the system timezone.
- `prompt` — what the agent is asked to do.

Jobs fire only while `pnpm start` is running; there is no catch-up for missed fires. Output goes to `gclaw.log` (`Cron job scheduled` / `Cron job completed` / `Cron job failed`) rather than stdout, so it doesn't interleave with the REPL prompt. Edits to `cron.json` require a process restart. A malformed `cron.json` fails startup fast with a Zod error.

## Development

```bash
pnpm test             # Run tests
pnpm test:watch       # Run tests in watch mode
pnpm typecheck        # Type-check without emitting
pnpm lint             # Run xo
```

## License

This project is licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). You may share and adapt this work for non-commercial purposes with attribution.
