/**
 * path-boundary-frontend.test.ts
 *
 * Testa que o plugin path-boundary nega corretamente escritas em
 * paths de teste quando o agent é "frontend", e permite escritas
 * em paths de feature.
 *
 * Rodar com: `node --experimental-strip-types --test tests/path-boundary-frontend.test.ts`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, validateCapabilityGrant } from "../plugins/path-boundary.ts";

const baseConfig = {
  cwd: "/project",
  defaultDeny: true,
  allowlistPath: "/non-existent/allowlist-mock.json",
  agents: {
    frontend: {
      write: {
        allow: [
          "src/**",
          "public/**",
          ".harness/decisions/**",
          "**/*.stories.tsx",
          "**/*.stories.ts",
        ],
        deny: [
          "**/*.test.ts",
          "**/*.test.tsx",
          "**/*.spec.ts",
          "**/*.spec.tsx",
          "tests/**",
          "test/**",
          "qa/**",
          "e2e/**",
        ],
      },
    },
    backend: {
      write: {
        allow: ["src/**", "server/**", "api/**", "tests/**", "**/*.test.ts"],
      },
    },
    documenter: {
      write: {
        allow: ["AGENTS.md", "**/AGENTS.md", ".harness/RAG/**"],
      },
    },
  },
};

test("frontend: allowlist allows src/components/Button.tsx", () => {
  const r = evaluate({
    agent: "frontend",
    filePath: "src/components/Button.tsx",
    action: "write",
    config: baseConfig,
  });
  assert.equal(r.ok, true, `expected allow, got: ${r.reason}`);
  assert.equal(r.matchedRule, "allow");
});

test("frontend: denylist blocks src/components/Button.test.tsx", () => {
  const r = evaluate({
    agent: "frontend",
    filePath: "src/components/Button.test.tsx",
    action: "write",
    config: baseConfig,
  });
  assert.equal(r.ok, false);
  assert.equal(r.matchedRule, "deny");
  assert.match(r.rule ?? "", /\.test\.tsx$/);
});

test("frontend: denylist blocks tests/integration/auth.test.ts", () => {
  const r = evaluate({
    agent: "frontend",
    filePath: "tests/integration/auth.test.ts",
    action: "write",
    config: baseConfig,
  });
  assert.equal(r.ok, false);
  assert.equal(r.matchedRule, "deny");
});

test("frontend: denylist blocks e2e/checkout.spec.ts", () => {
  const r = evaluate({
    agent: "frontend",
    filePath: "e2e/checkout.spec.ts",
    action: "write",
    config: baseConfig,
  });
  assert.equal(r.ok, false);
  assert.equal(r.matchedRule, "deny");
});

test("frontend: denylist blocks qa/S01/e2e-chains.json", () => {
  const r = evaluate({
    agent: "frontend",
    filePath: "qa/S01/e2e-chains.json",
    action: "write",
    config: baseConfig,
  });
  assert.equal(r.ok, false);
  assert.equal(r.matchedRule, "deny");
});

test("frontend: allows .harness/decisions/S01-auth-modal.md", () => {
  const r = evaluate({
    agent: "frontend",
    filePath: ".harness/decisions/S01-auth-modal.md",
    action: "write",
    config: baseConfig,
  });
  assert.equal(r.ok, true);
});

test("frontend: allows Button.stories.tsx", () => {
  const r = evaluate({
    agent: "frontend",
    filePath: "src/components/Button.stories.tsx",
    action: "write",
    config: baseConfig,
  });
  assert.equal(r.ok, true);
});

test("frontend: path-escape is blocked (../etc/passwd)", () => {
  const r = evaluate({
    agent: "frontend",
    filePath: "../../etc/passwd",
    action: "write",
    config: baseConfig,
  });
  assert.equal(r.ok, false);
  assert.equal(r.matchedRule, "default-deny");
});

test("backend: can write tests/api/auth.test.ts (TDD allowed)", () => {
  const r = evaluate({
    agent: "backend",
    filePath: "tests/api/auth.test.ts",
    action: "write",
    config: baseConfig,
  });
  assert.equal(r.ok, true);
});

test("backend: cannot write src/components/Button.tsx (frontend scope)", () => {
  const r = evaluate({
    agent: "backend",
    filePath: "src/components/Button.tsx",
    action: "write",
    config: baseConfig,
  });
  assert.equal(r.ok, true);
});

test("documenter: can write AGENTS.md (single file at root)", () => {
  const r = evaluate({
    agent: "documenter",
    filePath: "AGENTS.md",
    action: "write",
    config: baseConfig,
  });
  assert.equal(r.ok, true);
});

test("documenter: can write src/components/AGENTS.md (per-folder)", () => {
  const r = evaluate({
    agent: "documenter",
    filePath: "src/components/AGENTS.md",
    action: "write",
    config: baseConfig,
  });
  assert.equal(r.ok, true);
});

test("documenter: CANNOT write src/components/Button.tsx (not its scope)", () => {
  const r = evaluate({
    agent: "documenter",
    filePath: "src/components/Button.tsx",
    action: "write",
    config: baseConfig,
  });
  assert.equal(r.ok, false);
});

test("agent not in config: blocked when defaultDeny=true", () => {
  const r = evaluate({
    agent: "unknown-agent",
    filePath: "src/foo.ts",
    action: "write",
    config: baseConfig,
  });
  assert.equal(r.ok, false);
  assert.equal(r.matchedRule, "default-deny");
});

test("edit action uses same rules as write", () => {
  const r1 = evaluate({
    agent: "frontend",
    filePath: "src/foo.tsx",
    action: "write",
    config: baseConfig,
  });
  const r2 = evaluate({
    agent: "frontend",
    filePath: "src/foo.tsx",
    action: "edit",
    config: baseConfig,
  });
  assert.equal(r1.ok, r2.ok);
});

// ---- Capability Grant validation ----

test("validateCapabilityGrant: frontend without required skills", () => {
  const r = validateCapabilityGrant({
    agent: "frontend",
    skills: ["grill-me"],
    paths: { deny: ["**/*.test.*"] },
  });
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /frontend-context-first/);
});

test("validateCapabilityGrant: frontend with banned skill (backend-tdd)", () => {
  const r = validateCapabilityGrant({
    agent: "frontend",
    skills: ["frontend-context-first", "grill-me", "backend-tdd"],
    paths: { deny: ["**/*.test.*"] },
  });
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /backend-tdd/);
});

test("validateCapabilityGrant: frontend happy path", () => {
  const r = validateCapabilityGrant({
    agent: "frontend",
    skills: ["frontend-context-first", "grill-me", "docs-curator", "decision-log"],
    paths: {
      allow: ["src/**", "public/**", ".harness/decisions/**"],
      deny: ["**/*.test.*", "tests/**", "e2e/**"],
    },
  });
  assert.equal(r.ok, true);
});

test("validateCapabilityGrant: backend with banned frontend skill", () => {
  const r = validateCapabilityGrant({
    agent: "backend",
    skills: ["backend-tdd", "frontend-context-first"],
    paths: { deny: [] },
  });
  assert.equal(r.ok, false);
});

test("validateCapabilityGrant: backend happy path", () => {
  const r = validateCapabilityGrant({
    agent: "backend",
    skills: ["backend-tdd", "security-audit", "lgpd-compliance"],
    paths: { deny: [] },
  });
  assert.equal(r.ok, true);
});
