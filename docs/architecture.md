# Architecture

## Overview

G-Claw is a single Deep Agent (LangGraph under the hood) that manages Gmail, Google Calendar, and Google Tasks through a conversational CLI. Instead of a hand-written supervisor that routes between sub-agents, the Deep Agent receives a flat set of tools plus a library of Markdown skills. The planning middleware inside Deep Agents decides which tool to call and when to follow a skill's workflow.

```text
User (stdin/stdout)
  |
  v
+----------------------+
|     Deep Agent       |
|  (createDeepAgent)   |
|                      |
|  Planning middleware |   <- decides tool calls, follows skills
|  FilesystemBackend   |   <- loads skills/, sandboxed FS
|  PostgresSaver       |   <- persistent checkpointing
+----------+-----------+
           |
           v
  Gmail / Calendar / Tasks tools
           |
           v
  Provider wrappers (rate limit -> metrics -> retry)
           |
           v
  Google APIs
```

## The Deep Agent

**File:** `src/index.ts`

The agent is constructed with:

- **`model`** — a provider-qualified model name such as `"google-genai:gemini-3.1-pro-preview"`. Deep Agents resolves this via LangChain's `initChatModel` and installs the correct provider adapter automatically.
- **`backend`** — a `FilesystemBackend({ rootDir: process.cwd(), virtualMode: true })`. Virtual mode sandboxes the agent's filesystem access under the project root. This backend is also what makes `skills: ["/skills/"]` work — the runtime walks that directory and discovers `SKILL.md` files.
- **`skills`** — paths (relative to the backend root) where skills live. At startup every `SKILL.md` is parsed and registered; at inference time the agent follows the matching skill when its trigger phrase matches the user request.
- **`tools`** — a flat array of all Gmail, Calendar, and Tasks tools (see [API reference](./api.md)).
- **`systemPrompt`** — a short prompt describing the assistant's role, the available tool categories, and general guidance. Detailed workflows belong in skills, not in the system prompt.
- **`checkpointer`** — a `PostgresSaver` wired to the shared `pg.Pool`. Conversation state per thread persists across restarts.

## Skills

Skills replace the old sub-agent-per-domain pattern. A skill is a Markdown file with YAML frontmatter, e.g.:

```markdown
---
name: cleanup-inbox
description: Use this skill to clean up your email inbox ...
---

## Email Cleanup Workflow (follow these steps exactly)
Step 1: Call list_email ...
```

The Deep Agent's skill middleware scans `skills: ["/skills/"]` at startup. When the user asks to "clean up my inbox," the agent matches the skill's description and follows the workflow inside the Markdown.

Adding a new procedure is a matter of creating `skills/<name>/SKILL.md`. No code changes, no wiring.

## Module Structure

```text
src/
  index.ts              Deep Agent setup, interactive REPL
  config.ts             Zod-validated config from env vars
  logger.ts             Pino structured logger
  context.ts            AsyncLocalStorage request context (requestId)
  metrics.ts            Tool/API metrics + analytics persistence
  retry.ts              Exponential backoff with jitter
  audit.ts              Structured audit log for email operations
  crypto.ts             AES-256-GCM encryption for token storage
  session.ts            Session management (PostgresSaver thread IDs)
  tools/
    gmail.ts            Gmail tools (list/read/archive/delete/spam + undos)
    calendar.ts         Calendar tools (list_events, create_event)
    tasks.ts            Tasks tools (list/create/complete/update)
  providers/
    gmail.ts            Gmail API client, OAuth, rate limiter
    calendar.ts         Calendar API client, rate limiter
    tasks.ts            Tasks API client, rate limiter
    database.ts         Shared pg.Pool + initDatabase()
skills/
  cleanup-inbox/
    SKILL.md            Inbox triage workflow
scripts/
  authorize.ts          One-time OAuth2 authorization flow
```

## Request Lifecycle

