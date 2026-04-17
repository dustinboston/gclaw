---
name: daily-overview
description: Use this skill to get an overview of your calendar, tasks, and email.
---

## Description

This skill provides a comprehensive daily overview of your Google ecosystem. It gathers your schedule, recent communications, and oldest pending action items, then compiles a summary into a new Google Doc for the day.

## Workflow

### 1. Gather Calendar Events for Today

- Determine today's date.
- Calculate `timeMin` and `timeMax` for the current day in ISO 8601 format (e.g., `YYYY-MM-DDT00:00:00-07:00` and `YYYY-MM-DDT23:59:59-07:00`).
- Call `calendar_list_events` to retrieve today's schedule.

### 2. Gather Recent Emails

- Call `gmail_list_email` with `label: "INBOX"` to find recent emails.
- Call `gmail_read_email` on the returned IDs to fetch metadata (From, Subject, Date, Snippet).

### 3. Identify the Oldest 10 Tasks

- Call `tasks_list_tasks` with `showCompleted: false`.
- Review the list of pending tasks and sort them to identify the oldest 10 tasks (typically based on `due` date or implicit ordering).

### 4. Synthesize and Document

- Draft a clean, readable text summary divided into three sections:
  - **📅 Today's Schedule:** A chronological list of events.
  - **✉️ Recent Emails:** A quick overview of the latest emails in the inbox.
  - **✅ Oldest Pending Tasks:** The top 10 oldest tasks to focus on.
- Call `docs_create_document` with `title: "Daily Overview - [Today's Date]"` (e.g., "Daily Overview - April 17, 2026").
- Note the `documentId` from the creation response.
- Call `docs_append_text` with the `documentId` and the drafted summary. Be sure to use explicit newline characters (`\n`) for proper formatting in the Google Doc.

## Best Practices

- **Timezones:** Always ensure correct timezone offsets are used for calendar boundaries (never use Z/UTC).
- **Graceful Handling:** If the schedule is empty, explicitly state "No events scheduled for today" rather than skipping the section.
- **Actionable:** The summary should be concise and easily readable at a glance so the user can quickly start their day.
