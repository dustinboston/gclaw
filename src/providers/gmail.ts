import { google } from "googleapis";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const TOKENS_PATH = join(import.meta.dirname, "../../.tokens.json");

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://localhost:3000",
);

if (existsSync(TOKENS_PATH)) {
  const tokens = JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
  auth.setCredentials(tokens);
}

auth.on("tokens", (tokens) => {
  const existing = existsSync(TOKENS_PATH)
    ? JSON.parse(readFileSync(TOKENS_PATH, "utf-8"))
    : {};
  writeFileSync(TOKENS_PATH, JSON.stringify({ ...existing, ...tokens }));
});

export { auth };

const rawGmail = google.gmail({ version: "v1", auth });

// Rate limiter to avoid "Too many concurrent requests" errors from Google.
const MAX_CONCURRENT = 2;
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
    return await fn();
  } finally {
    release();
  }
}

export const gmail = rawGmail;
