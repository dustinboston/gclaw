# todo

Here's a comprehensive breakdown of what this codebase needs for enterprise readiness, organized by priority:

---

## Critical Gaps

### 1. Security & Secrets Management
- **Plaintext tokens** in `.tokens.json` — needs encryption at rest
- **No secrets vault** — API keys should come from AWS Secrets Manager, HashiCorp Vault, or similar, not `.env`
- **No key rotation** mechanism
- **Token file permissions** are default (readable by any local process)

### 2. Error Handling & Resilience
- Almost no try-catch, no retries, silent failures throughout
- No exponential backoff for transient Google API failures
- No circuit breaker pattern for rate limiting
- No validation of LLM agent outputs before acting on them

### 3. ~~Observability (Logging, Metrics, Tracing)~~ ✅
- ~~No structured logging library (needs `pino` or `winston`)~~ — `pino` in `src/logger.ts`
- ~~No request/correlation IDs for multi-step agent operations~~ — `AsyncLocalStorage` context in `src/context.ts`, auto-injected via pino mixin
- ~~No metrics (tool latency, success rates, API call counts)~~ — `src/metrics.ts` with `withMetrics` wrapper on all API providers
- ~~No audit trail for destructive actions (delete, spam, archive)~~ — `src/audit.ts` with requestId correlation

### 4. Destructive Operation Safeguards
- `cleanAgent` autonomously deletes/archives/spams emails with zero user confirmation
- No undo/rollback mechanism
- No audit log of what was done and why

---

## High Priority

### 5. CI/CD Pipeline
- No GitHub Actions, no automated tests on PR, no type-checking gate
- No deployment scripts or environment configuration (dev/staging/prod)

### 6. Testing Gaps
- Unit tests are solid (good coverage, proper mocks), but:
  - **Zero integration tests** — all APIs are mocked
  - **Zero end-to-end tests**
  - No performance/load testing for the rate limiter

### 7. Configuration Management
- Hardcoded values everywhere: `localhost:3000`, `"primary"` calendar, `"@default"` task list, thread ID `"666"`
- No environment-based configuration system
- No config validation at startup

### 8. Rate Limiting
- Only Gmail has rate limiting (hardcoded `MAX_CONCURRENT = 2`)
- Calendar and Tasks APIs have no rate limiting at all
- No backoff strategy

---

## Medium Priority

### 9. Code Quality Tooling
- No ESLint config
- No Prettier config
- No `tsc --noEmit` in CI for type-checking

### 10. Data Persistence & State
- Conversation history uses in-memory `MemorySaver` — lost on restart
- No database for audit logs or operation history
- Hardcoded thread ID means no multi-session support

### 11. Documentation
- No API documentation for the tool interfaces
- No threat model or security considerations doc
- No deployment guide or runbooks
- No incident response procedures

### 12. Monitoring & Alerting
- No health checks
- No APM integration (Sentry, Datadog, etc.)
- No usage analytics

---

## What's Already Good

The codebase has solid foundations to build on:
- **Clean architecture** — clear separation of providers, tools, and agents
- **Strong type safety** — TypeScript throughout, Zod validation on all tool inputs
- **Comprehensive unit tests** — 16 test files with edge cases covered
- **Good layering** — two-tier agent system is well-designed
- **Rate limiter** — custom semaphore for Gmail is a smart pattern

---

## Suggested Roadmap

| Phase | Focus | Effort |
|-------|-------|--------|
| **1** | Encrypt tokens, add structured logging, add retry logic, add audit trail for destructive ops | Small |
| **2** | CI/CD pipeline, integration tests, config management, startup validation | Medium |
| **3** | User confirmation flows for destructive actions, undo/rollback, multi-session support | Medium |
| **4** | APM/monitoring, security scanning (SAST/dependency), deployment automation | Large |

Want me to start implementing any of these?
