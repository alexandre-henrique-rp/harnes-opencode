---
name: lgpd-compliance
description: LGPD (Brazilian GDPR) compliance checklist. Applied when feature touches personal data of Brazilian citizens. Mandatory in the harness.
---

# LGPD Compliance (v6.5.0)

## Purpose

Ensure every feature that touches **personal data** of natural persons
in Brazil complies with the **Lei Geral de Proteção de Dados (LGPD)**.

This skill is **mandatory** in the harness for any feature that
processes personal data. It is invoked by:

- `backend` agent (when feature touches PII)
- `lgpd-officer` agent (end-of-sprint audit)
- `security` agent (deeper review)

## When to apply

Apply when the feature:

- Collects, stores, processes, or transmits personal data
- Handles Brazilian citizen data (name, CPF, email, phone, address, IP, etc)
- Uses cookies, tracking, or analytics that identify users
- Shares data with third parties

## Personal data categories (LGPD Art. 5)

### Common (used in most apps)

- Name, CPF, RG, CNH, passport
- Email, phone, address
- Date of birth, gender
- IP address, device fingerprint
- Geolocation
- Financial data (income, bank account)
- Health data
- Biometric data

### Sensitive (Art. 5, II) — extra care

- Religion, political opinion
- Race/ethnicity
- Health, genetic, biometric data
- Sex life, sexual orientation
- Trade union membership

## The 10 LGPD principles (Art. 6) — quick checklist

| # | Principle | What it means in code |
|---|---|---|
| 1 | **Purpose** (Finalidade) | Each data field has a declared purpose in the schema |
| 2 | **Adequacy** (Adequação) | Data matches the stated purpose (no over-collection) |
| 3 | **Necessity** (Necessidade) | Minimum data collected (no nice-to-haves) |
| 4 | **Free access** (Livre acesso) | User can see their data (data export endpoint) |
| 5 | **Data quality** (Qualidade dos dados) | Data is accurate, up-to-date (validation + update endpoint) |
| 6 | **Transparency** (Transparência) | Privacy policy accessible, plain language |
| 7 | **Security** (Segurança) | Encryption, access control, audit log (security-audit skill) |
| 8 | **Prevention** (Prevenção) | Measures to prevent damage (DPIA when needed) |
| 9 | **Non-discrimination** (Não discriminação) | Data use doesn't discriminate (algorithmic fairness) |
| 10 | **Accountability** (Responsabilização) | Records of processing activities (ROPA) |

## Rights of the data subject (Art. 18) — must be implementable

The user can request:

- [ ] **Confirmation** that their data is processed
- [ ] **Access** to their data (export)
- [ ] **Correction** of inaccurate data
- [ ] **Anonymization, blocking, or deletion** of unnecessary data
- [ ] **Portability** (machine-readable format)
- [ ] **Deletion** of data processed with consent
- [ ] **Information** about shared third parties
- [ ] **Information** about the possibility of not consenting
- [ ] **Revocation** of consent

Implementation: provide endpoints or a self-service area for these.

## Consent (Art. 8)

If processing is based on consent:

- [ ] Consent is **free, informed, and unambiguous**
- [ ] Consent is collected via a **clear affirmative action** (not pre-checked boxes)
- [ ] Consent is **as specific as possible** (per purpose, not blanket)
- [ ] User can **revoke** consent as easily as they gave it
- [ ] Consent is **recorded** (timestamp, IP, version of policy)
- [ ] Children/adolescents: specific consent from a parent/guardian required

## Required technical measures

### Data minimization

- Don't collect data "just in case" — collect only what you use
- Review schema before each sprint: every field needs a purpose

### Encryption

- **In transit:** TLS 1.2+ for all data
- **At rest:** sensitive fields encrypted in DB (PII columns, especially CPF, email)
- **In logs:** PII masked (see `security-audit` skill §9)

### Access control

- **Principle of least privilege:** users see only their own data
- **No "all users can see all"** endpoints without explicit role
- **Admin endpoints** require elevated auth + audit log

### Audit trail

Every access to personal data should be logged:

```typescript
{
  timestamp: "2026-07-17T14:30:00Z",
  actor: "user:abc123",
  action: "read" | "update" | "delete",
  resource: "user:def456",
  reason: "user_requested_data_export",
  ip: "192.0.2.1",
  userAgent: "..."
}
```

The `audit-logger` plugin in the harness handles this automatically.

### Retention

- Define retention period for each data type (e.g., "user accounts: while active + 5 years for tax")
- Auto-delete data after retention period (cron job)
- Separate "active" vs "archived" storage

### Breach notification

- Internal process to detect breaches
- Notification to ANPD (Autoridade Nacional de Proteção de Dados) within
  **2 business days** of becoming aware (Art. 48)
- Notification to affected users if there's risk of harm

## DPO (Data Protection Officer) role

- Brazilian orgs often have a **DPO** (Encarregado de Dados, Art. 41)
- The harness has a `lgpd-officer` agent that audits each sprint
- In a real project, the human DPO reviews the lgpd-officer's report

## Self-check (use before declaring GREEN)

- [ ] All personal data fields have a declared purpose in code comments
- [ ] No PII in logs
- [ ] Sensitive data encrypted at rest (if DB supports it)
- [ ] User can access / correct / delete their data (endpoints exist or planned)
- [ ] Consent is collected for any consent-based processing
- [ ] Data retention policy defined and automated
- [ ] `audit-logger` is logging PII access
- [ ] Privacy policy is up-to-date and accessible
- [ ] DPO has been notified of the new feature

## Anti-patterns (will fail LGPD audit)

- ❌ Collecting CPF "for analytics"
- ❌ Storing passwords in plain text (Art. 46 — security measures)
- ❌ Sharing data with third parties without consent
- ❌ No way for user to delete their account
- ❌ Pre-checked consent boxes
- ❌ Cookie banner with no "reject all" option
- ❌ Data retention forever ("we never delete")
- ❌ Using personal data for a purpose different from the original

## Related skills

- `security-audit` — technical security (encryption, access control)
- `decision-log` — persist LGPD-related decisions
- `audit-logger` — automatic logging of PII access

## References

- LGPD full text: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- ANPD guidance: https://www.gov.br/anpd/
