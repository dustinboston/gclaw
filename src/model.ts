import { ChatOpenAI } from "@langchain/openai";

export const model = new ChatOpenAI({
  model: "gpt-5.4",
  temperature: 0,
});
