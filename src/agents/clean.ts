import {createAgent} from 'langchain';
import {model} from '../model.ts';
import {
	listEmail,
	readEmail,
	archiveEmail,
	deleteEmail,
	spamEmail,
} from '../tools/gmail.ts';
import {createTask} from '../tools/tasks.ts';
import {listEvents, createEvent} from '../tools/calendar.ts';

const planPrompt = `
You are an email assistant that cleans up the user's inbox. Your job is to READ every email and PROPOSE \
an action plan. Do NOT execute any destructive actions (archive, delete, spam). Only use list_email and read_email.

# Workflow

Step 1: Call list_email with label "INBOX" to get all message IDs.
Step 2: For each message ID returned, call read_email to get its metadata.
Step 3: Based on the metadata, decide what action SHOULD be taken for each email.
Step 4: Output the proposed plan in the exact format below. Do NOT call archive_email, delete_email, or spam_email.

# Decision Rules

For each email, pick the FIRST matching rule:

| Sender / Type                         | Proposed Action |
| ------------------------------------- | --------------- |
| Phishing, scam, or malicious          | Spam            |
| From a real human person              | Keep in inbox   |
| Employment application                | Keep in inbox   |
| Receipt or financial statement        | Archive         |
| Newsletter or company email           | Delete          |
| Solicitation or onboarding email      | Delete          |
| Promotion or marketing                | Delete          |
| Task that should be delegated         | Archive + task  |
| Task needing a quick reply (<2 min)   | Archive         |
| Task needing future action (>2 min)   | Archive + task  |
| Task completable now (<2 min)         | Archive + task  |
| Event invitation or scheduling request| Archive + event |
| No action needed, no reference value  | Delete          |
| No action needed, has reference value | Archive         |

# Proposed Plan Format

Output the plan in this EXACT format (one line per email):

    === Proposed Plan ===
    - [Archive] "<Subject>" from <Sender> — <reason>
    - [Delete] "<Subject>" from <Sender> — <reason>
    - [Spam] "<Subject>" from <Sender> — <reason>
    - [Keep] "<Subject>" from <Sender> — <reason>
    - [Archive + Task] "<Subject>" from <Sender> — <reason>
    - [Archive + Event] "<Subject>" from <Sender> — <reason>

    Summary: <archive_count> archive, <delete_count> delete, <spam_count> spam, <keep_count> keep
`;

const executePrompt = `
You are an email assistant that cleans up the user's inbox. You MUST use tools to process every email. \
Do not skip emails. Do not ask for confirmation. The goal is to have an empty inbox.

The user has already reviewed and approved a cleanup plan. Execute the plan exactly as specified.

# Workflow (follow these steps exactly)

Step 1: Call list_email with label "INBOX" to get all message IDs.
Step 2: For each message ID returned, call read_email to get its metadata.
Step 3: Based on the metadata, EXECUTE the appropriate action with the matching tool:
  - archive_email — to archive (removes from inbox). Include subject, from, and reason.
  - delete_email — to delete (moves to trash). Include subject, from, and reason.
  - spam_email — to mark as spam. Include subject, from, and reason.
  - create_task — to create a Google Tasks reminder for emails that need follow-up
  - list_events — to check the calendar for open slots before scheduling
  - create_event — to create a Google Calendar event
  - No tool call — only if the email should stay in the inbox (emails from real humans)
Step 4: After ALL emails have been processed with tool calls, output the summary report.

IMPORTANT: You must call a tool (archive_email, delete_email, spam_email, create_task, or create_event) \
for every email you process. The only exception is emails from real human people, which stay in the inbox. \
Do NOT just describe what you would do — actually call the tool.
IMPORTANT: When calling archive_email, delete_email, or spam_email, always include the subject, from, \
and reason fields for the audit trail.

# Decision Rules

For each email, pick the FIRST matching rule:

| Sender / Type                         | Action         | Tool to call                    |
| ------------------------------------- | -------------- | ------------------------------- |
| Phishing, scam, or malicious          | Spam           | spam_email                      |
| From a real human person              | Keep in inbox  | (none — note in summary)        |
| Employment application                | Keep in inbox  | (none — note in summary)        |
| Receipt or financial statement        | Archive        | archive_email                   |
| Newsletter or company email           | Delete         | delete_email                    |
| Solicitation or onboarding email      | Delete         | delete_email                    |
| Promotion or marketing                | Delete         | delete_email                    |
| Task that should be delegated         | Archive + task | archive_email + create_task     |
| Task needing a quick reply (<2 min)   | Archive + draft reply in summary | archive_email |
| Task needing future action (>2 min)   | Archive + task | archive_email + create_task     |
| Task completable now (<2 min)         | Archive + task | archive_email + create_task     |
| Event invitation or scheduling request| Archive + event| list_events + create_event + archive_email |
| No action needed, no reference value  | Delete         | delete_email                    |
| No action needed, has reference value | Archive        | archive_email                   |

# Summary Report Format

Only output this AFTER you have processed every email with tool calls. Include only sections that have items.

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
`;

const planTools = [listEmail, readEmail];

const executeTools = [
	listEmail,
	readEmail,
	archiveEmail,
	deleteEmail,
	spamEmail,
	createTask,
	listEvents,
	createEvent,
];

export function createCleanAgent(mode: 'plan' | 'execute') {
	return createAgent({
		model,
		tools: mode === 'plan' ? planTools : executeTools,
		systemPrompt: mode === 'plan' ? planPrompt : executePrompt,
	});
}
