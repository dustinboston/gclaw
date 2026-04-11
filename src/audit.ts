import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "./logger.ts";
import { getRequestId } from "./context.ts";

const AUDIT_LOG_PATH = join(import.meta.dirname, "../audit.log");

export type AuditAction = "archive" | "delete" | "spam";

interface AuditEntry {
  timestamp: string;
  requestId?: string;
  action: AuditAction;
  emailId: string;
  result: "success" | "failure";
  error?: string;
}

export function logAudit(
  action: AuditAction,
  emailId: string,
  result: "success" | "failure",
  error?: string,
): void {
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    requestId: getRequestId(),
    action,
    emailId,
    result,
  };

  if (error) entry.error = error;

  const line = JSON.stringify(entry) + "\n";

  try {
    appendFileSync(AUDIT_LOG_PATH, line);
  } catch (err) {
    logger.error({ err, entry }, "Failed to write audit log");
  }

  logger.info({ action, emailId, result }, "Audit: email action");
}
