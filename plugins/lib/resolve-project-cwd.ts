/**
 * resolve-project-cwd.ts — Helper centralizado para resolver o projectRoot correto
 *
 * O bug que isto resolve:
 *   - Tools/plugins usavam `context?.worktree || context?.directory || process.cwd()`
 *   - Quando opencode é aberto sem worktree explícito, cai em process.cwd()
 *   - Se process.cwd() = ~/.config/opencode/, tudo escreve no .harness/ global
 *
 * Cadeia de prioridade:
 *   1. .harness/project.json (PRIORIDADE ABSOLUTA — bypassa tudo)
 *   2. ctx.worktree (se válido: absoluto, >= 3 chars, não "/")
 *   3. ctx.directory (se válido)
 *   4. Auto-detect subindo de process.cwd() procurando:
 *      - .git/, package.json, pyproject.toml, Cargo.toml, go.mod, pom.xml
 *   5. Fallback para process.cwd() com WARNING (configurável)
 *      - Quando cai aqui, escaneia filhos imediatos procurando .git/ e
 *        sugere criar .harness/project.json (caso multi-projeto)
 *
 * Mudanças v6.7.0:
 *   - Cache em memória por cwdHint (evita spam quando 3+ plugins resolvem
 *     o mesmo caminho na mesma sessão)
 *   - Sugestão automática de irmãos quando cai no fallback
 *   - resolveProjectCwdWithSource agora é a implementação canônica
 *
 * Uso:
 *   import { resolveProjectCwd } from "./lib/resolve-project-cwd";
 *   const cwd = resolveProjectCwd(ctx, { log: console.error });
 */

import * as fs from "node:fs";
import * as path from "node:path";

// Marcadores que indicam raiz de projeto
const PROJECT_MARKERS = [
  ".git/",
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "Gemfile",
];

// Cache de resolução (v6.7.0+) — evita repetir 3+ plugins chamarem o helper
// e logarem o mesmo warning durante uma sessão.
// Bound simples: se ultrapassar, descarta entradas antigas (FIFO).
const CWD_CACHE_MAX = 64;
const cwdResolutionCache = new Map<string, ResolvedCwd>();

export interface ResolveOptions {
  /** Default: true. Se false, joga erro quando não detectar projeto. */
  fallbackToProcessCwd?: boolean;
  /** Função de log. Default: stderr. */
  log?: (msg: string) => void;
  /** Marcadores customizados (default: PROJECT_MARKERS). */
  markers?: string[];
  /** Profundidade máxima de subida. Default: 10. */
  maxDepth?: number;
  /** v6.7.0+: emite logs do helper na resolução. Default: false. */
  verbose?: boolean;
}

/**
 * Resolve o projectRoot correto do projeto alvo.
 * NUNCA retorna "/" ou path inválido.
 *
 * v6.7.0: consulta cache antes de delegar para a implementação canônica.
 * Resolve o bug de spam onde 3+ plugins (audit-logger, path-boundary,
 * status-injector) chamavam o helper independentemente e logavam o mesmo
 * warning durante uma sessão (até 6 mensagens por sessão).
 */
export function resolveProjectCwd(
  ctx: any,
  options: ResolveOptions = {},
): string {
  const log = options.log ?? ((m: string) => process.stderr.write(m + "\n"));
  const cwdHint = pickCwdHint(ctx);

  // Cache hit: retorna imediatamente sem logar nem re-resolver.
  // Isso garante que o [resolve-cwd] WARNING apareça UMA VEZ por sessão
  // (na 1ª chamada) e não 3+ vezes (uma por plugin).
  const cached = cwdResolutionCache.get(cwdHint);
  if (cached) {
    return cached.projectRoot;
  }

  // Cache miss: resolve via implementação canônica e emite logs (1ª vez).
  const resolved = resolveProjectCwdWithSource(ctx, options);
  emitResolutionLog(log, resolved, ctx);
  return resolved.projectRoot;
}

/**
 * Escolhe o cwdHint para a sessão: worktree > directory > process.cwd().
 * Espelha a lógica interna do resolver canônico para garantir que a chave
 * do cache bate com a decisão de resolução.
 */
function pickCwdHint(ctx: any): string {
  const isValidPath = (p: unknown): p is string =>
    typeof p === "string" && p.length >= 3 && p !== "/" && p.startsWith("/");
  const project = ctx?.project || ctx;
  return isValidPath(project?.worktree)
    ? project.worktree
    : isValidPath(project?.directory)
      ? project.directory
      : process.cwd();
}

/**
 * Emite o log apropriado conforme a fonte da resolução.
 * Apenas UMA chamada (1ª vez por sessão graças ao cache).
 */
function emitResolutionLog(
  log: (msg: string) => void,
  resolved: ResolvedCwd,
  ctx: any,
): void {
  switch (resolved.source) {
    case "project.json":
      log(`[resolve-cwd] projectRoot: ${resolved.projectRoot} (from .harness/project.json)`);
      return;
    case "worktree":
      log(`[resolve-cwd] projectRoot: ${resolved.projectRoot} (from ctx.worktree)`);
      return;
    case "directory":
      log(`[resolve-cwd] projectRoot: ${resolved.projectRoot} (from ctx.directory)`);
      return;
    case "auto-detect":
      log(`[resolve-cwd] projectRoot: ${resolved.projectRoot} (auto-detect via ${resolved.marker})`);
      return;
    case "fallback": {
      log(
        `[resolve-cwd] WARNING: no project marker found above ${process.cwd()} ` +
        `(depth 10). Falling back to process.cwd().`,
      );
      if (resolved.siblings && resolved.siblings.length > 0) {
        log(
          `[resolve-cwd] HINT: detected sibling projects: ${resolved.siblings.join(", ")}. ` +
          `If this is a multi-project workspace, create .harness/project.json with explicit projectRoot.`,
        );
      } else {
        log(
          `[resolve-cwd] HINT: cd into project root, or create .harness/project.json ` +
          `with explicit projectRoot.`,
        );
      }
      return;
    }
  }
}

