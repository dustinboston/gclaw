import { HumanMessage, tool, AIMessageChunk } from "langchain";
import { cleanAgent } from "../agents/clean.ts";
import z from "zod";

const LOG_TOOL_CALLS = false;

export const cleanEmail = tool(
  async ({ request }) => {
    const stream = await cleanAgent.stream(
      { messages: [new HumanMessage(request)] },
      { recursionLimit: 150, streamMode: "messages" },
    );

    let lastText = "";

    for await (const [message] of stream) {
      if (!(message instanceof AIMessageChunk)) continue;

      if (LOG_TOOL_CALLS && message.tool_calls?.length) {
        for (const tc of message.tool_calls) {
          console.log(`  tool call: ${tc.name}(${JSON.stringify(tc.args)})`);
        }
      }

      if (message.text) {
        lastText += message.text;
      }
    }

    if (lastText) process.stdout.write("\n");
    return "Email cleanup complete. Results already displayed to user.";
  },
  {
    name: "clean_email",
    description: `
    Clean up the users inbox
    Use this when the user wants to clean up or declutter their inbox.
    Handles listing, reading, archiving, deleting, and marking messages as spam.
    Input: natural language email request (e.g. 'clean up my inbox')
    `,
    schema: z.object({
      request: z.string().describe("Natural language email request"),
    }),
  },
);
