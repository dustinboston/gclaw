import { createAgent } from "langchain";
import { model } from "../model.ts";
import { listEmail } from "../tools/list.ts";
import { readEmail } from "../tools/read.ts";
import { archiveEmail } from "../tools/archive.ts";
import { deleteEmail } from "../tools/delete.ts";
import { spamEmail } from "../tools/spam.ts";

const systemPrompt = `
You are an email assistant.
You may list, read, archive, delete, or mark emails as spam.
- Use the "list_email" tool to list emails from a label.
- Use the "read_email" tool to read an email's metadata.
- Use the "archive_email" tool to archive an email.
- Use the "delete_email" tool to delete an email.
- Use the "spam_email" tool to mark an email as spam.
`;

export const emailAgent = createAgent({
  model,
  tools: [listEmail, readEmail, archiveEmail, deleteEmail, spamEmail],
  systemPrompt,
});
