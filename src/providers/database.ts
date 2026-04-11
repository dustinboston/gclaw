/**
 * Shared PostgreSQL connection pool and schema initialization. The pool is
 * used by the LangGraph checkpointer, the audit log, and the analytics system.
 *
 * @module
 */

import pg from 'pg';
import {loadConfig} from '../config.ts';
import {logger} from '../logger.ts';

const config = loadConfig();

/** Shared PostgreSQL connection pool. */
export const pool = new pg.Pool({
	connectionString: config.databaseUrl,
	max: 5,
	idleTimeoutMillis: 30_000,
	connectionTimeoutMillis: 5000,
});

/** Creates the `audit_log` and `analytics` tables and their indexes if they don't exist. */
export async function initDatabase(): Promise<void> {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS audit_log (
			id         SERIAL PRIMARY KEY,
			timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			request_id TEXT,
			action     TEXT NOT NULL,
			email_id   TEXT NOT NULL,
			result     TEXT NOT NULL CHECK (result IN ('success', 'failure')),
			subject    TEXT,
			"from"     TEXT,
			reason     TEXT,
			error      TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log (timestamp);
		CREATE INDEX IF NOT EXISTS idx_audit_log_email_id ON audit_log (email_id);

		CREATE TABLE IF NOT EXISTS analytics (
			id          SERIAL PRIMARY KEY,
			timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			request_id  TEXT,
			tool        TEXT NOT NULL,
			duration_ms INTEGER NOT NULL,
			success     BOOLEAN NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics (timestamp);
		CREATE INDEX IF NOT EXISTS idx_analytics_tool ON analytics (tool);
	`);
	logger.info('Database initialized');
}
