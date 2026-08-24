/**
 * audit-redact.ts
 *
 * Redacao de campos sensiveis antes de gravar no audit log.
 * Resolve achado M1: o audit-logger gravava args completo,
 * expondo secrets, tokens e PII em logs versionados.
 *
 * Politica:
 *   - Chave cujo nome casa lista de SENSITIVE_KEYS (case-insensitive) -> valor vira "[REDACTED]"
 *   - Valor que parece connection string, JWT, AWS key, ou env-style secret -> "[REDACTED]"
 *   - Recursivo em objetos e arrays
 *   - Limite de profundidade para evitar recursao infinita
 *   - Strings > MAX_STRING_LENGTH sao truncadas
 */

const SENSITIVE_KEYS = new Set([
  "password",
  "passwd",
  "secret",
  "token",
  "api_token",
  "apitoken",
  "auth_token",
  "access_token",
  "refresh_token",
  "id_token",
  "session_token",
  "authorization",
  "cookie",
  "set-cookie",
  "api_key",
  "x-api-key",
  "x-auth-token",
  "private_key",
  "privatekey",
  "client_secret",
  "clientsecret",
  "aws_secret_access_key",
  "aws_access_key_id",
  "stripe_secret_key",
  "sendgrid_api_key",
  "smtp_password",
  "ssh_key",
  "env",
  "envs",
]);

const SENSITIVE_PATTERNS: RegExp[] = [
  // AWS access key ID (20 chars maiusculos)
  /\bAKIA[0-9A-Z]{16}\b/,
  // AWS secret access key (40 chars base64-ish)
  /\b[A-Za-z0-9/+=]{40}\b/,
  // JWT (header.payload.signature)
  /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  // GitHub PAT (ghp_/gho_/ghs_/ghr_)
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  // Stripe keys (sk_live_, sk_test_, pk_live_)
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{24,}\b/,
  // Generic connection string com senha
  /(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^:]+:[^@]+@[^\s"']+/i,
  // Private key PEM block
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
];

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 8;
const MAX_STRING_LENGTH = 4096;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[- ]/g, "_"));
}

function redactString(s: string): string {
  let out = s;
  for (const re of SENSITIVE_PATTERNS) {
    out = out.replace(re, REDACTED);
  }
  return out.length > MAX_STRING_LENGTH
    ? out.slice(0, MAX_STRING_LENGTH) + "...[TRUNCATED]"
    : out;
}

export function redactSensitive<T>(value: T, depth = 0): T {
  if (depth > MAX_DEPTH) return REDACTED as unknown as T;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value) as unknown as T;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactSensitive(v, depth + 1)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? REDACTED : redactSensitive(v, depth + 1);
  }
  return out as unknown as T;
}
