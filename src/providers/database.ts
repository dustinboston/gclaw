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
			id          SERIAL PRIMARY KEY,
			timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			request_id  TEXT,
			resource    TEXT NOT NULL DEFAULT 'email',
			action      TEXT NOT NULL,
			resource_id TEXT NOT NULL,
			result      TEXT NOT NULL CHECK (result IN ('success', 'failure')),
			subject     TEXT,
			"from"      TEXT,
			reason      TEXT,
			error       TEXT
		);

		DO $$
		BEGIN
			IF EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'audit_log' AND column_name = 'email_id'
			) AND NOT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'audit_log' AND column_name = 'resource_id'
			) THEN
				ALTER TABLE audit_log RENAME COLUMN email_id TO resource_id;
			END IF;
		END $$;

		ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS resource TEXT NOT NULL DEFAULT 'email';

		DROP INDEX IF EXISTS idx_audit_log_email_id;
		CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log (timestamp);
		CREATE INDEX IF NOT EXISTS idx_audit_log_resource_id ON audit_log (resource_id);

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
