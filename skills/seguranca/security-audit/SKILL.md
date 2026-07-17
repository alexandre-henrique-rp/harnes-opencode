---
name: security-audit
description: Security checklist applied by backend agent before GREEN. Validates input handling, secrets, PII, rate limiting, auth.
---

# Security Audit Checklist (v6.5.0)

## Purpose

Catch the most common security mistakes BEFORE code is merged. Applied
by the `backend` agent in the GREEN step. For deeper audits, use a
dedicated security review sprint with the `security` agent.

## Mandatory checks (block GREEN if failing)

### 1. Input validation

- [ ] ALL user inputs go through a validator (Zod, Joi, class-validator, etc)
- [ ] No `JSON.parse(req.body)` without a schema
- [ ] No `req.query.X` or `req.params.X` used directly in DB queries
- [ ] File uploads: validate MIME type AND size AND filename
- [ ] URL params are validated (e.g., IDs are UUIDs, not arbitrary strings)

### 2. SQL injection

- [ ] All DB queries use parameterized queries or an ORM (Prisma, Drizzle, etc)
- [ ] No string concatenation in SQL
- [ ] No raw `execute(sql, [args])` with user input

### 3. XSS

- [ ] No `dangerouslySetInnerHTML` without DOMPurify or equivalent
- [ ] No `eval()`, `Function()`, or `setTimeout(string)` with user input
- [ ] CSP headers set in production
- [ ] HTML responses escape user content by default

### 4. Authentication

- [ ] Protected routes check auth in middleware/guard
- [ ] JWT tokens validated (signature, expiry, audience)
- [ ] Sessions use secure cookies (httpOnly, secure, sameSite)
- [ ] Passwords hashed with bcrypt/argon2 (never stored plain)
- [ ] No "auth bypass" comments without explicit security team approval

### 5. Authorization

- [ ] User can only access their own resources (object-level check)
- [ ] Role checks applied where needed (admin-only endpoints, etc)
- [ ] No `userId` taken from request body for "ownership" — must come from auth

### 6. Rate limiting

- [ ] Public endpoints have rate limits (e.g., 100 req/min per IP)
- [ ] Auth endpoints have stricter limits (e.g., 5 attempts per 15min)
- [ ] Rate limit returns 429 with Retry-After header
- [ ] Rate limit state stored in Redis (not in-memory) in production

### 7. CORS

- [ ] `Access-Control-Allow-Origin` is a specific origin, not `*` (unless truly public)
- [ ] `Access-Control-Allow-Credentials: true` only when needed
- [ ] Preflight (OPTIONS) handled correctly

### 8. Secrets management

- [ ] No secrets in code (API keys, DB passwords, JWT secrets)
- [ ] No secrets in `.env` committed to git
- [ ] Secrets loaded from env vars (or a secret manager like Vault)
- [ ] Different secrets for dev / staging / prod
- [ ] `.env.example` committed (with placeholders, not real values)

### 9. Logging

- [ ] No PII in logs (names, emails, phone, CPF, RG, credit card)
- [ ] No passwords, tokens, or session IDs in logs
- [ ] Error logs include correlation ID (for traceability)
- [ ] Logs are structured (JSON), not free-form strings

### 10. Dependencies

- [ ] No known-vulnerable packages (`npm audit` clean)
- [ ] Lockfile committed (`package-lock.json`, `pnpm-lock.yaml`, etc)
- [ ] Pinned versions, not `^` for security-critical deps
- [ ] License compatible (no GPL in proprietary projects, etc)

### 11. Cryptography

- [ ] TLS 1.2+ for all external connections
- [ ] HTTPS-only cookies
- [ ] HSTS header set
- [ ] Strong algorithms (no MD5, SHA1 for security; no RSA-1024)
- [ ] Random values use `crypto.randomBytes`, not `Math.random`

### 12. Error handling

- [ ] Generic error message to user, detailed in server log
- [ ] Stack traces NOT exposed to client
- [ ] Different error responses for 4xx (user error) vs 5xx (server error)
- [ ] Failures don't leak internal state

## LGPD (if applicable)

If the feature handles Brazilian personal data, **additionally** apply
the `lgpd-compliance` skill. It is not optional.

## When to apply this checklist

| Phase | Apply? |
|---|---|
| Backend GREEN step | ✅ Mandatory |
| Backend REFACTOR step | ✅ Re-verify after changes |
| Frontend implementation | ⚠️ Only for forms, auth flows, sensitive data display |
| Code review | ✅ Cross-check |
| Pre-merge CI | ✅ Automated scan (semgrep, snyk, etc) |

## Automated scanning (recommended)

Add these to CI:

```bash
# Secrets in code
gitleaks detect --source . --report-path leaks.json

# Vulnerable dependencies
npm audit --audit-level=high
# or
snyk test

# Static analysis
semgrep --config=auto .

# License compliance
npx license-checker --failOn 'GPL;AGPL'
```

## Anti-patterns (will fail security review)

- ❌ `console.log(user)` in production
- ❌ `if (userId === req.body.userId)` for "authorization"
- ❌ Returning full error stack to client in production
- ❌ `Math.random()` for security tokens
- ❌ MD5 or SHA1 for password hashing
- ❌ CORS `*` with credentials
- ❌ SQL built by string concatenation
- ❌ `eval()` or `Function()` with user input
- ❌ Secrets in package.json or hardcoded

## Reporting

When the security audit finds issues, write a `decision-log` ADR
documenting the risk, the chosen mitigation, and accepted risks (if any).
