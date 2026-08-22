/**
 * path-boundary.ts — v6.5.0 (Híbrido Smart Merge)
 *
 * Plugin de segurança que impede edições não autorizadas a caminhos críticos do harness
 * e reforça os limites de escrita (path boundaries) dos agentes.
 *
 * Suporta:
 *   1. ALWAYS_DENY (proteção de arquivos de estado contra qualquer escrita direta)
 *   2. FORCE_TOOL_REDIRECT (obriga alterações de estado via ferramentas dedicadas)
 *   3. Allowlist global (~/.config/opencode/harness-allowlist.json) com suporte fail-closed/fail-open
 *   4. Denylist e Allowlist modular por agente (regex, glob, exact) configurado no opencode.json
 *   5. Funções utilitárias validateCapabilityGrant e inferFoldersFromTask
 */
import type { Plugin } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveProjectCwd } from "./lib/resolve-project-cwd.js";
import { quietWarn } from "./lib/quiet-warn.js";

// Helper local: warnings vão para arquivo (não stderr) para não poluir a UI do TUI.
const warn = (msg: string) => quietWarn("path-boundary", msg);

// ─── Tipos e Interfaces ──────────────────────────────────────────────────────

type CapabilityRule =
  | "allow"
  | "deny"
  | "ask"
  | { allow?: string[]; deny?: string[] };

interface AgentPermission {
  write?: CapabilityRule | Record<string, CapabilityRule>;
  edit?: CapabilityRule | Record<string, CapabilityRule>;
  bash?: CapabilityRule | Record<string, CapabilityRule>;
  read?: CapabilityRule | Record<string, CapabilityRule>;
}

interface PathBoundaryConfig {
  cwd: string;
  agents: Record<string, AgentPermission>;
  defaultDeny?: boolean;
  allowlistPath?: string;
}

interface BoundaryResult {
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
// ─── Frontmatter Parser (agents/*.md) ────────────────────────────────────────

/**
 * Extrai o frontmatter YAML de um arquivo markdown.
 * Formato esperado:
 *   ---
 *   name: backend
 *   permission:
 *     write:
 *       "src/**": allow
 *       "server/**": allow
 *     bash: allow
 *   ---
 */
function parseFrontmatter(content: string): Record<string, any> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const yaml = match[1];
  const result: Record<string, any> = {};
  let currentKey = "";
  let currentIndent = 0;
  const lines = yaml.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Top-level key: value
    const topMatch = line.match(/^(\w+):\s*(.*)$/);
    if (topMatch && !line.startsWith(" ") && !line.startsWith("\t")) {
      currentKey = topMatch[1];
      const value = topMatch[2].trim();
      if (value === "") {
        //可能有nested block below - 初始化为object
        result[currentKey] = {};
      } else {
        //处理简单值
        result[currentKey] = parseYamlValue(value);
      }
      continue;
    }
    
    // Nested key: value (under currentKey)
    const nestedMatch = line.match(/^(\s+)(\w+):\s*(.*)$/);
    if (nestedMatch && currentKey && result[currentKey] && typeof result[currentKey] === "object") {
      const indent = nestedMatch[1].length;
      const key = nestedMatch[2];
      const value = nestedMatch[3].trim();
      //直接设置嵌套属性
      (result[currentKey] as Record<string, any>)[key] = parseYamlValue(value);
    }
  }
  return result;
}

function parseYamlValue(value: string): any {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  // Remove quotes
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Carrega as permissoes de escrita dos arquivos agents/*.md.
 * Cada arquivo define um frontmatter YAML com bloco `permission`.
 * Fallback: se o campo for string simples (ex: `bash: allow`),
 * mapeia para o formato de evaluate aceito.
 */
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
      // permission.write: { "src/**": allow, ... } 或 { "src/**": "allow" }
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
      // permission.edit
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
      // permission.bash: allow | deny | "allow" | "deny"
      if (perm.bash) {
        agentPerm.bash = perm.bash as CapabilityRule;
      }
      // permission.read
      if (perm.read) {
        agentPerm.read = perm.read as CapabilityRule;
      }
      if (Object.keys(agentPerm).length > 0) {
        result[name] = agentPerm;
      }
    }
  } catch (e) {
    // Best-effort: erro no parse nao bloqueia o plugin
    warn(`Erro ao carregar agents from markdown: ${(e as Error).message}`);
  }
  return result;
}

