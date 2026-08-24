/**
 * path-boundary-core.ts
 *
 * Core logic for path boundary evaluation, allowlists, and grant validations.
 * Separated from plugin entrypoint (path-boundary.ts) to keep plugin module exports
 * clean for OpenCode plugin loader while allowing tests to import utilities.
 */
import type { Plugin } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveProjectCwd } from "./resolve-project-cwd.js";
import { quietWarn } from "./quiet-warn.js";

const warn = (msg: string) => quietWarn("path-boundary", msg);

export type CapabilityRule =
  | "allow"
  | "deny"
  | "ask"
  | { allow?: string[]; deny?: string[] };

export interface AgentPermission {
  write?: CapabilityRule | Record<string, CapabilityRule>;
  edit?: CapabilityRule | Record<string, CapabilityRule>;
  bash?: CapabilityRule | Record<string, CapabilityRule>;
  read?: CapabilityRule | Record<string, CapabilityRule>;
}

export interface PathBoundaryConfig {
  cwd: string;
  agents: Record<string, AgentPermission>;
  defaultDeny?: boolean;
  allowlistPath?: string;
}

export interface BoundaryResult {
  ok: boolean;
  reason?: string;
  matchedRule?:
    | "allow"
    | "deny"
    | "ask"
    | "default-deny"
    | "always-deny"
    | "redirect"
    | "default"
    | "auto-allow";
  rule?: string;
}

function parseFrontmatter(content: string): Record<string, any> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const yaml = match[1];
  const result: Record<string, any> = {};
  let currentKey = "";
  const lines = yaml.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const topMatch = line.match(/^(\w+):\s*(.*)$/);
    if (topMatch && !line.startsWith(" ") && !line.startsWith("\t")) {
      currentKey = topMatch[1];
      const value = topMatch[2].trim();
      if (value === "") {
        result[currentKey] = {};
      } else {
        result[currentKey] = parseYamlValue(value);
      }
      continue;
    }
    
    const nestedMatch = line.match(/^(\s+)(\w+):\s*(.*)$/);
    if (nestedMatch && currentKey && result[currentKey] && typeof result[currentKey] === "object") {
      const key = nestedMatch[2];
      const value = nestedMatch[3].trim();
      (result[currentKey] as Record<string, any>)[key] = parseYamlValue(value);
    }
  }
  return result;
}

function parseYamlValue(value: string): any {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function loadAgentsFromMarkdown(agentsDir: string): Record<string, AgentPermission> {
  const result: Record<string, AgentPermission> = {};
  try {
    if (!fs.existsSync(agentsDir)) return result;
    const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const filePath = path.join(agentsDir, file);
      const content = fs.readFileSync(filePath, "utf8");
      const fm = parseFrontmatter(content);
      const name = fm["name"] as string | undefined;
      if (!name) continue;
      const perm = fm["permission"];
      if (!perm || typeof perm !== "object") continue;

      const agentPerm: AgentPermission = {};
      if (perm.write) {
        if (typeof perm.write === "object") {
          const writeObj: Record<string, CapabilityRule> = {};
          for (const [k, v] of Object.entries(perm.write as Record<string, any>)) {
            writeObj[k] = v as CapabilityRule;
          }
          agentPerm.write = writeObj;
        } else {
          agentPerm.write = perm.write as CapabilityRule;
        }
      }
      if (perm.edit) {
        if (typeof perm.edit === "object") {
          const editObj: Record<string, CapabilityRule> = {};
          for (const [k, v] of Object.entries(perm.edit as Record<string, any>)) {
            editObj[k] = v as CapabilityRule;
          }
          agentPerm.edit = editObj;
        } else {
          agentPerm.edit = perm.edit as CapabilityRule;
        }
      }
      if (perm.bash) {
        agentPerm.bash = perm.bash as CapabilityRule;
      }
      if (perm.read) {
        agentPerm.read = perm.read as CapabilityRule;
      }
      if (Object.keys(agentPerm).length > 0) {
        result[name] = agentPerm;
      }
    }
  } catch (e) {
    warn(`Erro ao carregar agents from markdown: ${(e as Error).message}`);
  }
  return result;
}

const agentFrontmatterCache: {
  mtimeMs: number;
  data: Record<string, AgentPermission>;
} = { mtimeMs: 0, data: {} };

