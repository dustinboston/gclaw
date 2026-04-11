/**
 * Google Tasks API client
 */

import { google } from "googleapis";
import { auth } from "./gmail.ts";
import { withRetry } from "../retry.ts";
import { withMetrics } from "../metrics.ts";
import { loadConfig } from "../config.ts";

const config = loadConfig();

export const tasks = google.tasks({ version: "v1", auth });

// Rate limiter to avoid "Too many concurrent requests" errors from Google.
const MAX_CONCURRENT = config.tasksMaxConcurrent;
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

export async function tasksRequest<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await withMetrics("tasks_api", () => withRetry(fn));
  } finally {
    release();
  }
}
