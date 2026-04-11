# Tool API Reference

Winbox exposes its functionality through LangChain tools organized into four domains: email cleanup, email management, calendar, and tasks. Each tool is a LangChain `tool()` with a Zod-validated schema.

## Supervisor Tools

These are the top-level tools available to the supervisor agent. Each delegates to a specialized sub-agent.

### `clean_email`

Clean up the user's inbox with a two-phase confirmation flow.

| Parameter | Type     | Required | Description                    |
| --------- | -------- | -------- | ------------------------------ |
| `request` | `string` | Yes      | Natural language email request |

**Behavior:**

1. **Plan phase** — reads all inbox emails and proposes an action plan (archive, delete, spam, keep).
2. **Confirm** — displays the plan and prompts the user with `Execute this plan? (yes/no)`.
3. **Execute phase** — carries out the approved plan using destructive tools.

Returns `"Email cleanup cancelled by user."` if the user declines.

**Source:** `src/tools/clean.ts`

### `manage_email`

Route an email request to the email sub-agent.

| Parameter | Type     | Required | Description                    |
| --------- | -------- | -------- | ------------------------------ |
| `request` | `string` | Yes      | Natural language email request |

**Source:** `src/tools/gmail.ts`

### `manage_calendar`

Route a calendar request to the calendar sub-agent.

| Parameter | Type     | Required | Description                       |
| --------- | -------- | -------- | --------------------------------- |
| `request` | `string` | Yes      | Natural language calendar request |

**Source:** `src/tools/calendar.ts`

### `manage_tasks`

Route a task request to the tasks sub-agent.

| Parameter | Type     | Required | Description                   |
| --------- | -------- | -------- | ----------------------------- |
| `request` | `string` | Yes      | Natural language task request |

**Source:** `src/tools/tasks.ts`

---

## Gmail Tools

Available to the email agent and the clean agent (execute mode). Defined in `src/tools/gmail.ts`.

### `list_email`

List emails from a Gmail label. Returns an array of `{ id, threadId }` objects.

| Parameter    | Type     | Required | Default   | Description                          |
| ------------ | -------- | -------- | --------- | ------------------------------------ |
| `label`      | `string` | No       | `"INBOX"` | Gmail label to list messages from    |
| `maxResults` | `number` | No       | `50`      | Maximum number of messages to return |

**Returns:** JSON array of `{ id: string, threadId: string }`.

### `read_email`

Read an email's metadata.

| Parameter | Type     | Required | Description            |
| --------- | -------- | -------- | ---------------------- |
| `id`      | `string` | Yes      | The message ID to read |

**Returns:** JSON object with fields:

| Field      | Type       | Description                        |
| ---------- | ---------- | ---------------------------------- |
| `id`       | `string`   | Message ID                         |
| `threadId` | `string`   | Thread ID                          |
| `labels`   | `string[]` | Gmail label IDs on the message     |
| `from`     | `string`   | From header                        |
| `to`       | `string`   | To header                          |
| `subject`  | `string`   | Subject header                     |
| `date`     | `string`   | Date header                        |
| `snippet`  | `string`   | Gmail snippet (short preview text) |

**Headers requested:** `From`, `To`, `Subject`, `Date`, `List-Unsubscribe`.

### `archive_email`

Archive an email by removing the `INBOX` label.

| Parameter | Type     | Required | Description                           |
| --------- | -------- | -------- | ------------------------------------- |
| `id`      | `string` | Yes      | The message ID                        |
| `subject` | `string` | No       | Email subject (written to audit log)  |
| `from`    | `string` | No       | Email sender (written to audit log)   |
| `reason`  | `string` | No       | Why this action was taken (audit log) |

**Side effects:** Writes an `archive` entry to `audit.log`.

### `delete_email`

Delete an email by moving it to trash.

| Parameter | Type     | Required | Description                           |
| --------- | -------- | -------- | ------------------------------------- |
| `id`      | `string` | Yes      | The message ID                        |
| `subject` | `string` | No       | Email subject (written to audit log)  |
| `from`    | `string` | No       | Email sender (written to audit log)   |
| `reason`  | `string` | No       | Why this action was taken (audit log) |

**Side effects:** Writes a `delete` entry to `audit.log`.

### `spam_email`

Mark an email as spam. Adds the `SPAM` label and removes `INBOX`.

| Parameter | Type     | Required | Description                           |
| --------- | -------- | -------- | ------------------------------------- |
| `id`      | `string` | Yes      | The message ID                        |
| `subject` | `string` | No       | Email subject (written to audit log)  |
| `from`    | `string` | No       | Email sender (written to audit log)   |
| `reason`  | `string` | No       | Why this action was taken (audit log) |

**Side effects:** Writes a `spam` entry to `audit.log`.

### `unarchive_email`

Undo an archive by re-adding the `INBOX` label.

| Parameter | Type     | Required | Description                 |
| --------- | -------- | -------- | --------------------------- |
| `id`      | `string` | Yes      | The message ID to unarchive |

**Side effects:** Writes an `unarchive` entry to `audit.log`.

### `undelete_email`

Undo a delete by restoring the email from trash.

| Parameter | Type     | Required | Description               |
| --------- | -------- | -------- | ------------------------- |
| `id`      | `string` | Yes      | The message ID to restore |

**Side effects:** Writes an `undelete` entry to `audit.log`.

### `unspam_email`

Undo a spam action by removing `SPAM` and re-adding `INBOX`.

| Parameter | Type     | Required | Description              |
| --------- | -------- | -------- | ------------------------ |
| `id`      | `string` | Yes      | The message ID to unspam |

