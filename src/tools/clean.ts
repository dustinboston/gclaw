import { HumanMessage, tool } from "langchain";
import { emailAgent } from "../agents/email.ts";
import z from "zod";

export const cleanEmail = tool(
  async ({ request }) => {
    let result = await emailAgent.invoke(
      { messages: [new HumanMessage(request)] },
      { recursionLimit: 150 },
    );
    const lastMessage = result.messages.at(-1);
    return lastMessage?.text;
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
