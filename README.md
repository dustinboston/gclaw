# G-Claw

![A G next to a lobster claw](./logo.png)

G-Claw is an AI personal assistant built with Node.js, TypeScript, LangChain, LangGraph, and OpenAI. It manages your Gmail inbox, Google Calendar, and Google Tasks through a conversational interface using the Gemini LLM.

## Features

- **Email Inbox Cleanup** — `clean_email` proposes a cleanup plan, asks for confirmation, then executes. Archives, deletes, or marks spam with a full audit trail.
- **Email Management** — `manage_email` handles listing, reading, archiving, deleting, marking spam, and undoing any of those actions.
- **Calendar Management** — `manage_calendar` views your agenda, lists events, and creates new meetings.
- **Task Management** — `manage_tasks` lists tasks, creates new tasks, and runs weekly reviews.
- **Destructive Operation Safeguards** — confirmation flow before bulk actions, undo tools for every destructive operation, and a structured audit log with email metadata and reasons.
- **Observability** — structured logging (pino), request correlation IDs, tool/API metrics, and an audit trail for all destructive actions.
- **Security** — AES-256-GCM encrypted token storage, Zod-validated config, exponential backoff with jitter for API retries.

## Prerequisites

- **Node.js** (with native TypeScript support)
- **pnpm**
- A `.env` file with the following required variables:
  - `OPENAI_API_KEY`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `TOKEN_ENCRYPTION_KEY` — generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Optional variables (with defaults): `LOG_LEVEL` (`info`), `LOG_FILE` (`gclaw.log`), `OPENAI_MODEL` (`gpt-5.4`), `OAUTH_REDIRECT_URL` (`http://localhost:3000`), `OAUTH_PORT` (`3000`), `GMAIL_MAX_CONCURRENT` (`2`), `DEFAULT_CALENDAR_ID` (`primary`), `DEFAULT_TASK_LIST_ID` (`@default`).

## Installation

```bash
pnpm install
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

## Development

```bash
pnpm test             # Run tests
pnpm typecheck        # Type-check without emitting
```

## License

This project is licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). You may share and adapt this work for non-commercial purposes with attribution.