export function getAgentsFromMarkdown(agentsDir: string): Record<string, AgentPermission> {
  if (!fs.existsSync(agentsDir)) return {};
  let latestMtime = 0;
  try {
    const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      const m = fs.statSync(path.join(agentsDir, f)).mtimeMs;
      if (m > latestMtime) latestMtime = m;
    }
  } catch { return agentFrontmatterCache.data; }

  if (latestMtime !== agentFrontmatterCache.mtimeMs) {
    agentFrontmatterCache.mtimeMs = latestMtime;
    agentFrontmatterCache.data = loadAgentsFromMarkdown(agentsDir);
  }
  return agentFrontmatterCache.data;
}

export function getAllowlistPath(): string {
  return path.join(
    process.env.HOME || "~",
    ".config/opencode/harness-allowlist.json",
  );
}

export function getProjectAllowlistPath(cwd: string): string {
  const harnessPath = path.join(cwd, ".harness", "harness-allowlist.json");
  if (fs.existsSync(harnessPath)) {
    return harnessPath;
  }
  const rootPath = path.join(cwd, "harness-allowlist.json");
  if (fs.existsSync(rootPath)) {
    return rootPath;
  }
  return harnessPath;
}

export interface MergedAllowlist {
  allow: string[];
  deny: string[];
  sources: { path: string; ok: boolean; reason?: string }[];
}

interface AllowlistCacheEntry {
  mtimeMs: number;
  data: MergedAllowlist;
}
const allowlistCache = new Map<string, AllowlistCacheEntry>();

function getMtime(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

export function readAllowlistFile(
  filePath: string,
  sourceName: string,
): {
  rules: { allow: string[]; deny: string[] };
  status: { ok: boolean; reason?: string };
} {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const allow: string[] = [];
    const deny: string[] = [];

    if (Array.isArray(data.allow)) {
      for (const item of data.allow) {
        if (typeof item === "string") allow.push(item);
      }
    }
    if (Array.isArray(data.deny)) {
      for (const item of data.deny) {
        if (typeof item === "string") deny.push(item);
      }
    }

    if (Array.isArray(data.rules)) {
      for (const rule of data.rules) {
        if (
          rule &&
          typeof rule === "object" &&
          typeof rule.pattern === "string"
        ) {
          if (rule.type === "deny") {
            deny.push(rule.pattern);
          } else {
            allow.push(rule.pattern);
          }
        }
      }
    }

    return {
      rules: { allow, deny },
      status: { ok: true },
    };
  } catch (e) {
    warn(`WARNING: Erro ao ler allowlist ${sourceName} (${filePath}): ${(e as Error).message}`);
    return {
      rules: { allow: [], deny: [] },
      status: { ok: false, reason: `parse error: ${(e as Error).message}` },
    };
  }
}

export function loadMergedAllowlist(cwd: string): MergedAllowlist {
  const projectPath = getProjectAllowlistPath(cwd);
  const cacheKey = `${cwd}|${projectPath}|${getAllowlistPath()}`;

  const projectMtime = getMtime(projectPath);
  const globalMtime = getMtime(getAllowlistPath());

  const cached = allowlistCache.get(cacheKey);
  if (cached && cached.mtimeMs === projectMtime + globalMtime) {
    return cached.data;
  }

  const result: MergedAllowlist = {
    allow: [],
    deny: [],
    sources: [],
  };
  const allowSet = new Set<string>();
  const denySet = new Set<string>();

  if (fs.existsSync(projectPath)) {
    const { rules, status } = readAllowlistFile(projectPath, "project");
    rules.allow.forEach((p) => allowSet.add(p));
    rules.deny.forEach((p) => denySet.add(p));
    result.sources.push({ path: projectPath, ...status });
  }

  const resolvedProject = projectPath ? path.resolve(projectPath) : "";
  const resolvedGlobal = path.resolve(getAllowlistPath());
  const isSameFile = resolvedProject === resolvedGlobal;

  if (!isSameFile && fs.existsSync(getAllowlistPath())) {
    const { rules, status } = readAllowlistFile(getAllowlistPath(), "global");
    rules.allow.forEach((p) => allowSet.add(p));
    rules.deny.forEach((p) => denySet.add(p));
    result.sources.push({ path: getAllowlistPath(), ...status });
  }

  result.allow = [...allowSet];
  result.deny = [...denySet];

  allowlistCache.set(cacheKey, {
    mtimeMs: projectMtime + globalMtime,
    data: result,
  });

  return result;
}

