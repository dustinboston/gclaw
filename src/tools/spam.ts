import { tool } from "langchain";
import z from "zod";
import { gmail, gmailRequest } from "../providers/gmail.ts";

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
      id: z.string(),
    }),
  },
);
