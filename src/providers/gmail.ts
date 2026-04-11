import { google } from "googleapis";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { encrypt, decrypt, isEncrypted } from "../crypto.ts";
import { withRetry } from "../retry.ts";
import { logger } from "../logger.ts";
import { loadConfig } from "../config.ts";

const config = loadConfig();
const TOKENS_PATH = join(import.meta.dirname, "../../.tokens.json");

const auth = new google.auth.OAuth2(
  config.googleClientId,
  config.googleClientSecret,
  config.oauthRedirectUrl,
);

if (existsSync(TOKENS_PATH)) {
  const raw = JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
  const tokens = isEncrypted(raw) ? JSON.parse(decrypt(raw)) : raw;
  auth.setCredentials(tokens);
  logger.debug("Loaded OAuth tokens from disk");
}

auth.on("tokens", (tokens) => {
  const existing = existsSync(TOKENS_PATH)
    ? (() => {
        const raw = JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
        return isEncrypted(raw) ? JSON.parse(decrypt(raw)) : raw;
      })()
    : {};
  const merged = { ...existing, ...tokens };
  writeFileSync(TOKENS_PATH, JSON.stringify(encrypt(JSON.stringify(merged))));
  logger.info("OAuth tokens refreshed and saved (encrypted)");
});

export { auth };

const rawGmail = google.gmail({ version: "v1", auth });

// Rate limiter to avoid "Too many concurrent requests" errors from Google.
const MAX_CONCURRENT = config.gmailMaxConcurrent;
let active = 0;
const queue: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(resolve));
}

function release() {
  if (queue.length > 0) {
    queue.shift()!();
  } else {
    active--;
  }
}

export async function gmailRequest<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await withRetry(fn);
  } finally {
    release();
  }
}

export const gmail = rawGmail;