const autoAllowCooldown = new Map<string, number>();

function isAutoAllowDisabled(cwd: string): boolean {
  if (process.env.HARNESS_NO_AUTO_ALLOW === "1") return true;
  const marker = path.join(cwd, ".harness", ".no-auto-allow");
  return fs.existsSync(marker);
}

function isCooldownActive(cwd: string, pattern: string): boolean {
  const cooldownMs = parseInt(
    process.env.HARNESS_AUTO_ALLOW_COOLDOWN_MS || "60000",
    10,
  );
  if (cooldownMs <= 0) return false;
  const lastAdded = autoAllowCooldown.get(`${cwd}|${pattern}`) || 0;
  return Date.now() - lastAdded < cooldownMs;
}

const autoAllowRecentAdds: number[] = [];
function isRateLimited(): boolean {
  const maxPerMin = parseInt(
    process.env.HARNESS_AUTO_ALLOW_MAX_PER_MIN || "10",
    10,
  );
  if (maxPerMin <= 0) return false;
  const now = Date.now();
  const oneMinAgo = now - 60_000;
  while (autoAllowRecentAdds.length > 0 && autoAllowRecentAdds[0] < oneMinAgo) {
    autoAllowRecentAdds.shift();
  }
  return autoAllowRecentAdds.length >= maxPerMin;
}

function recordAutoAdd(): void {
  autoAllowRecentAdds.push(Date.now());
}

function writeAutoAllowAudit(
  cwd: string,
  entry: {
    ts: string;
    pattern: string;
    type: "allow" | "deny";
    blockedPath: string;
    source: "auto" | "manual";
  },
): void {
  try {
    const auditDir = path.join(cwd, ".harness", "audit");
    fs.mkdirSync(auditDir, { recursive: true });
    const auditFile = path.join(auditDir, "auto-allow.jsonl");
    fs.appendFileSync(auditFile, JSON.stringify(entry) + "\n");
  } catch (e) {
    warn(`audit write falhou: ${(e as Error).message}`);
  }
}

export function addToProjectAllowlist(
  cwd: string,
  pattern: string,
  type: "allow" | "deny",
  options: { source?: "auto" | "manual"; blockedPath?: string } = {},
): boolean {
  const source = options.source || "manual";
  const projectPath = getProjectAllowlistPath(cwd);

  if (source === "auto" && isCooldownActive(cwd, pattern)) {
    return false;
  }

  if (source === "auto" && isRateLimited()) {
    warn(`RATE LIMIT: max auto-adds por minuto atingido. Block adicionando "${pattern}". Aumente HARNESS_AUTO_ALLOW_MAX_PER_MIN ou espere 60s.`);
    return false;
  }

  try {
    let data: any = {};
    if (fs.existsSync(projectPath)) {
      const raw = fs.readFileSync(projectPath, "utf8");
      data = JSON.parse(raw);
    } else {
      fs.mkdirSync(path.dirname(projectPath), { recursive: true });
      data = { allow: [], deny: [] };
    }

    let modified = false;

    if (Array.isArray(data.rules)) {
      const existsInRules = data.rules.some(
        (r: any) => r && r.pattern === pattern && (r.type || "allow") === type,
      );
      if (!existsInRules) {
        data.rules.push({ pattern, type, target: "project" });
        modified = true;
      }
    }

    const list = data[type] || (data[type] = []);
    if (!list.includes(pattern)) {
      list.push(pattern);
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(projectPath, JSON.stringify(data, null, 2) + "\n");
      allowlistCache.clear();
      autoAllowCooldown.set(`${cwd}|${pattern}`, Date.now());
      if (source === "auto") recordAutoAdd();
      writeAutoAllowAudit(cwd, {
        ts: new Date().toISOString(),
        pattern,
        type,
        blockedPath: options.blockedPath || "",
        source,
      });
      return true;
    }
    return false;
  } catch (e) {
    warn(`Erro ao adicionar ao allowlist: ${(e as Error).message}`);
    return false;
  }
}

