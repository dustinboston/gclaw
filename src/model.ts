import { ChatOpenAI } from "@langchain/openai";
import { loadConfig } from "./config.ts";

const config = loadConfig();

export const model = new ChatOpenAI({
  model: config.openaiModel,
  temperature: 0,
});
