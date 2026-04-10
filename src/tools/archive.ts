import { tool } from "langchain";
import z from "zod";
import { gmail, gmailRequest } from "../providers/gmail.ts";

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
