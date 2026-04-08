# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Winbox is an AI personal assistant that manages a user's Gmail inbox. It uses a two-tier LangChain agent architecture backed by OpenAI, with Google APIs for Gmail access.

## Commands

```bash
pnpm install          # Install dependencies
pnpm authorize        # Run OAuth2 flow to get/refresh Google tokens (opens browser)
pnpm start            # Run the application
```

## Environment

Requires a `.env` file with: `OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Google OAuth tokens are stored in `.tokens.json` (created by `pnpm authorize`). If you get `invalid_grant`, re-run `pnpm authorize`.

## Architecture

**Two-tier agent system:**

1. **Supervisor agent** (`src/index.ts`) — top-level agent with a single `clean_email` tool. Receives high-level user requests.
2. **Email agent** (`src/agents/email.ts`) — specialized sub-agent invoked by `clean_email`. Has granular Gmail tools: `list_email`, `read_email`, `archive_email`, `delete_email`, `spam_email`.

**Key modules:**

- `src/providers/gmail.ts` — OAuth2 client setup, token persistence to `.tokens.json`, exports authenticated `gmail` client
- `src/model.ts` — shared OpenAI model instance used by both agents
- `src/tools/` — each file exports one LangChain tool wrapping a Gmail API call
- `src/agents-file.ts` — loads an agent instruction file (AGENTS.md, CLAUDE.md, etc.) from the project root and injects it into the email agent's system prompt at runtime. Not cached, so edits are picked up without restart.
- `scripts/authorize.ts` — one-time OAuth2 authorization flow (local HTTP server on port 3000)

**Runtime:** Node.js with native TypeScript support (no build step). ESM modules (`"type": "module"` in package.json). Uses `--env-file=.env` for environment loading in npm scripts.