/**
 * Escaneia subdiretórios imediatos de `cwd` procurando projetos irmãos
 * (subdirs que contêm .git/ ou package.json). Usado para enriquecer o
 * warning de fallback com dicas úteis em workspaces multi-projeto.
 *
 * @param cwd Diretório a escanear (1 nível)
 * @returns Array de nomes de subdiretórios que parecem projetos
 */
export function findSiblingProjects(cwd: string): string[] {
  try {
    const entries = fs.readdirSync(cwd, { withFileTypes: true });
    const siblings: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue; // ignora .git, .vscode, etc.
      try {
        const sub = path.join(cwd, entry.name);
        if (
          fs.existsSync(path.join(sub, ".git")) ||
          fs.existsSync(path.join(sub, "package.json"))
        ) {
          siblings.push(entry.name);
        }
      } catch {
        // subdiretório inacessível — ignora
      }
    }
    return siblings;
  } catch {
    return [];
  }
}

/**
 * Versão que retorna também a fonte (worktree, directory, auto-detect, fallback).
 * Útil para /harness-where.
 *
 * v6.7.0: implementação canônica com cache em memória. Resolve o spam de
 * 6+ mensagens por sessão quando múltiplos plugins chamam o helper
 * independentemente.
 */
export interface ResolvedCwd {
  projectRoot: string;
  source: "worktree" | "directory" | "auto-detect" | "fallback" | "project.json";
  marker?: string;
  /** Subdiretórios irmãos que parecem projetos (.git/, package.json). */
  siblings?: string[];
}

export function resolveProjectCwdWithSource(
  ctx: any,
  options: ResolveOptions = {},
): ResolvedCwd {
  const log = options.log ?? (() => {}); // silencioso por padrão
  const verbose = options.verbose ?? false; // v6.7.0: log só na 1ª chamada por cwdHint
  const fallback = options.fallbackToProcessCwd ?? true;
  const markers = options.markers ?? PROJECT_MARKERS;
  const maxDepth = options.maxDepth ?? 10;

  const isValidPath = (p: unknown): p is string =>
    typeof p === "string" && p.length >= 3 && p !== "/" && p.startsWith("/");

  const project = ctx?.project || ctx;
  const worktree = project?.worktree;
  const directory = project?.directory;

  // 0. project.json tem prioridade absoluta
  const cwdHint = isValidPath(worktree)
    ? worktree
    : isValidPath(directory)
      ? directory
      : process.cwd();
  const projJson = path.join(cwdHint, ".harness", "project.json");
  if (fs.existsSync(projJson)) {
    try {
      const data = JSON.parse(fs.readFileSync(projJson, "utf8"));
      if (data?.projectRoot && isValidPath(data.projectRoot)) {
        const result: ResolvedCwd = { projectRoot: data.projectRoot, source: "project.json" };
        if (verbose) log(`[resolve-cwd] projectRoot: ${data.projectRoot} (from .harness/project.json)`);
        setCached(cwdHint, result);
        return result;
      }
    } catch {}
  }

  if (isValidPath(worktree)) {
    const result: ResolvedCwd = { projectRoot: worktree, source: "worktree" };
    setCached(cwdHint, result);
    return result;
  }
  if (isValidPath(directory)) {
    const result: ResolvedCwd = { projectRoot: directory, source: "directory" };
    setCached(cwdHint, result);
    return result;
  }

  let cur = process.cwd();
  let depth = 0;
  while (depth < maxDepth) {
    for (const marker of markers) {
      if (fs.existsSync(path.join(cur, marker))) {
        const result: ResolvedCwd = { projectRoot: cur, source: "auto-detect", marker };
        setCached(cwdHint, result);
        return result;
      }
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
    depth++;
  }

  if (fallback) {
    // Detecta irmãos (subdirs com .git/ ou package.json) — útil pra workspaces
    // multi-projeto onde o pai não tem marcador mas os filhos têm.
    const siblings = findSiblingProjects(process.cwd());
    const result: ResolvedCwd = {
      projectRoot: process.cwd(),
      source: "fallback",
      siblings,
    };
    setCached(cwdHint, result);
    return result;
  }

  throw new Error(`[resolve-cwd] No project root detected from ${process.cwd()}`);
}

/**
 * Recupera do cache (v6.7.0+). Retorna undefined se não houver cache válido.
 * A chave é o cwdHint, que é estável para a sessão.
 */
export function getCachedResolution(cwdHint: string): ResolvedCwd | undefined {
  return cwdResolutionCache.get(cwdHint);
}

/**
 * Grava no cache com bound simples (FIFO eviction quando lotar).
 */
function setCached(cwdHint: string, result: ResolvedCwd): void {
  if (cwdResolutionCache.size >= CWD_CACHE_MAX) {
    // Remove a entrada mais antiga (FIFO)
    const firstKey = cwdResolutionCache.keys().next().value;
    if (firstKey !== undefined) cwdResolutionCache.delete(firstKey);
  }
  cwdResolutionCache.set(cwdHint, result);
}

/**
 * Invalida o cache (útil em testes ou quando o projeto é movido de path).
 */
export function clearResolutionCache(): void {
  cwdResolutionCache.clear();
}