export const ALWAYS_DENY = [
  /\.harness\/state-machine\.json$/,
  /\.harness\/state\.json$/,
  /\.harness\/events\.jsonl$/,
  /\.harness\/audit\//,
  /\/node_modules\//,
  /\/\.git\//,
  /package-lock\.json$/,
  /\.harness\/harness-allowlist\.json$/,
];

export const FORCE_TOOL_REDIRECT = [
  {
    pattern: /\.harness\/state\.json$/,
    tool: "harness_advance",
    reason:
      "state.json só pode ser editado via harness_advance tool (valida gate)",
  },
  {
    pattern: /\.harness\/events\.jsonl$/,
    tool: "harness_log",
    reason: "events.jsonl é append-only, use harness_log tool",
  },
];

function matchesAny(filePath: string, patterns: RegExp[]): RegExp | null {
  for (const p of patterns) {
    if (p.test(filePath)) return p;
  }
  return null;
}

export function suggestAllowPattern(relPath: string): string {
  if (/\.[a-z0-9]{1,5}$/i.test(relPath)) {
    const parent = relPath.substring(0, relPath.lastIndexOf("/"));
    return parent ? `${parent}/**` : "**";
  }
  return `${relPath}/**`;
}

function matchGlob(filePath: string, pattern: string): boolean {
  if (pattern.startsWith("/") && pattern.endsWith("/")) {
    const re = new RegExp(pattern.slice(1, -1));
    return re.test(filePath);
  }
  if (pattern.includes("*") || pattern.includes("?")) {
    const regex = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "::DOUBLESTAR::")
      .replace(/\*/g, "[^/]*")
      .replace(/::DOUBLESTAR::/g, ".*")
      .replace(/\?/g, "[^/]");
    return new RegExp("^" + regex + "$").test(filePath);
  }
  return filePath === pattern || filePath.startsWith(pattern + path.sep);
}

function loadProjectAllowlist(cwd: string): {
  allow: string[];
  deny: string[];
} {
  const projectPath = getProjectAllowlistPath(cwd);
  if (fs.existsSync(projectPath)) {
    const { rules } = readAllowlistFile(projectPath, "project");
    return rules;
  }
  return { allow: [], deny: [] };
}

