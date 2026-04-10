import { tool } from "langchain";
import z from "zod";
import { gmail, gmailRequest } from "../providers/gmail.ts";

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
