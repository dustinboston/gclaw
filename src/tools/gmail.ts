import { HumanMessage, tool, AIMessageChunk } from "langchain";
import z from "zod";
import { gmail, gmailRequest } from "../providers/gmail.ts";

export const manageEmail = tool(
  async ({ request }) => {
    const { emailAgent } = await import("../agents/email.ts");
    const stream = await emailAgent.stream(
      { messages: [new HumanMessage(request)] },
      { recursionLimit: 150, streamMode: "messages" },
    );

    let lastText = "";

    for await (const [message] of stream) {
      if (!(message instanceof AIMessageChunk)) continue;
      if (message.text) {
        lastText += message.text;
      }
    }

    if (lastText) process.stdout.write("\n");
    return "Email request complete. Results already displayed to user.";
  },
  {
    name: "manage_email",
    description: `
    Manage the user's Gmail inbox.
    Use this for any email-related request: cleaning up the inbox, listing emails,
    reading messages, archiving, deleting, or marking as spam.
    Input: natural language email request (e.g. 'clean up my inbox')
    `,
    schema: z.object({
      request: z.string().describe("Natural language email request"),
    }),
  },
);

export const listEmail = tool(
  async ({ label, maxResults }) => {
    const res = await gmailRequest(() =>
      gmail.users.messages.list({
        userId: "me",
        labelIds: [label],
        maxResults,
      }),
    );
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

export const readEmail = tool(
  async ({ id }) => {
    const res = await gmailRequest(() =>
      gmail.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date", "List-Unsubscribe"],
      }),
    );

    const headers = res.data.labelIds ?? [];
    const getHeader = (name: string) =>
      res.data.payload?.headers?.find((h) => h.name === name)?.value ?? "";

    return JSON.stringify({
      id: res.data.id,
      threadId: res.data.threadId,
      labels: res.data.labelIds,
      from: getHeader("From"),
      to: getHeader("To"),
      subject: getHeader("Subject"),
      date: getHeader("Date"),
      snippet: res.data.snippet,
    });
  },
  {
    name: "read_email",
    description:
      "Read an email's metadata (from, to, subject, date, snippet, labels) via the Gmail API. Requires an ID.",
    schema: z.object({
      id: z.string().describe("The message ID to read"),
    }),
  },
);

export const archiveEmail = tool(
  async ({ id }) => {
    await gmailRequest(() =>
      gmail.users.messages.modify({
        userId: "me",
        id,
        requestBody: {
          removeLabelIds: ["INBOX"],
        },
      }),
    );
    return `Email ${id} archived successfully.`;
  },
  {
    name: "archive_email",
    description: "Archive an email via the Gmail API. Requires an ID.",
    schema: z.object({
      id: z.string().describe("The message ID from list_email or read_email"),
    }),
  },
);

export const deleteEmail = tool(
  async ({ id }) => {
    await gmailRequest(() =>
      gmail.users.messages.trash({
        userId: "me",
        id,
      }),
    );
    return `Email ${id} deleted successfully.`;
  },
  {
    name: "delete_email",
    description: "Delete an email via the Gmail API. Requires an ID.",
    schema: z.object({
      id: z.string().describe("The message ID from list_email or read_email"),
    }),
  },
);

export const spamEmail = tool(
  async ({ id }) => {
    await gmailRequest(() =>
      gmail.users.messages.modify({
        userId: "me",
        id,
        requestBody: {
          addLabelIds: ["SPAM"],
          removeLabelIds: ["INBOX"],
        },
      }),
    );
    return `Email ${id} marked as spam successfully.`;
  },
  {
    name: "spam_email",
    description: "Mark an email as spam via the Gmail API. Requires an ID.",
    schema: z.object({
      id: z.string().describe("The message ID from list_email or read_email"),
    }),
  },
);
