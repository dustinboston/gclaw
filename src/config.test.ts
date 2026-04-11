import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig, resetConfig } from "./config.ts";

const VALID_ENV = {
  OPENAI_API_KEY: "sk-test",
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
    expect(config.openaiApiKey).toBe("sk-test");
    expect(config.googleClientId).toBe("client-id");
    expect(config.googleClientSecret).toBe("client-secret");
    expect(config.tokenEncryptionKey).toBe("a".repeat(64));
  });

  it("applies defaults for optional values", () => {
    const config = loadConfig();
    expect(config.openaiModel).toBe("gpt-5.4");
    expect(config.oauthRedirectUrl).toBe("http://localhost:3000");
    expect(config.oauthPort).toBe(3000);
    expect(config.gmailMaxConcurrent).toBe(2);
    expect(config.defaultCalendarId).toBe("primary");
    expect(config.defaultTaskListId).toBe("@default");
    expect(config.logLevel).toBe("info");
  });

  it("throws when OPENAI_API_KEY is missing", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => loadConfig()).toThrow("OPENAI_API_KEY");
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
    process.env.OPENAI_MODEL = "gpt-4o";
    process.env.OAUTH_PORT = "4000";
    process.env.GMAIL_MAX_CONCURRENT = "5";
    const config = loadConfig();
    expect(config.openaiModel).toBe("gpt-4o");
    expect(config.oauthPort).toBe(4000);
    expect(config.gmailMaxConcurrent).toBe(5);

    delete process.env.OPENAI_MODEL;
    delete process.env.OAUTH_PORT;
    delete process.env.GMAIL_MAX_CONCURRENT;
  });
});