**Side effects:** Writes an `unspam` entry to `audit.log`.

---

## Calendar Tools

Available to the calendar agent and the clean agent (execute mode). Defined in `src/tools/calendar.ts`.

### `list_events`

List Google Calendar events across all calendars in a time range.

| Parameter    | Type     | Required | Default | Description                             |
| ------------ | -------- | -------- | ------- | --------------------------------------- |
| `timeMin`    | `string` | Yes      | --      | Start of range, ISO 8601 with tz offset |
| `timeMax`    | `string` | Yes      | --      | End of range, ISO 8601 with tz offset   |
| `maxResults` | `number` | No       | `20`    | Maximum events to return                |

**Important:** Always use local timezone offsets (e.g., `2026-04-09T00:00:00-07:00`), never `Z`/UTC.

**Returns:** JSON array of events sorted by start time:

| Field      | Type     | Description                    |
| ---------- | -------- | ------------------------------ |
| `id`       | `string` | Event ID                       |
| `calendar` | `string` | Calendar name or ID            |
| `summary`  | `string` | Event title                    |
| `start`    | `string` | Start datetime or all-day date |
| `end`      | `string` | End datetime or all-day date   |

### `create_event`

Create a Google Calendar event on the default calendar.

| Parameter       | Type     | Required | Description                         |
| --------------- | -------- | -------- | ----------------------------------- |
| `summary`       | `string` | Yes      | Title of the event                  |
| `description`   | `string` | Yes      | Details or context                  |
| `startDateTime` | `string` | Yes      | Start time, ISO 8601 with tz offset |
| `endDateTime`   | `string` | Yes      | End time, ISO 8601 with tz offset   |

**Default calendar:** Controlled by `DEFAULT_CALENDAR_ID` env var (defaults to `"primary"`).

---

## Tasks Tools

Available to the tasks agent and the clean agent (execute mode). Defined in `src/tools/tasks.ts`.

### `list_tasks`

List tasks from all Google Tasks lists.

| Parameter       | Type      | Required | Default | Description                       |
| --------------- | --------- | -------- | ------- | --------------------------------- |
| `showCompleted` | `boolean` | No       | `false` | Include completed tasks           |
| `maxResults`    | `number`  | No       | `100`   | Maximum number of tasks to return |

**Returns:** JSON array of tasks:

| Field    | Type               | Description                      |
| -------- | ------------------ | -------------------------------- |
| `id`     | `string`           | Task ID                          |
| `list`   | `string`           | Task list name                   |
| `listId` | `string`           | Task list ID                     |
| `title`  | `string`           | Task title                       |
| `notes`  | `string`           | Task notes (empty if none)       |
| `status` | `string`           | `"needsAction"` or `"completed"` |
| `due`    | `string` or `null` | Due date (ISO 8601) or null      |

### `complete_task`

Mark a task as completed.

| Parameter | Type     | Required | Description                      |
| --------- | -------- | -------- | -------------------------------- |
| `id`      | `string` | Yes      | Task ID (from `list_tasks`)      |
| `listId`  | `string` | Yes      | Task list ID (from `list_tasks`) |

### `update_task`

Update an existing task's title, notes, or due date.

| Parameter | Type     | Required | Description                      |
| --------- | -------- | -------- | -------------------------------- |
| `id`      | `string` | Yes      | Task ID (from `list_tasks`)      |
| `listId`  | `string` | Yes      | Task list ID (from `list_tasks`) |
| `title`   | `string` | No       | New title                        |
| `notes`   | `string` | No       | New notes                        |
| `due`     | `string` | No       | New due date (ISO 8601)          |

### `create_task`

Create a new task.

| Parameter | Type     | Required | Description                                       |
| --------- | -------- | -------- | ------------------------------------------------- |
| `title`   | `string` | Yes      | Short title (should start with a concrete verb)   |
| `notes`   | `string` | Yes      | Additional details or context                     |
| `listId`  | `string` | No       | Task list ID. Defaults to `DEFAULT_TASK_LIST_ID`. |

---

## Audit Log Format

All destructive email operations write structured JSON lines to `audit.log`. Each entry contains:

```json
{
  "timestamp": "2026-04-10T14:30:00.000Z",
  "requestId": "uuid-v4",
  "action": "archive | delete | spam | unarchive | undelete | unspam",
  "emailId": "message-id",
  "result": "success | failure",
  "subject": "Email subject",
  "from": "sender@example.com",
  "reason": "Why the action was taken",
  "error": "Error message (failure only)"
}
```

**Source:** `src/audit.ts`

---

## Provider Request Wrappers

Each Google API provider exports a request wrapper that applies rate limiting, retry logic, and metrics collection. These are used internally by all tools.

| Wrapper             | Provider        | Concurrency Env Var       | Default |
| ------------------- | --------------- | ------------------------- | ------- |
| `gmailRequest()`    | Gmail API v1    | `GMAIL_MAX_CONCURRENT`    | `2`     |
| `calendarRequest()` | Calendar API v3 | `CALENDAR_MAX_CONCURRENT` | `2`     |
| `tasksRequest()`    | Tasks API v1    | `TASKS_MAX_CONCURRENT`    | `2`     |

**Call chain:** `tool` -> `providerRequest()` -> `withMetrics()` -> `withRetry()` -> Google API.

**Retry behavior** (`src/retry.ts`):

- Max 3 attempts with exponential backoff (500ms base, 10s cap) and jitter (0.75x-1.25x).
- Retries on: HTTP 408, 429, 500, 502, 503, 504, `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, `socket hang up`.
