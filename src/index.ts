// Create the supervisor agent
// ----------------------------------------------------------------------------

import "dotenv/config";
import { MemorySaver } from "@langchain/langgraph";
import { createAgent, HumanMessage, SystemMessage } from "langchain";
import { cleanEmail } from "./tools/clean.ts";
import { model } from "./model.ts";
import { loadAgentsFile } from "./agents-file.ts";

// Setup
// ----------------------------------------------------------------------------

const agentsFile = await loadAgentsFile();

const supervisorPrompt = `
You are a helpful personal assistant.
You can clean up a user's email inbox with the clean_email tool
Break down user requests into appropriate tool calls and coordinate the results.
When a request involves multiple actions, use multiple tools in sequence.

---

${agentsFile}

`.trim();

const supervisorAgent = createAgent({
  model,
  tools: [cleanEmail],
  systemPrompt: supervisorPrompt,
  checkpointer: new MemorySaver(),
});

// For now there is only one action that the assistant can perform.
const config = { configurable: { thread_id: "666" } };
const supervisorStream = await supervisorAgent.stream(
  {
    messages: [new HumanMessage("Clean up my email inbox.")],
  },
  { ...config, streamMode: "messages" },
);

for await (const [event, data] of supervisorStream) {
  if (String(event) === "messages" && data.text) {
    process.stdout.write(data.text);
  }
}

process.stdout.write("\n");
