import { tool } from "langchain";
import z from "zod";
import { gmail, gmailRequest } from "../providers/gmail.ts";

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
