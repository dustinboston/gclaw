// Create the supervisor agent
// ----------------------------------------------------------------------------

import "dotenv/config";
import * as readline from "node:readline/promises";
import { MemorySaver } from "@langchain/langgraph";
import { createAgent, HumanMessage, AIMessageChunk } from "langchain";
import { cleanEmail } from "./tools/clean.ts";
import { manageEmail } from "./tools/gmail.ts";
import { manageCalendar } from "./tools/calendar.ts";
import { manageTasks } from "./tools/tasks.ts";
import { model } from "./model.ts";
import { loadAgentsFile } from "./agents-file.ts";

// Setup
// ----------------------------------------------------------------------------

const agentsFile = await loadAgentsFile();

const supervisorPrompt = `
You are a helpful personal assistant. You help the user manage their email, calendar, and tasks.

# Tools

- clean_email — Clean up the user's Gmail inbox. Handles listing, reading, archiving, deleting, and marking messages as spam.
- manage_calendar — Manage Google Calendar across all the user's calendars. View the agenda, list events in a time range, schedule new meetings, and check availability.
- manage_tasks — Manage Google Tasks across all the user's task lists. List tasks, create new tasks, mark tasks complete, and run weekly reviews.
- manage_email — Manage the user's Gmail inbox. Handles listing, reading, archiving, deleting, and marking messages as spam.

# Guidelines

- Break down user requests into appropriate tool calls and coordinate the results.
- When a request involves multiple actions, use multiple tools in sequence.
- When results are already displayed to the user by a tool, do not repeat them. Just confirm the action is done.
- For requests that span multiple domains (e.g. "what do I have going on today"), call the relevant tools and combine the results.

---

${agentsFile}

`.trim();

const supervisorAgent = createAgent({
  model,
  tools: [cleanEmail, manageCalendar, manageTasks, manageEmail],
  systemPrompt: supervisorPrompt,
  checkpointer: new MemorySaver(),
});

// Interactive loop
// ----------------------------------------------------------------------------

const config = { configurable: { thread_id: "666" } };

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("Winbox — your personal assistant");
console.log('Type "exit" to quit.\n');

while (true) {
  let input: string;
  try {
    input = await rl.question("> ");
  } catch {
    break;
  }

  const trimmed = input.trim();

  if (!trimmed) continue;
  if (trimmed.toLowerCase() === "exit") break;

  const stream = await supervisorAgent.stream(
    { messages: [new HumanMessage(trimmed)] },
    { ...config, streamMode: "messages" },
  );

  for await (const [message] of stream) {
    if (message instanceof AIMessageChunk && message.text) {
      process.stdout.write(message.text);
    }
  }

  process.stdout.write("\n\n");
}

rl.close();
