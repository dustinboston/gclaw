---
name: cleanup-inbox
description: Use this skill to clean up your email inbox by categorizing, archiving, or deleting emails based on their content and importance.
---

## Email Cleanup Workflow (follow these steps exactly)

Step 1: Call gmail_list_email with label "INBOX" to get all message IDs.
Step 2: For each message ID returned, call gmail_read_email to get its metadata.
Step 3: Based on the metadata, EXECUTE the appropriate action with the matching tool:
  - gmail_archive_email — to archive (removes from inbox). Include subject, from, and reason.
  - gmail_delete_email — to delete (moves to trash). Include subject, from, and reason.
  - gmail_spam_email — to mark as spam. Include subject, from, and reason.
  - tasks_create_task — to create a Google Tasks reminder for emails that need follow-up
  - calendar_list_events — to check the calendar for open slots before scheduling
  - calendar_create_event — to create a Google Calendar event
  - No tool call — only if the email should stay in the inbox (emails from real humans)
Step 4: After ALL emails have been processed with tool calls, output the summary report.

## Decision Rules

For each email, pick the FIRST matching rule:

| Sender / Type                         | Action         | Tool to call                    |
| ------------------------------------- | -------------- | ------------------------------- |
| Phishing, scam, or malicious          | Spam           | gmail_spam_email                |
| From a real human person              | Keep in inbox  | (none — note in summary)        |
| Employment application                | Keep in inbox  | (none — note in summary)        |
| Receipt or financial statement        | Archive        | gmail_archive_email             |
| Newsletter or company email           | Delete         | gmail_delete_email              |
| Solicitation or onboarding email      | Delete         | gmail_delete_email              |
| Promotion or marketing                | Delete         | gmail_delete_email              |
| Task that should be delegated         | Archive + task | gmail_archive_email + tasks_create_task |
| Task needing a quick reply (<2 min)   | Archive + draft reply in summary | gmail_archive_email |
| Task needing future action (>2 min)   | Archive + task | gmail_archive_email + tasks_create_task |
| Task completable now (<2 min)         | Archive + task | gmail_archive_email + tasks_create_task |
| Event invitation or scheduling request| Archive + event| calendar_list_events + calendar_create_event + gmail_archive_email |
| No action needed, no reference value  | Delete         | gmail_delete_email              |
| No action needed, has reference value | Archive        | gmail_archive_email             |

## Summary Report Format

Only output this AFTER you have processed every email with tool calls. Include only sections that have items.

```text
Archived:   <count>
Deleted:    <count>
Spam:       <count>
Tasks:      <count>
Events:     <count>

=== Humans (left in inbox) ===
- Message from <Person> about <Summary>

=== Delegate ===
- Delegate <Task> to <Person>

=== Respond (draft replies) ===
- Reply to <Person>: <proposed subject and body>

=== Defer ===
- Come back to "<Email Subject>" later

=== Do ===
- <Task description>
```
