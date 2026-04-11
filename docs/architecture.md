# Architecture

## Overview

G-Claw is a multi-tier LangChain agent system that manages Gmail, Google Calendar, and Google Tasks through a conversational CLI. A supervisor agent receives natural language requests and delegates to specialized sub-agents, each with their own tools and system prompts.

```text
User (stdin/stdout)
  |
  v
Supervisor Agent
  |--- clean_email ---> Clean Agent (plan) ---> [confirm] ---> Clean Agent (execute)
  |--- manage_email --> Email Agent
  |--- manage_calendar -> Calendar Agent
  |--- manage_tasks --> Tasks Agent
```

## Agent Hierarchy

### Supervisor Agent

**File:** `src/index.ts`

The entry point. Creates a LangChain agent with four tools (`clean_email`, `manage_email`, `manage_calendar`, `manage_tasks`) and routes user requests to the appropriate sub-agent. Uses `MemorySaver` for conversation persistence across turns within a session.

The supervisor's system prompt is augmented at startup with the contents of the first agent instruction file found in the project root (`AGENTS.md`, `AGENT.md`, `CLAUDE.md`, `GEMINI.md`, `README.md`), loaded by `src/agents-file.ts`. This file is re-read on each invocation (not cached) so edits take effect without restart.

### Clean Agent

**File:** `src/agents/clean.ts`  
**Tool file:** `src/tools/clean.ts`

A two-phase agent created via `createCleanAgent(mode)`:

- **Plan mode** (`mode = "plan"`): Has access to `list_email` and `read_email` only. Reads every inbox email, classifies each by type (newsletter, human, receipt, etc.), and outputs a proposed action plan. Cannot perform destructive actions.
- **Execute mode** (`mode = "execute"`): Has access to all Gmail tools plus `create_task`, `list_events`, and `create_event`. Carries out the approved plan.

The `clean_email` tool (`src/tools/clean.ts`) orchestrates the flow: plan -> display -> prompt user (`yes/no`) -> execute or cancel.

### Email Agent

**File:** `src/agents/email.ts`

Handles granular email operations. Has all eight Gmail tools: `list_email`, `read_email`, `archive_email`, `delete_email`, `spam_email`, `unarchive_email`, `undelete_email`, `unspam_email`. Follows a strict workflow: list -> read -> act -> summarize.

### Calendar Agent

**File:** `src/agents/calendar.ts`

Manages Google Calendar. Has `list_events` and `create_event`. Always checks for conflicts before creating events. Uses local timezone offsets in all datetime values.

### Tasks Agent

**File:** `src/agents/tasks.ts`

Manages Google Tasks following GTD (Getting Things Done) methodology. Has `list_tasks`, `create_task`, `update_task`, `complete_task`. Titles always start with concrete verbs.

## Module Structure

```text
src/
  index.ts              Supervisor agent, interactive loop
  model.ts              Shared OpenAI ChatModel instance
  config.ts             Zod-validated config from env vars
  logger.ts             Pino structured logger
  context.ts            AsyncLocalStorage request context (requestId)
  metrics.ts            In-memory tool/API call metrics
  retry.ts              Exponential backoff with jitter
  audit.ts              Structured audit log for email operations
  crypto.ts             AES-256-GCM encryption for token storage
  agents-file.ts        Load agent instruction files from project root
  agents/
    clean.ts            Two-phase clean agent (plan/execute)
    email.ts            Email management agent
    calendar.ts         Calendar management agent
    tasks.ts            Tasks management agent
  tools/
    clean.ts            clean_email tool (orchestrates plan/confirm/execute)
    gmail.ts            Gmail tools + manage_email supervisor tool
    calendar.ts         Calendar tools + manage_calendar supervisor tool
    tasks.ts            Tasks tools + manage_tasks supervisor tool
  providers/
    gmail.ts            Gmail API client, OAuth, rate limiter
    calendar.ts         Calendar API client, rate limiter
    tasks.ts            Tasks API client, rate limiter
scripts/
  authorize.ts          One-time OAuth2 authorization flow
```

## Request Lifecycle

1. **User input** is read from stdin in the interactive loop (`src/index.ts`).
2. `runWithContext()` creates an `AsyncLocalStorage` context with a UUID `requestId` and timestamp. This ID is injected into all log lines for the duration of the request.
3. The input is sent to the **supervisor agent** as a `HumanMessage`.
4. The supervisor selects a tool (e.g., `manage_calendar`) and invokes it.
5. The tool dynamically imports and streams the corresponding sub-agent.
6. The sub-agent calls its tools (e.g., `list_events`), each of which goes through: `providerRequest()` -> `withMetrics()` -> `withRetry()` -> Google API.
7. Agent responses are streamed to stdout as `AIMessageChunk` text.
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

`logMetricsSummary()` writes the aggregated metrics to the log after each user request.

### Logging

Pino (`src/logger.ts`) writes structured JSON logs to `gclaw.log` (configurable). Each log line includes the `requestId` from `AsyncLocalStorage` context, enabling correlation of all log entries for a single user request.

### Audit Trail

`logAudit()` (`src/audit.ts`) writes one JSON line to `audit.log` for every destructive email operation (archive, delete, spam) and every undo operation (unarchive, undelete, unspam). Each entry includes:

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

## Data Flow Diagram

```text
                     +-----------+
                     |   User    |
                     +-----+-----+
                           |
                    stdin   |   stdout
                           v
                  +--------+--------+
                  | Supervisor Agent|
                  |  (MemorySaver)  |
                  +--------+--------+
                           |
          +------+----+----+----+------+
          |      |         |           |
          v      v         v           v
       clean  email    calendar     tasks
       _email  agent    agent       agent
          |      |         |           |
          v      v         v           v
       Gmail  Gmail    Calendar     Tasks
       tools  tools     tools       tools
          |      |         |           |
          v      v         v           v
       +--+------+---------+-----------+--+
       |      Provider Request Wrappers   |
       |  rate limit -> metrics -> retry  |
       +--+------+---------+-----------+--+
          |      |         |           |
          v      v         v           v
       Gmail  Gmail    Calendar     Tasks
       API     API      API         API
```

## Key Design Decisions

1. **Multi-tier agents over a single monolithic agent.** Each sub-agent has a focused system prompt and minimal tool set. This improves tool selection accuracy and keeps context windows small.

2. **Two-phase clean flow.** The clean agent separates planning from execution with an explicit user confirmation step. The plan agent physically cannot call destructive tools (they are not in its tool set).

3. **Undo for every destructive operation.** Archive, delete, and spam each have a corresponding undo tool. This makes mistakes recoverable without leaving the application.

4. **Provider-level rate limiting.** Concurrency is capped at the provider layer, not the tool layer. This means concurrent sub-agent calls sharing the same provider still respect the limit.

5. **Dynamic agent file loading.** The supervisor's system prompt incorporates an agent instruction file from the project root. This file is read fresh on each startup (not cached), so prompt tuning doesn't require code changes.

6. **Request context via AsyncLocalStorage.** A UUID is generated per user request and automatically injected into every log line, enabling end-to-end tracing across agents and tool calls.
