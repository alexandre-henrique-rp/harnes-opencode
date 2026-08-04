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
import * as path from "path";

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
  matchedRule?: "allow" | "deny" | "ask" | "default-deny" | "always-deny" | "redirect" | "default" | "auto-allow";
  rule?: string;
}
// ─── Constantes Globais ──────────────────────────────────────────────────────

const ALLOWLIST_PATH = path.join(
  process.env.HOME || "~",
  ".config/opencode/harness-allowlist.json"
);

// Allowlist a nivel de projeto: .harness/harness-allowlist.json
// Se existir, eh MERGEADA com a global (project pode estender, nao loosar).
// Deny rules de ambos sao aplicados (defense in depth).
// Allow rules de ambos sao OR'ed (qualquer match permite).
function getProjectAllowlistPath(cwd: string): string {
  return path.join(cwd, ".harness", "harness-allowlist.json");
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

function readAllowlistFile(filePath: string, sourceName: string): { rules: { allow: string[]; deny: string[] }; status: { ok: boolean; reason?: string } } {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      rules: {
        allow: data.allow || [],
        deny: data.deny || [],
      },
      status: { ok: true },
    };
  } catch (e) {
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

  // 2. Global (baseline)
  if (fs.existsSync(ALLOWLIST_PATH)) {
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
  const cooldownMs = parseInt(process.env.HARNESS_AUTO_ALLOW_COOLDOWN_MS || "60000", 10);
  if (cooldownMs <= 0) return false; // cooldown desabilitado
  const lastAdded = autoAllowCooldown.get(`${cwd}|${pattern}`) || 0;
  return Date.now() - lastAdded < cooldownMs;
}

// Rate limit: max N auto-adds por minuto (sliding window)
const autoAllowRecentAdds: number[] = []; // timestamps de auto-adds
function isRateLimited(): boolean {
  const maxPerMin = parseInt(process.env.HARNESS_AUTO_ALLOW_MAX_PER_MIN || "10", 10);
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

function writeAutoAllowAudit(cwd: string, entry: {
  ts: string;
  pattern: string;
  type: "allow" | "deny";
  blockedPath: string;
  source: "auto" | "manual";
}): void {
  try {
    const auditDir = path.join(cwd, ".harness", "audit");
    fs.mkdirSync(auditDir, { recursive: true });
    const auditFile = path.join(auditDir, "auto-allow.jsonl");
    fs.appendFileSync(auditFile, JSON.stringify(entry) + "\n");
  } catch (e) {
    // best-effort: falha no audit nao bloqueia a operacao
    process.stderr.write(`[path-boundary] audit write falhou: ${(e as Error).message}\n`);
  }
}

export function addToProjectAllowlist(
  cwd: string,
  pattern: string,
  type: "allow" | "deny",
  options: { source?: "auto" | "manual"; blockedPath?: string } = {}
): boolean {
  const source = options.source || "manual";
  const projectPath = getProjectAllowlistPath(cwd);

  // Cooldown: se mesmo pattern foi adicionado ha pouco tempo, skip
  if (source === "auto" && isCooldownActive(cwd, pattern)) {
    return false; // silencioso — caller ja trata como "no-op"
  }

  // Rate limit: se ja foram adicionados muitos patterns no ultimo minuto, skip
  if (source === "auto" && isRateLimited()) {
    process.stderr.write(
      `[path-boundary] RATE LIMIT: max auto-adds por minuto atingido. Block adicionando "${pattern}". ` +
      `Aumente HARNESS_AUTO_ALLOW_MAX_PER_MIN ou espere 60s.\n`
    );
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
    const list = data[type] || (data[type] = []);
    if (!list.includes(pattern)) {
      list.push(pattern);
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
    process.stderr.write(`[path-boundary] Erro ao adicionar ao allowlist: ${(e as Error).message}\n`);
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
  /\.harness-allowlist\.json$/,
];

// Caminhos de estado que exigem redirect para ferramenta atômica dedicada
const FORCE_TOOL_REDIRECT = [
  {
    pattern: /\.harness\/state\.json$/,
    tool: "harness_advance",
    reason: "state.json só pode ser editado via harness_advance tool (valida gate)",
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
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(config.cwd, filePath);
  const rel = path.relative(config.cwd, abs);

  if (rel.startsWith("..")) {
    return { ok: false, reason: "Path escapes project root", matchedRule: "default-deny" };
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
          return { ok: false, reason: `Agent ${agent} has explicit ${action}=deny`, matchedRule: "deny" };
        case "ask":
          return { ok: false, reason: `Agent ${agent} has explicit ${action}=ask`, matchedRule: "ask" };
        case "allow":
          if (config.agents[agent]?.[action] !== undefined) {
            return { ok: true, matchedRule: "allow" };
          }
          break;
      }
    }

    // 4.2 Objeto estruturado com allow/deny (ou apenas um deles)
    if (typeof agentPerm === "object" && ("deny" in agentPerm || "allow" in agentPerm)) {
      const denyList = (agentPerm as { deny?: string[] }).deny ?? [];
      const allowList = (agentPerm as { allow?: string[] }).allow ?? [];

      // Denylist do agente tem precedência absoluta
      for (const pattern of denyList) {
        if (matchGlob(rel, pattern)) {
          return { ok: false, reason: `Agent denylist match: ${pattern}`, matchedRule: "deny", rule: pattern };
        }
      }

      // Allowlist do agente
      for (const pattern of allowList) {
        if (matchGlob(rel, pattern)) {
          return { ok: true, matchedRule: "allow", rule: pattern };
        }
      }

      // Se o agente tem permissões explícitas mas o caminho não bateu com allowlist
      return { ok: false, reason: `No agent allow rule matched for ${rel}`, matchedRule: "default-deny" };
    }

    // 4.3 Mapa pattern -> rule
    if (typeof agentPerm === "object" && !Array.isArray(agentPerm)) {
      const matches: Array<{ pattern: string; rule: CapabilityRule; priority: number }> = [];
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
          return { ok: false, reason: `Agent match-pattern deny: ${first.pattern}`, matchedRule: "deny", rule: first.pattern };
        }
        if (first.rule === "ask") {
          return { ok: false, reason: `Agent match-pattern ask: ${first.pattern}`, matchedRule: "ask", rule: first.pattern };
        }
        return { ok: true, matchedRule: "allow", rule: first.pattern };
      }
    }
  } else if (config.defaultDeny && Object.keys(config.agents).length > 0) {
    return { ok: false, reason: `Agent ${agent} not configured and defaultDeny active`, matchedRule: "default-deny" };
  }

  // 5. Carrega allowlist merged (project + global)
  const mode = process.env.HARNESS_PATH_BOUNDARY_MODE || "fail-open";
  const merged = loadMergedAllowlist(config.cwd);

  if (merged.sources.length === 0) {
    if (mode === "fail-closed") {
      process.stderr.write(`[path-boundary] WARNING: nenhum harness-allowlist.json encontrado. Escrita bloqueada.\n`);
      return { ok: false, reason: "No allowlist (project or global) found in fail-closed mode", matchedRule: "default-deny" };
    }
  } else {
    const hasErrors = merged.sources.some((s) => !s.ok);
    if (hasErrors) {
      const bad = merged.sources.filter((s) => !s.ok);
      const msg = `[path-boundary] WARNING: allowlist com erro de parse — ${bad.map((b) => `${b.path}: ${b.reason}`).join("; ")}\n`;
      process.stderr.write(msg);
      if (mode === "fail-closed") {
        return { ok: false, reason: "Allowlist corrupted in fail-closed mode", matchedRule: "default-deny" };
      }
    }

// Deny rules: de qualquer source, bloqueiam
      for (const pattern of merged.deny) {
        if (matchGlob(rel, pattern)) {
          return { ok: false, reason: `Denylist match: ${pattern}`, matchedRule: "deny", rule: pattern };
        }
      }

      // Allow rules: qualquer source permite
      let allowed = false;
      for (const pattern of merged.allow) {
        if (matchGlob(rel, pattern)) {
          allowed = true;
          break;
        }
      }

      if (!allowed && merged.allow.length > 0) {
        // Sugere automaticamente o pattern que o usuario pode adicionar
        const suggestedPattern = suggestAllowPattern(rel);

        // Modo auto-allow: se a env var estiver setada E nao desabilitado
        // por .harness/.no-auto-allow nem por HARNESS_NO_AUTO_ALLOW=1.
        if (process.env.HARNESS_AUTO_ALLOW_ON_BLOCK === "1" && !isAutoAllowDisabled(config.cwd)) {
          const added = addToProjectAllowlist(config.cwd, suggestedPattern, "allow", {
            source: "auto",
            blockedPath: rel,
          });
          if (added) {
            process.stderr.write(
              `[path-boundary] AUTO-ALLOW: adicionado "${suggestedPattern}" ao .harness/harness-allowlist.json (audit: .harness/audit/auto-allow.jsonl)\n`
            );
            return { ok: true, matchedRule: "auto-allow", rule: suggestedPattern };
          }
          // Cooldown ativo ou duplicado: cai para o fluxo normal de bloqueio
        }

        // Se config.defaultDeny for true, bloqueia imediatamente
        if (config.defaultDeny) {
           return { ok: false, reason: `Default deny active for path ${rel}`, matchedRule: "default-deny" };
        }

        return {
          ok: false,
          // Mensagem OTIMIZADA para o agente: manda PARAR e perguntar ao usuario.
          reason: `Path "${rel}" nao esta em nenhuma allowlist (project + global).\n` +
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
                  `OU editar .harness/harness-allowlist.json e tentar novamente\n` +
                  `(o plugin tem hot-reload via mtime, restart NAO eh necessario).`,
          matchedRule: "default-deny",
          rule: suggestedPattern,
        };
      }
      return { ok: true, matchedRule: "allow" };
  }

  // 6. Se defaultDeny for ativado e não temos allowlist permitindo explicitamente
  if (config.defaultDeny) {
    return { ok: false, reason: `Agent ${agent} has no explicit ${action} permission configured`, matchedRule: "default-deny" };
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
    const banned = ["backend-tdd", "qa-e2e", "security-audit-audit-mode", "lgpd-compliance"];
    const found = (grant.skills ?? []).filter((s) => banned.includes(s));
    if (found.length > 0) {
      return { ok: false, reason: `frontend agent must not have skills: ${found.join(", ")}` };
    }

    const required = ["frontend-context-first", "grill-me"];
    const missing = required.filter((s) => !(grant.skills ?? []).includes(s));
    if (missing.length > 0) {
      return { ok: false, reason: `frontend agent missing required skills: ${missing.join(", ")}` };
    }
  }

  if (grant.agent === "backend") {
    const banned = ["frontend-context-first", "frontend-style-guide", "frontend-component-patterns"];
    const found = (grant.skills ?? []).filter((s) => banned.includes(s));
    if (found.length > 0) {
      return { ok: false, reason: `backend agent must not have skills: ${found.join(", ")}` };
    }
  }

  return { ok: true };
}

/**
 * Infere quais pastas o agente vai tocar baseado no conteúdo da tarefa.
 */
export function inferFoldersFromTask(task: { files?: string[]; description?: string }): string[] {
  const folders = new Set<string>();
  for (const file of task.files ?? []) {
    const dir = file.includes("/") ? file.substring(0, file.lastIndexOf("/")) : ".";
    folders.add(dir);
  }
  if (task.description) {
    const matches = task.description.match(/(?:src|app|lib|components|features|modules)\/[\w\-/.]*/g);
    for (const m of matches ?? []) {
      const dir = m.includes("/") ? m.substring(0, m.lastIndexOf("/")) : m;
      folders.add(dir);
    }
  }
  return Array.from(folders);
}

// ─── Plugin Entrypoint ───────────────────────────────────────────────────────

export const PathBoundaryPlugin: Plugin = async (ctx) => {
  const projectRoot: string =
    ctx.worktree && ctx.worktree !== "/" && ctx.worktree.startsWith("/")
      ? ctx.worktree
      : ctx.directory && ctx.directory !== "/" && ctx.directory.startsWith("/")
      ? ctx.directory
      : process.cwd();

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
      const opencodeData = JSON.parse(fs.readFileSync(opencodeJsonPath, "utf8"));
      if (opencodeData && opencodeData.agent) {
        const parsedAgents: Record<string, AgentPermission> = {};
        for (const [name, data] of Object.entries(opencodeData.agent)) {
          if (data && typeof data === "object" && "permission" in data) {
            parsedAgents[name] = (data as any).permission;
          }
        }
        config.agents = parsedAgents;
      }
    }
  } catch (e) {}

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
      const action = input.tool === "write" || input.tool === "write_to_file" ? "write" : "edit";

      const result = evaluate({
        agent,
        filePath,
        action,
        config,
      });

      if (!result.ok) {
        process.stderr.write(`[path-boundary] BLOCKED: ${agent} cannot ${action} ${filePath}\n`);
        throw new Error(
          `[path-boundary] BLOCKED: ${agent} cannot ${action} ${filePath}\n` +
          `\n${result.reason}`
        );
      }
    },
  };
};
