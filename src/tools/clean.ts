import { HumanMessage, tool, AIMessageChunk, ToolMessage } from "langchain";
import { emailAgent } from "../agents/email.ts";
import z from "zod";

export const cleanEmail = tool(
  async ({ request }) => {
    const stream = await emailAgent.stream(
      { messages: [new HumanMessage(request)] },
      { recursionLimit: 150, streamMode: "updates" },
    );

    let lastMessage: { text?: string } | undefined;

    for await (const update of stream) {
      for (const [node, state] of Object.entries(update)) {
        if (!state || typeof state !== "object" || !("messages" in state))
          continue;
        for (const msg of (state as { messages: unknown[] }).messages) {
          if (msg instanceof AIMessageChunk) {
            for (const tc of msg.tool_calls ?? []) {
              // console.log(`  [${node}] tool call: ${tc.name}(${JSON.stringify(tc.args)})`);
            }
            if (msg.text) {
              process.stdout.write(msg.text);
            }
            lastMessage = msg;
          } else if (msg instanceof ToolMessage) {
            // console.log(`  [${node}] tool result: ${(msg.content as string).slice(0, 120)}`);
          }
        }
      }
    }

    return lastMessage?.text ?? "No response from email agent.";
  },
  {
    name: "clean_email",
    description: `
    Clean up the users inbox
    Use this when the user wants to clean up or declutter their inbox.
    Handles, listing, reading, archiving, deleting, and marking messages as spam.
    Always clean up the entire INBOX. 
    - If an email is from a human and is UNREAD, leave it and let me know. This is an exciting event!
    - If an email is not from a human or is READ, process it using the following rules:
      - Mark obvious spam and scam emails as spam and delete it.
      - Delete newsletters and let me know about it (e.g. deleted newsletter from Wired).
      - Delete any messages from LinkedIn
      - If a message delete it and let me know about it. (e.g. deleted bank statement notification)
      - Archive receipts from Venmo, otherwise delete them.
      - Always archive bills and invoices and let me know about it (e.g. archived bill from SCE)
      - If it's from a human and it's read, archive it

    Do not ask for confirmation. Make a decision about each email and act on it.
    Input: natural language email request (e.g. 'clean up my inbox')
    `,
    schema: z.object({
      request: z.string().describe("Natural language email request"),
    }),
  },
);
