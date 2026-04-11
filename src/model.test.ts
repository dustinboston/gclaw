import { describe, it, expect, vi } from "vitest";

vi.mock("@langchain/google-genai", () => ({
  ChatGoogleGenerativeAI: class ChatGoogleGenerativeAI {
    config: any;
    constructor(config: any) {
      this.config = config;
    }
  },
}));

let mockThinkingLevel = "off";
vi.mock("./config.ts", () => ({
  loadConfig: () => ({
    googleAiModel: "gemini-3.1-pro-preview",
    googleAiThinkingLevel: mockThinkingLevel,
  }),
}));

describe("model", () => {
  it("is created with correct config when thinking is off", async () => {
    mockThinkingLevel = "off";
    vi.resetModules();
    const { model } = await import("./model.ts");
    expect((model as any).config).toEqual({
      model: "gemini-3.1-pro-preview",
      temperature: 0,
    });
  });

  it("includes thinkingConfig when thinking level is set", async () => {
    mockThinkingLevel = "high";
    vi.resetModules();
    const { model } = await import("./model.ts");
    expect((model as any).config).toEqual({
      model: "gemini-3.1-pro-preview",
      temperature: 0,
      thinkingConfig: { thinkingLevel: "HIGH" },
    });
  });

  it("exports the model instance", async () => {
    vi.resetModules();
    const { model } = await import("./model.ts");
    expect(model).toBeDefined();
  });
});