// Cache para frontmatter dos agents (mtime-based reload)
const agentFrontmatterCache: {
  mtimeMs: number;
  data: Record<string, AgentPermission>;
} = { mtimeMs: 0, data: {} };

function getAgentsFromMarkdown(agentsDir: string): Record<string, AgentPermission> {
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

// ─── Constantes Globais ──────────────────────────────────────────────────────

const ALLOWLIST_PATH = path.join(
  process.env.HOME || "~",
  ".config/opencode/harness-allowlist.json",
);

// Allowlist a nivel de projeto: harness-allowlist.json
// O harness CRIA um allowlist no projeto alvo em: <cwd>/.harness/harness-allowlist.json
// Esse allowlist TEM PRIORIDADE sobre o global.
//
// Busca em DOIS locais (por ordem de prioridade):
//   1. <cwd>/.harness/harness-allowlist.json (criado pelo harness no projeto alvo)
//   2. <cwd>/harness-allowlist.json (fallback: quando o cwd eh o proprio repo do harness)
//
// Deny rules de ambos sao aplicados (defense in depth).
// Allow rules do projeto tem prioridade absoluta.
function getProjectAllowlistPath(cwd: string): string {
  // Prioridade 1: o que o harness CRIA no projeto alvo
  const harnessPath = path.join(cwd, ".harness", "harness-allowlist.json");
  if (fs.existsSync(harnessPath)) {
    return harnessPath;
  }
  // Prioridade 2: raiz do workspace (ex: quando cwd = ~/.config/opencode/)
  const rootPath = path.join(cwd, "harness-allowlist.json");
  if (fs.existsSync(rootPath)) {
    return rootPath;
  }
  // Nenhum encontrado — retorna o path padrao (.harness/) para checagens de existencia
  return harnessPath;
}

interface MergedAllowlist {
  allow: string[];
  deny: string[];
  sources: { path: string; ok: boolean; reason?: string }[];
}

// Cache com hot-reload via mtime (evita reiniciar opencode ao editar allowlist)
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

function readAllowlistFile(
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

/**
 * Carrega allowlist merged (project + global) com hot-reload via mtime.
 * - Se o arquivo nao mudou desde a ultima leitura, retorna cache (fast path).
 * - Se mudou (mtime diferente), re-le e atualiza cache.
 * - Cache eh invalidado se o plugin for recarregado.
 */
export function loadMergedAllowlist(cwd: string): MergedAllowlist {
  const projectPath = getProjectAllowlistPath(cwd);
  const cacheKey = `${cwd}|${projectPath}|${ALLOWLIST_PATH}`;

  // Calcula mtimes uma vez
  const projectMtime = getMtime(projectPath);
  const globalMtime = getMtime(ALLOWLIST_PATH);

  const cached = allowlistCache.get(cacheKey);
  if (cached && cached.mtimeMs === projectMtime + globalMtime) {
    // Cache hit: nada mudou
    return cached.data;
  }

  // Cache miss ou arquivo mudou: re-le
  const result: MergedAllowlist = {
    allow: [],
    deny: [],
    sources: [],
  };
  const allowSet = new Set<string>();
  const denySet = new Set<string>();

  // 1. Project-level (se existir)
  if (fs.existsSync(projectPath)) {
    const { rules, status } = readAllowlistFile(projectPath, "project");
    rules.allow.forEach((p) => allowSet.add(p));
    rules.deny.forEach((p) => denySet.add(p));
    result.sources.push({ path: projectPath, ...status });
  }

  // 2. Global (baseline) — só carrega se for um arquivo DIFERENTE do project-level
  //    Evita merge duplicado quando o workspace == ~/.config/opencode/
  const resolvedProject = projectPath ? path.resolve(projectPath) : "";
  const resolvedGlobal = path.resolve(ALLOWLIST_PATH);
  const isSameFile = resolvedProject === resolvedGlobal;

  if (!isSameFile && fs.existsSync(ALLOWLIST_PATH)) {
    const { rules, status } = readAllowlistFile(ALLOWLIST_PATH, "global");
    rules.allow.forEach((p) => allowSet.add(p));
    rules.deny.forEach((p) => denySet.add(p));
    result.sources.push({ path: ALLOWLIST_PATH, ...status });
  }

  result.allow = [...allowSet];
  result.deny = [...denySet];

  allowlistCache.set(cacheKey, {
    mtimeMs: projectMtime + globalMtime,
    data: result,
  });

  return result;
}

/**
 * Adiciona pattern ao allowlist do projeto. Usado pelo modo auto-allow
 * (env HARNESS_AUTO_ALLOW_ON_BLOCK=1) e quando o usuario usa o MCP tool.
 *
 * Side effects:
 *   - Loga em .harness/audit/auto-allow.jsonl (audit trail)
 *   - Respeita cooldown (HARNESS_AUTO_ALLOW_COOLDOWN_MS, default 60s) para
 *     evitar spam quando o mesmo pattern eh bloqueado repetidamente
 *   - Respeita marker .harness/.no-auto-allow (kill switch por projeto)
 */
const autoAllowCooldown = new Map<string, number>(); // pattern -> lastAddedAt

function isAutoAllowDisabled(cwd: string): boolean {
  // 1. Env var explicita (kill switch global)
  if (process.env.HARNESS_NO_AUTO_ALLOW === "1") return true;
  // 2. Marker file por projeto
  const marker = path.join(cwd, ".harness", ".no-auto-allow");
  return fs.existsSync(marker);
}

function isCooldownActive(cwd: string, pattern: string): boolean {
  const cooldownMs = parseInt(
    process.env.HARNESS_AUTO_ALLOW_COOLDOWN_MS || "60000",
    10,
  );
  if (cooldownMs <= 0) return false; // cooldown desabilitado
  const lastAdded = autoAllowCooldown.get(`${cwd}|${pattern}`) || 0;
  return Date.now() - lastAdded < cooldownMs;
}

// Rate limit: max N auto-adds por minuto (sliding window)
const autoAllowRecentAdds: number[] = []; // timestamps de auto-adds

export function _resetAutoAllowState(): void {
  autoAllowRecentAdds.length = 0;
  autoAllowCooldown.clear();
}

function isRateLimited(): boolean {
  const maxPerMin = parseInt(
    process.env.HARNESS_AUTO_ALLOW_MAX_PER_MIN || "10",
    10,
  );
  if (maxPerMin <= 0) return false; // rate limit desabilitado
  const now = Date.now();
  const oneMinAgo = now - 60_000;
  // Remove timestamps antigos
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
    // best-effort: falha no audit nao bloqueia a operacao
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

  // Cooldown: se mesmo pattern foi adicionado ha pouco tempo, skip
  if (source === "auto" && isCooldownActive(cwd, pattern)) {
    return false; // silencioso — caller ja trata como "no-op"
  }

  // Rate limit: se ja foram adicionados muitos patterns no ultimo minuto, skip
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
      // Invalida cache
      allowlistCache.clear();
      // Registra cooldown + rate limit
      autoAllowCooldown.set(`${cwd}|${pattern}`, Date.now());
      if (source === "auto") recordAutoAdd();
      // Audit log
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

// Caminhos que NUNCA podem ser gravados ou editados diretamente por nenhum agente
const ALWAYS_DENY = [
  /\.harness\/state-machine\.json$/,
  /\.harness\/state\.json$/,
  /\.harness\/events\.jsonl$/,
  /\.harness\/audit\//,
  /\/node_modules\//,
  /\/\.git\//,
  /package-lock\.json$/,
  // P0.3 fix: barra faltante entre ".harness" e "harness-allowlist.json".
  // Antes: casava ".harness-allowlist.json" (sem path separado). Agora: casa
  // `.harness/harness-allowlist.json` corretamente.
  /\.harness\/harness-allowlist\.json$/,
];

// Caminhos de estado que exigem redirect para ferramenta atômica dedicada
const FORCE_TOOL_REDIRECT = [
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

// ─── Funções de Avaliação de Segurança ───────────────────────────────────────

function matchesAny(filePath: string, patterns: RegExp[]): RegExp | null {
  for (const p of patterns) {
    if (p.test(filePath)) return p;
  }
  return null;
}

/**
 * Sugere um pattern de allowlist para um path bloqueado.
 * - Se eh um arquivo: sugere a pasta pai com /**
 * - Se eh uma pasta: sugere a pasta com /**
 * - Tenta detectar patterns comuns como docs/, public/, src/
 */
function suggestAllowPattern(relPath: string): string {
  // Se tem extensao (arquivo), sobe para a pasta pai
  if (/\.[a-z0-9]{1,5}$/i.test(relPath)) {
    const parent = relPath.substring(0, relPath.lastIndexOf("/"));
    return parent ? `${parent}/**` : "**";
  }
  // Ja eh uma pasta
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

/**
 * Avalia se um path é permitido para escrita por um agente específico.
 */
export function evaluate(args: {
  agent: string;
  filePath: string;
  action: "write" | "edit" | "bash";
  config: PathBoundaryConfig;
}): BoundaryResult {
  const { agent, filePath, action, config } = args;

  // 1. Resolve para path absoluto
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

  // 2. Valida ALWAYS_DENY global (defesa contra adulteração de estado do harness)
  const deniedRegexp = matchesAny(abs, ALWAYS_DENY);
  if (deniedRegexp) {
    return {
      ok: false,
      reason: `ALWAYS_DENY match: ${deniedRegexp.toString()}`,
      matchedRule: "always-deny",
    };
  }

  // 3. Valida redirecionamento de tool de estado
  for (const redirect of FORCE_TOOL_REDIRECT) {
    if (redirect.pattern.test(abs)) {
      return {
        ok: false,
        reason: `FORCE_TOOL_REDIRECT: use a tool '${redirect.tool}' (${redirect.reason})`,
        matchedRule: "redirect",
      };
    }
  }

  // 4. Valida permissão modular do agente do opencode.json
  // Fallback de "edit" para "write" caso "edit" não esteja configurado
  let agentPerm = config.agents[agent]?.[action];
  if (agentPerm === undefined && action === "edit") {
    agentPerm = config.agents[agent]?.["write"];
  }

  // Se o agente tem permissão modular configurada, processa
  if (agentPerm !== undefined) {
    // 4.1 String simples ("allow" / "deny" / "ask")
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

    // 4.2 Objeto estruturado com allow/deny (ou apenas um deles)
    if (
      typeof agentPerm === "object" &&
      ("deny" in agentPerm || "allow" in agentPerm)
    ) {
      const denyList = (agentPerm as { deny?: string[] }).deny ?? [];
      const allowList = (agentPerm as { allow?: string[] }).allow ?? [];

      // Denylist do agente tem precedência absoluta
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

      // Allowlist do agente
      for (const pattern of allowList) {
        if (matchGlob(rel, pattern)) {
          return { ok: true, matchedRule: "allow", rule: pattern };
        }
      }

      // Se o agente tem permissões explícitas mas o caminho não bateu com a allowlist do agente,
      // verifica se a allowlist do PROJETO (.harness/harness-allowlist.json) libera explicitamente.
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

    // 4.3 Mapa pattern -> rule
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

  // 5. Avalia allowlist do PROJETO ALVO (prioridade máxima)
  //
  // REGRA DE PRIORIDADE:
  //   - O allowlist que o harness CRIA no projeto alvo (.harness/harness-allowlist.json)
  //     tem prioridade absoluta sobre o allowlist global.
  //   - O allowlist GLOBAL (~/.config/opencode/harness-allowlist.json) serve APENAS
  //     como baseline de proteção (deny de .env, secrets, chaves).
  //   - Se o projeto alvo NAO tem allowlist proprio, o agente pode trabalhar
  //     livremente dentro do repo (fail-open por padrao).
  //
  const mode = process.env.HARNESS_PATH_BOUNDARY_MODE || "fail-open";
  const projectAllowlistPath = getProjectAllowlistPath(config.cwd);
  const hasProjectAllowlist = fs.existsSync(projectAllowlistPath);

  // --- DENY GLOBAL: sempre aplicado (protege .env, secrets, chaves) ---
  // Busca deny rules da allowlist global SOMENTE se for arquivo diferente do projeto.
  const resolvedProjectAL = path.resolve(projectAllowlistPath);
  const resolvedGlobalAL = path.resolve(ALLOWLIST_PATH);
  const globalIsSameAsProject = resolvedProjectAL === resolvedGlobalAL;

  if (!globalIsSameAsProject && fs.existsSync(ALLOWLIST_PATH)) {
    const { rules: globalRules } = readAllowlistFile(ALLOWLIST_PATH, "global");
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
    // NOTA: allow rules do global NAO restringem o projeto. Apenas deny.
  }

  // --- Se o projeto NAO tem allowlist proprio ---
  if (!hasProjectAllowlist) {
    if (mode === "fail-closed") {
      warn(`WARNING: No project allowlist found in fail-closed mode at ${projectAllowlistPath}`);
      return {
        ok: false,
        reason: "No project allowlist found in fail-closed mode",
        matchedRule: "default-deny",
      };
    }
    // Fail-open (padrao): agente pode trabalhar livremente dentro do repo
    return { ok: true, matchedRule: "default" };
  }

  // --- Projeto TEM allowlist proprio — aplica a logica completa ---
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
    // Fail-open: se o parse falhou, permite (nao bloqueia por corrupcao)
    return { ok: true, matchedRule: "default" };
  }

  // Deny rules DO PROJETO: bloqueiam
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

  // Allow rules DO PROJETO: se o path bate, permite
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

  // Path nao bateu com nenhuma allow rule do projeto
  if (projectRules.allow.length > 0) {
    // Sugere automaticamente o pattern que o usuario pode adicionar
    const suggestedPattern = suggestAllowPattern(rel);

    // Modo auto-allow: se a env var estiver setada E nao desabilitado
    // por .harness/.no-auto-allow nem por HARNESS_NO_AUTO_ALLOW=1.
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
      // Cooldown ativo ou duplicado: cai para o fluxo normal de bloqueio
    }

    // Se config.defaultDeny for true, bloqueia imediatamente
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

  // Projeto tem allowlist mas sem allow rules (so deny rules) = permite tudo que nao bateu deny
  return { ok: true, matchedRule: "default" };

  // 6. Se defaultDeny for ativado e não temos allowlist permitindo explicitamente
  if (config.defaultDeny) {
    return {
      ok: false,
      reason: `Agent ${agent} has no explicit ${action} permission configured`,
      matchedRule: "default-deny",
    };
  }

  return { ok: true, matchedRule: "default" };
}

/**
 * Valida a integridade do capability grant despachado pelo orchestrator.
 */
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

/**
 * Infere quais pastas o agente vai tocar baseado no conteúdo da tarefa.
 */
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

// ─── Plugin Entrypoint ───────────────────────────────────────────────────────

export const PathBoundaryPlugin: Plugin = async (ctx) => {
  // Resolve projectRoot com helper centralizado (resolve bug do worktree="/")
  const projectRoot: string = resolveProjectCwd(ctx, { log: (m: string) => quietWarn("path-boundary", m) });

  // v6.6.2 — Log de recursos (ajuda debug de OOM)
  const freeMemGB = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);
  const totalMemGB = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
  warn(`RAM: ${freeMemGB}GB livre / ${totalMemGB}GB total`);
  if (parseFloat(freeMemGB) < 2) {
    warn(`⚠️  RAM crítica. Recomenda-se: HARNESS_PLAYWRIGHT_WORKERS=1 HARNESS_VITEST_WORKERS=1`);
  }

  const config: PathBoundaryConfig = {
    cwd: projectRoot,
    agents: {},
    defaultDeny: process.env.HARNESS_PATH_BOUNDARY_MODE === "fail-closed",
  };

  // Escuta atualizações de configuração dinâmicas da CLI do OpenCode se houver
  const client = (ctx as any)?.client;
  if (client?.event && typeof client.event.on === "function") {
    client.event.on("config.updated", (newConfig: any) => {
      if (newConfig && newConfig.agents) {
        config.agents = newConfig.agents;
      }
    });
  }

  // Tenta carregar as permissões do opencode.json local como cache de inicialização
  try {
    const opencodeJsonPath = path.join(projectRoot, "opencode.json");
    if (fs.existsSync(opencodeJsonPath)) {
      const opencodeData = JSON.parse(
        fs.readFileSync(opencodeJsonPath, "utf8"),
      );
      if (opencodeData && opencodeData.agent) {
        const parsedAgents: Record<string, AgentPermission> = {};
        for (const [name, data] of Object.entries(opencodeData.agent)) {
          if (data && typeof data === "object" && "permission" in data) {
            parsedAgents[name] = (data as any).permission;
          }
        }
        // opencode.json é baseline; frontmatter dos agents/*.md SobRESCREVE (mais específico)
        // Por isso carregamos frontmatter por cima
        config.agents = parsedAgents;
      }
    }
  } catch (e) {}

  // Carrega permissoes do frontmatter dos agents/*.md (mais específicas, sobrescrevem opencode.json)
  const agentsMarkdownDir = path.join(projectRoot, "agents");
  if (fs.existsSync(agentsMarkdownDir)) {
    const markdownAgents = getAgentsFromMarkdown(agentsMarkdownDir);
    for (const [name, perm] of Object.entries(markdownAgents)) {
      // Merge: frontmatter SOBRESCREVE o que veio do opencode.json
      // (objeto resultante tem as chaves do frontmatter sobre as do opencode.json)
      config.agents[name] = {
        ...(config.agents[name] || {}),
        ...perm,
      } as AgentPermission;
    }
  }

  // ─── Cache de bloqueios recentes (PX: aviso no contexto do LLM) ────────────
  // Quando uma escrita e bloqueada, registramos aqui. O hook
  // experimental.chat.system.transform (mais abaixo) usa esse cache para
  // injetar um <system-reminder> no system prompt da proxima chamada ao LLM,
  // garantindo que o aviso apareca JUNTO COM a resposta da IA, nao so no
  // tool result.
  //
  // TTL: 5 minutos. Apos isso o block e considerado "resolvido" e sai do
  // system prompt. Bound: MAX_BLOCKS (FIFO eviction).
  const recentBlocks = new Map<
    string,
    { reason: string; agent: string; action: string; ts: number }
  >();
  const BLOCK_TTL_MS = 5 * 60 * 1000;
  const MAX_BLOCKS = 16;

  function recordBlock(
    filePath: string,
    reason: string,
    agent: string,
    action: string,
  ): void {
    if (recentBlocks.size >= MAX_BLOCKS) {
      const firstKey = recentBlocks.keys().next().value;
      if (firstKey !== undefined) recentBlocks.delete(firstKey);
    }
    recentBlocks.set(filePath, {
      reason,
      agent,
      action,
      ts: Date.now(),
    });
  }

  function getActiveBlocks(): Array<{
    filePath: string;
    reason: string;
    agent: string;
    action: string;
    ageMs: number;
  }> {
    const now = Date.now();
    // Limpa expirados
    for (const [k, v] of recentBlocks) {
      if (now - v.ts > BLOCK_TTL_MS) recentBlocks.delete(k);
    }
    return Array.from(recentBlocks.entries()).map(([filePath, v]) => ({
      filePath,
      reason: v.reason,
      agent: v.agent,
      action: v.action,
      ageMs: now - v.ts,
    }));
  }

  // Sugere o pattern mais provavel para liberar a escrita.
  // Heuristica: dirname/** ou * se for arquivo de config conhecido.
  function suggestPattern(filePath: string): string {
    const dir = path.dirname(filePath);
    if (dir === "." || dir === "/") return filePath;
    if (filePath.startsWith(".harness/")) return ".harness/**";
    if (filePath.startsWith(".github/")) return ".github/**";
    if (filePath.startsWith("plugins/")) return "plugins/**";
    if (filePath.startsWith("agents/")) return "agents/**";
    if (filePath.startsWith("tools/")) return "tools/**";
    if (filePath.startsWith("tests/")) return "tests/**";
    if (filePath.startsWith("schemas/")) return "schemas/**";
    if (filePath.startsWith("system/")) return "system/**";
    return `${dir}/**`;
  }

  // Helper: dispara toast visual + appendPrompt com comando acionavel.
  // Falhas sao silenciosas (cliente pode nao estar conectado em testes).
  function notifyBlockVisually(
    agent: string,
    action: string,
    filePath: string,
    reason: string,
    suggestedPattern: string,
  ): void {
    const tui = client?.tui;
    if (!tui) return;

    // 1) Toast visual (aparece instantaneamente na UI do OpenCode)
    if (typeof tui.showToast === "function") {
      try {
        void tui.showToast({
          body: {
            title: "path-boundary bloqueou escrita",
            message: `${agent} tentou ${action} em ${filePath}. Motivo: ${reason}`,
            variant: "error",
            duration: 5000,
          },
        });
      } catch {
        // fail-silent: se UI offline, ignora
      }
    }

    // 2) Append prompt (texto pre-pronto que aparece na caixa de entrada
    //    do usuario; ao enviar, vira a proxima mensagem ao LLM)
    if (typeof tui.appendPrompt === "function") {
      const cmd = `harness-allowlist action=add pattern="${suggestedPattern}" type=allow target=project`;
      try {
        void tui.appendPrompt({
          body: {
            text: `[path-boundary] Tentativa bloqueada: ${action} em \`${filePath}\`. ` +
              `Se foi intencional, rode: \`${cmd}\``,
          },
        });
      } catch {
        // fail-silent
      }
    }
  }

  return {
    "tool.execute.before": async (input, output) => {
      const writeTools = [
        "write_to_file",
        "replace_file_content",
        "multi_replace_file_content",
        "edit",
        "write",
      ];

      if (!writeTools.includes(input.tool)) {
        return;
      }

      const args = input?.args || output?.args || {};
      const filePath: string =
        args.TargetFile || args.filePath || args.path || args.file || "";

      if (!filePath) {
        return;
      }

      const agent = input.context?.agent ?? "default";
      const action =
        input.tool === "write" || input.tool === "write_to_file"
          ? "write"
          : "edit";

      const result = evaluate({
        agent,
        filePath,
        action,
        config,
      });

      if (!result.ok) {
        // PX: notifica visualmente (toast + appendPrompt) E registra no
        // cache de blocks para o system reminder da proxima chamada.
        const suggested = suggestPattern(filePath);
        recordBlock(filePath, result.reason, agent, action);
        notifyBlockVisually(agent, action, filePath, result.reason, suggested);

        // Mensagem rica no throw — vai pro tool result error e fica
        // visivel ao LLM na conversa.
        const unlockCmd = `harness-allowlist action=add pattern="${suggested}" type=allow target=project`;
        throw new Error(
          `[path-boundary] BLOCKED: ${agent} cannot ${action} ${filePath} (BLOQUEADO em PT-BR)\n` +
            `\nMotivo: ${result.reason}\n` +
            `\nPara liberar este caminho (com confirmacao): ${unlockCmd}\n` +
            `Ou edite .harness/harness-allowlist.json e adicione "${suggested}" em allow.\n` +
            `\n(Voce vera um aviso visivel no TUI do OpenCode e um system-reminder na proxima resposta.)`,
        );
      }
    },

    // PX: injeta system reminder com bloqueios recentes para que o LLM
    // saiba do bloqueio MESMO se o tool result foi cortado/truncado.
    // Roda antes de cada chamada de chat e adiciona ao system prompt.
    "experimental.chat.system.transform": async (_input, output) => {
      const blocks = getActiveBlocks();
      if (blocks.length === 0) return;

      const lines = blocks.map(
        (b) =>
          `- \`${b.filePath}\` (${b.action}, agente=${b.agent}, ${Math.round(b.ageMs / 1000)}s atras): ${b.reason}`,
      );
      output.system.push(
        `\n<system-reminder>\n` +
          `[path-boundary] ${blocks.length} escrita(s) bloqueada(s) recente(s):\n` +
          `${lines.join("\n")}\n` +
          `Para liberar, adicione o pattern ao .harness/harness-allowlist.json ou use a tool harness-allowlist.\n` +
          `</system-reminder>\n`,
      );
    },
  };
};