export function evaluate(args: {
  agent: string;
  filePath: string;
  action: "write" | "edit" | "bash";
  config: PathBoundaryConfig;
}): BoundaryResult {
  const { agent, filePath, action, config } = args;

  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(config.cwd, filePath);
  const rel = path.relative(config.cwd, abs);

  if (rel.startsWith("..")) {
    return {
      ok: false,
      reason: "Path escapes project root",
      matchedRule: "default-deny",
    };
  }

  const deniedRegexp = matchesAny(abs, ALWAYS_DENY);
  if (deniedRegexp) {
    return {
      ok: false,
      reason: `ALWAYS_DENY match: ${deniedRegexp.toString()}`,
      matchedRule: "always-deny",
    };
  }

  for (const redirect of FORCE_TOOL_REDIRECT) {
    if (redirect.pattern.test(abs)) {
      return {
        ok: false,
        reason: `FORCE_TOOL_REDIRECT: use a tool '${redirect.tool}' (${redirect.reason})`,
        matchedRule: "redirect",
      };
    }
  }

  let agentPerm = config.agents[agent]?.[action];
  if (agentPerm === undefined && action === "edit") {
    agentPerm = config.agents[agent]?.["write"];
  }

  if (agentPerm !== undefined) {
    if (typeof agentPerm === "string") {
      switch (agentPerm) {
        case "deny":
          return {
            ok: false,
            reason: `Agent ${agent} has explicit ${action}=deny`,
            matchedRule: "deny",
          };
        case "ask":
          return {
            ok: false,
            reason: `Agent ${agent} has explicit ${action}=ask`,
            matchedRule: "ask",
          };
        case "allow":
          if (config.agents[agent]?.[action] !== undefined) {
            return { ok: true, matchedRule: "allow" };
          }
          break;
      }
    }

    if (
      typeof agentPerm === "object" &&
      ("deny" in agentPerm || "allow" in agentPerm)
    ) {
      const denyList = (agentPerm as { deny?: string[] }).deny ?? [];
      const allowList = (agentPerm as { allow?: string[] }).allow ?? [];

      for (const pattern of denyList) {
        if (matchGlob(rel, pattern)) {
          return {
            ok: false,
            reason: `Agent denylist match: ${pattern}`,
            matchedRule: "deny",
            rule: pattern,
          };
        }
      }

      for (const pattern of allowList) {
        if (matchGlob(rel, pattern)) {
          return { ok: true, matchedRule: "allow", rule: pattern };
        }
      }

      const projAllowlist = loadProjectAllowlist(config.cwd);
      for (const pattern of projAllowlist.allow) {
        if (matchGlob(rel, pattern)) {
          return { ok: true, matchedRule: "allow", rule: pattern };
        }
      }

      return {
        ok: false,
        reason: `Path ${rel} not in agent ${agent} allowlist`,
        matchedRule: "default-deny",
      };
    }

    if (typeof agentPerm === "object" && !Array.isArray(agentPerm)) {
      const matches: Array<{
        pattern: string;
        rule: CapabilityRule;
        priority: number;
      }> = [];
      for (const [pattern, rule] of Object.entries(agentPerm)) {
        if (matchGlob(rel, pattern)) {
          const isDeny = rule === "deny" || pattern.startsWith("!");
          matches.push({ pattern, rule, priority: isDeny ? 0 : 1 });
        }
      }
      matches.sort((a, b) => a.priority - b.priority);
      if (matches.length > 0) {
        const first = matches[0];
        if (first.rule === "deny") {
          return {
            ok: false,
            reason: `Agent match-pattern deny: ${first.pattern}`,
            matchedRule: "deny",
            rule: first.pattern,
          };
        }
        if (first.rule === "ask") {
          return {
            ok: false,
            reason: `Agent match-pattern ask: ${first.pattern}`,
            matchedRule: "ask",
            rule: first.pattern,
          };
        }
        return { ok: true, matchedRule: "allow", rule: first.pattern };
      }
    }
  } else if (config.defaultDeny && Object.keys(config.agents).length > 0) {
    return {
      ok: false,
      reason: `Agent ${agent} not configured and defaultDeny active`,
      matchedRule: "default-deny",
    };
  }

  const mode = process.env.HARNESS_PATH_BOUNDARY_MODE || "fail-open";
  const projectAllowlistPath = getProjectAllowlistPath(config.cwd);
  const hasProjectAllowlist = fs.existsSync(projectAllowlistPath);

  const resolvedProjectAL = path.resolve(projectAllowlistPath);
  const resolvedGlobalAL = path.resolve(getAllowlistPath());
  const globalIsSameAsProject = resolvedProjectAL === resolvedGlobalAL;

  if (!globalIsSameAsProject && fs.existsSync(getAllowlistPath())) {
    const { rules: globalRules } = readAllowlistFile(getAllowlistPath(), "global");
    for (const pattern of globalRules.deny) {
      if (matchGlob(rel, pattern)) {
        return {
          ok: false,
          reason: `Global denylist match: ${pattern}`,
          matchedRule: "deny",
          rule: pattern,
        };
      }
    }
  }

  if (!hasProjectAllowlist) {
    if (mode === "fail-closed") {
      warn(`WARNING: No project allowlist found in fail-closed mode at ${projectAllowlistPath}`);
      return {
        ok: false,
        reason: "No project allowlist found in fail-closed mode",
        matchedRule: "default-deny",
      };
    }
    return { ok: true, matchedRule: "default" };
  }

  const { rules: projectRules, status: projectStatus } = readAllowlistFile(
    projectAllowlistPath,
    "project",
  );

  if (!projectStatus.ok) {
    const msg = `[path-boundary] WARNING: project allowlist com erro de parse — ${projectAllowlistPath}: ${projectStatus.reason}\n`;
    warn(msg.trim());
    if (mode === "fail-closed") {
      return {
        ok: false,
        reason: "Project allowlist corrupted in fail-closed mode",
        matchedRule: "default-deny",
      };
    }
    return { ok: true, matchedRule: "default" };
  }

  for (const pattern of projectRules.deny) {
    if (matchGlob(rel, pattern)) {
      return {
        ok: false,
        reason: `Project denylist match: ${pattern}`,
        matchedRule: "deny",
        rule: pattern,
      };
    }
  }

  let allowed = false;
  for (const pattern of projectRules.allow) {
    if (matchGlob(rel, pattern)) {
      allowed = true;
      break;
    }
  }

  if (allowed) {
    return { ok: true, matchedRule: "allow" };
  }

  if (projectRules.allow.length > 0) {
    const suggestedPattern = suggestAllowPattern(rel);

    if (
      process.env.HARNESS_AUTO_ALLOW_ON_BLOCK === "1" &&
      !isAutoAllowDisabled(config.cwd)
    ) {
      const added = addToProjectAllowlist(
        config.cwd,
        suggestedPattern,
        "allow",
        {
          source: "auto",
          blockedPath: rel,
        },
      );
      if (added) {
        warn(`AUTO-ALLOW: adicionado "${suggestedPattern}" ao project allowlist (audit: .harness/audit/auto-allow.jsonl)`);
        return {
          ok: true,
          matchedRule: "auto-allow",
          rule: suggestedPattern,
        };
      }
    }

    if (config.defaultDeny) {
      return {
        ok: false,
        reason: `Default deny active for path ${rel}`,
        matchedRule: "default-deny",
      };
    }

    return {
      ok: false,
      reason:
        `Path "${rel}" nao esta no allowlist do projeto (${projectAllowlistPath}).\n` +
        `\n` +
        `>>> ACAO OBRIGATORIA PARA O AGENTE <<<\n` +
        `NAO retente esta escrita. NAO tente paths alternativos. NAO faca loops.\n` +
        `USE a tool 'question' para perguntar ao usuario:\n` +
        `  "O path '${rel}' esta bloqueado pelo path-boundary. Posso adicionar '${suggestedPattern}' ao allowlist do projeto para liberar?"\n` +
        `\n` +
        `Se o usuario autorizar, chame o MCP tool:\n` +
        `  harness-allowlist action=add pattern="${suggestedPattern}" type=allow target=project\n` +
        `\n` +
        `OU o usuario pode rodar manualmente:\n` +
        `  ./install.sh --add-allow '${suggestedPattern}'\n` +
        `OU editar o allowlist do projeto e tentar novamente\n` +
        `(o plugin tem hot-reload via mtime, restart NAO eh necessario).`,
      matchedRule: "default-deny",
      rule: suggestedPattern,
    };
  }

  return { ok: true, matchedRule: "default" };
}

