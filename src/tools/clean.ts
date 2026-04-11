import * as readline from "node:readline/promises";
import { HumanMessage, tool, AIMessageChunk } from "langchain";
import { createCleanAgent } from "../agents/clean.ts";
import z from "zod";
import { logger } from "../logger.ts";

async function streamAgent(
  agent: ReturnType<typeof createCleanAgent>,
  request: string,
): Promise<string> {
  const stream = await agent.stream(
    { messages: [new HumanMessage(request)] },
    { recursionLimit: 150, streamMode: "messages" },
  );

  let text = "";
  for await (const [message] of stream) {
    if (message instanceof AIMessageChunk && message.text) {
      text += message.text;
    }
  }
  return text;
}

async function askConfirmation(plan: string): Promise<boolean> {
  process.stdout.write(plan + "\n\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question("Execute this plan? (yes/no): ");
    return answer.trim().toLowerCase().startsWith("y");
  } finally {
    rl.close();
  }
}

export const cleanEmail = tool(
  async ({ request }) => {
    try {
      // Phase 1: Plan — read emails and propose actions
      logger.info("Clean agent: generating plan");
      const planAgent = createCleanAgent("plan");
      const plan = await streamAgent(planAgent, request);

      if (!plan.trim()) {
        return "No emails to process.";
      }

      // Phase 2: Confirm — show plan and ask user
      const confirmed = await askConfirmation(plan);

      if (!confirmed) {
        logger.info("Clean agent: user rejected plan");
        return "Email cleanup cancelled by user.";
      }

      // Phase 3: Execute — carry out the confirmed plan
      logger.info("Clean agent: executing confirmed plan");
      const executeAgent = createCleanAgent("execute");
      const result = await streamAgent(executeAgent, request);
      if (result) process.stdout.write(result + "\n");

      return "Email cleanup complete. Results already displayed to user.";
    } catch (error) {
      logger.error({ err: error }, "Clean agent failed");
      return `Email cleanup failed: ${(error as Error).message}`;
    }
  },
  {
    name: "clean_email",
    description: `
    Clean up the users inbox with a confirmation step.
    Use this when the user wants to clean up or declutter their inbox.
    First proposes a plan, then asks the user to confirm before executing.
    Handles listing, reading, archiving, deleting, and marking messages as spam.
    Input: natural language email request (e.g. 'clean up my inbox')
    `,
    schema: z.object({
      request: z.string().describe("Natural language email request"),
    }),
  },
);
