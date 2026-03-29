// Create the supervisor agent
// ----------------------------------------------------------------------------

import "dotenv/config";
import { MemorySaver } from "@langchain/langgraph";
import { createAgent, HumanMessage, SystemMessage } from "langchain";
import { cleanEmail } from "./tools/clean.ts";
import { model } from "./model.ts";

// Setup
// ----------------------------------------------------------------------------

const supervisorPrompt = `
You are a helpful personal assistant.
You can clean up a user's email inbox with the clean_email tool
Break down user requests into appropriate tool calls and coordinate the results.
When a request involves multiple actions, use multiple tools in sequence.
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
  config,
);

for await (const step of supervisorStream) {
  for (const update of Object.values(step)) {
    if (update && typeof update === "object" && "messages" in update) {
      for (const message of update.messages) {
        console.log(message.toFormattedString());
      }
    }
  }
}