export function validateCapabilityGrant(grant: {
  agent: string;
  skills?: string[];
  paths?: { allow?: string[]; deny?: string[] };
}): { ok: true } | { ok: false; reason: string } {
  if (grant.agent === "frontend") {
    const banned = [
      "backend-tdd",
      "qa-e2e",
      "security-audit-audit-mode",
      "lgpd-compliance",
    ];
    const found = (grant.skills ?? []).filter((s) => banned.includes(s));
    if (found.length > 0) {
      return {
        ok: false,
        reason: `frontend agent must not have skills: ${found.join(", ")}`,
      };
    }

    const required = ["frontend-context-first", "grill-me"];
    const missing = required.filter((s) => !(grant.skills ?? []).includes(s));
    if (missing.length > 0) {
      return {
        ok: false,
        reason: `frontend agent missing required skills: ${missing.join(", ")}`,
      };
    }
  }

  if (grant.agent === "backend") {
    const banned = [
      "frontend-context-first",
      "frontend-style-guide",
      "frontend-component-patterns",
    ];
    const found = (grant.skills ?? []).filter((s) => banned.includes(s));
    if (found.length > 0) {
      return {
        ok: false,
        reason: `backend agent must not have skills: ${found.join(", ")}`,
      };
    }
  }

  return { ok: true };
}

export function inferFoldersFromTask(task: {
  files?: string[];
  description?: string;
}): string[] {
  const folders = new Set<string>();
  for (const file of task.files ?? []) {
    const dir = file.includes("/")
      ? file.substring(0, file.lastIndexOf("/"))
      : ".";
    folders.add(dir);
  }
  if (task.description) {
    const matches = task.description.match(
      /(?:src|app|lib|components|features|modules)\/[\w\-/.]*/g,
    );
    for (const m of matches ?? []) {
      const dir = m.includes("/") ? m.substring(0, m.lastIndexOf("/")) : m;
      folders.add(dir);
    }
  }
  return Array.from(folders);
}
