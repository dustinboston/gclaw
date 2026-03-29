import { tool } from "langchain";
import z from "zod";
import { gmail } from "../providers/gmail.ts";

export const listEmail = tool(
  async ({ label, maxResults }) => {
    const res = await gmail.users.messages.list({
      userId: "me",
      labelIds: [label],
      maxResults,
    });
    const messages = res.data.messages ?? [];
    return JSON.stringify(messages);
  },
  {
    name: "list_email",
    description:
      "List emails from a Gmail label. Returns an array of { id, threadId } objects. Use read_email to get the full message.",
    schema: z.object({
      label: z
        .string()
        .default("INBOX")
        .describe("Gmail label to list messages from (e.g. INBOX, SPAM)"),
      maxResults: z
        .number()
        .default(50)
        .describe("Maximum number of messages to return"),
    }),
  },
);