1. **User input** is read from stdin in the interactive REPL (`src/index.ts`).
2. Special CLI commands (`/new`, `/sessions`, `/resume`, `/analytics`, `exit`) are handled inline without invoking the agent.
3. For regular input, `runWithContext()` creates an `AsyncLocalStorage` context with a UUID `requestId` and timestamp. This ID is injected into all log lines for the duration of the request.
4. The input is streamed through `agent.stream(...)` with the session's `thread_id` so PostgresSaver can load and extend the conversation.
5. The Deep Agent's planning middleware decides whether to call a tool, follow a skill, or answer directly.
6. Each tool call goes through: `providerRequest()` -> `withMetrics()` -> `withRetry()` -> Google API.
7. The REPL streams two kinds of output to stdout:
   - `AIMessageChunk.text` — the assistant's prose response, printed as it arrives.
   - Tool-call previews — truncated JSON for each `tool_calls` entry (e.g. `[tool] list_email {"label":"INBOX"}`) and `ToolMessage` results, so the user can see what the agent is doing.
8. After the request completes, `logMetricsSummary()` writes aggregated call counts, latencies, and success rates to the log.

## Cross-Cutting Concerns

### Rate Limiting

Each provider (`gmail.ts`, `calendar.ts`, `tasks.ts`) implements a concurrency-limited queue. Requests exceeding `*_MAX_CONCURRENT` are queued and processed in FIFO order. This prevents Google API "Too many concurrent requests" errors.

```text
Request -> acquire() -> [execute] -> release()
                |                        |
                +-- queued if at limit --+
```

### Retry Logic

`withRetry()` (`src/retry.ts`) wraps every Google API call:

- **Max attempts:** 3
- **Backoff:** Exponential (500ms base, 10s cap) with jitter (0.75x-1.25x multiplier)
- **Retryable errors:** HTTP 408, 429, 500, 502, 503, 504; network errors (`ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, `socket hang up`)
- Non-retryable errors (4xx auth failures, bad requests) are thrown immediately.

### Metrics

`withMetrics()` (`src/metrics.ts`) wraps every provider request. Tracks per-tool:

- Call count
- Success / failure count
- Total and average duration (ms)

Every call is also persisted to the PostgreSQL `analytics` table so historical usage can be queried later. `logMetricsSummary()` writes the aggregated in-memory metrics to the log after each user request, and `/analytics` inside the REPL summarizes the last 24 hours.

### Logging

Pino (`src/logger.ts`) writes structured JSON logs to `gclaw.log` (configurable). Each log line includes the `requestId` from `AsyncLocalStorage` context, enabling correlation of all log entries for a single user request.

### Audit Trail

`logAudit()` (`src/audit.ts`) writes one row to the `audit_log` table for every destructive email operation (archive, delete, spam) and every undo operation (unarchive, undelete, unspam). Each entry includes:

- Timestamp and request ID
- Action type and email ID
- Success/failure result
- Email metadata (subject, from) and reason

### Token Security

OAuth tokens are stored encrypted at rest in `.tokens.json` using AES-256-GCM (`src/crypto.ts`):

1. The `TOKEN_ENCRYPTION_KEY` env var is used as a password.
2. A random 16-byte salt is generated per encryption.
3. `scrypt` derives a 256-bit key from the password and salt.
4. A random 16-byte IV is generated per encryption.
5. The plaintext (serialized tokens) is encrypted with AES-256-GCM.
6. The output is stored as `{ encrypted: true, salt, iv, authTag, data }` (all hex-encoded).

Token refresh is automatic: when Google issues new tokens, the `auth.on('tokens')` handler merges them with existing credentials and re-encrypts.

## Key Design Decisions

1. **One Deep Agent instead of a supervisor + sub-agents.** Deep Agents already handles planning, summarization, and sub-task delegation with its built-in middleware. Hand-writing a supervisor that routes to sub-agents duplicated that work and added a tier of prompting to maintain. The flat-tools + skills shape is simpler to extend.

2. **Skills as first-class Markdown.** Multi-step workflows (like inbox cleanup) live in `skills/` as Markdown. This means a non-developer can tune the workflow without touching TypeScript, and workflows are easy to version-control and review.

3. **Undo for every destructive operation.** Archive, delete, and spam each have a corresponding undo tool (`unarchive_email`, `undelete_email`, `unspam_email`). The agent has all three in its tool set so mistakes are recoverable in-conversation.

4. **Provider-level rate limiting.** Concurrency is capped at the provider layer, not the tool layer. This means concurrent tool calls sharing the same provider still respect the limit.

5. **PostgreSQL-backed persistence.** The same `pg.Pool` backs the LangGraph checkpointer, the audit log, and the analytics table. One dependency, three features, and session persistence survives restarts.

6. **Request context via AsyncLocalStorage.** A UUID is generated per user request and automatically injected into every log line, enabling end-to-end tracing across tool calls.
