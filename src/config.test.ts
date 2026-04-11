import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig, resetConfig } from "./config.ts";

const VALID_ENV = {
  GOOGLE_AI_API_KEY: "test-key",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  TOKEN_ENCRYPTION_KEY: "a".repeat(64),
};

describe("loadConfig", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    resetConfig();
    Object.assign(process.env, VALID_ENV);
  });

  afterEach(() => {
    for (const key of Object.keys(VALID_ENV)) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
    resetConfig();
  });

  it("loads config with all required env vars", () => {
    const config = loadConfig();
    expect(config.googleAiApiKey).toBe("test-key");
    expect(config.googleClientId).toBe("client-id");
    expect(config.googleClientSecret).toBe("client-secret");
    expect(config.tokenEncryptionKey).toBe("a".repeat(64));
  });

  it("applies defaults for optional values", () => {
    const config = loadConfig();
    expect(config.googleAiModel).toBe("gemini-2.5-flash");
    expect(config.googleAiThinkingLevel).toBe("off");
    expect(config.oauthRedirectUrl).toBe("http://localhost:3000");
    expect(config.oauthPort).toBe(3000);
    expect(config.gmailMaxConcurrent).toBe(2);
    expect(config.defaultCalendarId).toBe("primary");
    expect(config.defaultTaskListId).toBe("@default");
    expect(config.logLevel).toBe("info");
  });

  it("throws when GOOGLE_AI_API_KEY is missing", () => {
    delete process.env.GOOGLE_AI_API_KEY;
    expect(() => loadConfig()).toThrow("GOOGLE_AI_API_KEY");
  });

  it("throws when GOOGLE_CLIENT_ID is missing", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    expect(() => loadConfig()).toThrow("GOOGLE_CLIENT_ID");
  });

  it("throws when GOOGLE_CLIENT_SECRET is missing", () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(() => loadConfig()).toThrow("GOOGLE_CLIENT_SECRET");
  });

  it("throws when TOKEN_ENCRYPTION_KEY is missing", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => loadConfig()).toThrow("TOKEN_ENCRYPTION_KEY");
  });

  it("caches the config after first load", () => {
    const a = loadConfig();
    const b = loadConfig();
    expect(a).toBe(b);
  });

  it("accepts env var overrides for defaults", () => {
    process.env.GOOGLE_AI_MODEL = "gemini-2.5-pro";
    process.env.OAUTH_PORT = "4000";
    process.env.GMAIL_MAX_CONCURRENT = "5";
    const config = loadConfig();
    expect(config.googleAiModel).toBe("gemini-2.5-pro");
    expect(config.oauthPort).toBe(4000);
    expect(config.gmailMaxConcurrent).toBe(5);

    delete process.env.GOOGLE_AI_MODEL;
    delete process.env.OAUTH_PORT;
    delete process.env.GMAIL_MAX_CONCURRENT;
  });

  it("accepts thinking level override", () => {
    process.env.GOOGLE_AI_THINKING_LEVEL = "high";
    const config = loadConfig();
    expect(config.googleAiThinkingLevel).toBe("high");

    delete process.env.GOOGLE_AI_THINKING_LEVEL;
  });

  it("rejects invalid thinking level", () => {
    process.env.GOOGLE_AI_THINKING_LEVEL = "turbo";
    expect(() => loadConfig()).toThrow();

    delete process.env.GOOGLE_AI_THINKING_LEVEL;
  });
});
