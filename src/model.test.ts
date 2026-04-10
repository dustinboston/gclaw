import { describe, it, expect, vi } from "vitest";

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class ChatOpenAI {
    config: any;
    constructor(config: any) {
      this.config = config;
    }
  },
}));

import { model } from "./model.ts";

describe("model", () => {
  it("is created with correct config", () => {
    expect((model as any).config).toEqual({
      model: "gpt-5.4",
      temperature: 0,
    });
  });

  it("exports the model instance", () => {
    expect(model).toBeDefined();
  });
});
