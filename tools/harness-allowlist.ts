/**
 * harness-allowlist.ts — Harness v6 tool
 *
 * Gerencia o merged allowlist (project + global) do path-boundary.
 * Permite listar, adicionar e remover patterns de allow/deny.
 *
 * Quando o opencode precisa acessar um path bloqueado, o agente pode usar
 * este tool para liberar o acesso (com confirmacao do usuario via question).
 *
 * Uso via opencode:
 *   1. Agente tenta escrever em docs/index.html
 *   2. path-boundary bloqueia com mensagem: "adicione 'docs/**' em .harness/harness-allowlist.json"
 *   3. Agente chama harness-allowlist com action="add", pattern="docs/**"
 *   4. Tool adiciona e responde com sucesso
 *   5. Agente retenta a escrita (sucesso)
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { resolveProjectCwd } from "../plugins/lib/resolve-project-cwd.js";
import * as os from "os";

const GLOBAL_ALLOWLIST = path.join(
  os.homedir(),
  ".config/opencode/harness-allowlist.json"
);

function projectAllowlistPath(cwd: string): string {
  return path.join(cwd, ".harness", "harness-allowlist.json");
}

interface AllowlistData {
  _about?: string;
  _docs?: string;
  allow?: string[];
  deny?: string[];
}

function readJSON(filePath: string): AllowlistData {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJSON(filePath: string, data: AllowlistData): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function ensureProjectAllowlist(cwd: string): string {
  const filePath = projectAllowlistPath(cwd);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    const defaultData: AllowlistData = {
      _about: "Allowlist a nivel de projeto. Mergeada com a global.",
      _docs: "https://github.com/alexandre-henrique-rp/harnes-opencode/blob/main/HARNESS-README.md#allowlist-a-nivel-de-projeto",
      allow: [],
      deny: [],
    };
    writeJSON(filePath, defaultData);
  }
  return filePath;
}

function eventsJsonlPath(cwd: string): string {
  return path.join(cwd, ".harness", "events.jsonl");
}

function getAutoConfirmFlag(): boolean {
  return process.env.HARNESS_ALLOWLIST_AUTO_CONFIRM === "1";
}

interface AuditEvent {
  ts: string;
  tool: "harness-allowlist";
  action: string;
  pattern: string;
  type: string;
  target: string;
  result: "requested" | "approved" | "blocked";
  reason?: string;
}

function writeAuditEvent(cwd: string, event: AuditEvent): void {
  try {
    const eventsPath = eventsJsonlPath(cwd);
    const dir = path.dirname(eventsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(eventsPath, JSON.stringify(event) + "\n");
  } catch {
    // best-effort: falha no audit nao deve bloquear a operacao
  }
}

function checkConfirmationGate(args: {
  action: string;
  pattern: string;
  type: string;
  target: string;
  cwd: string;
}): { requiresConfirmation: boolean; reason?: string } {
  const { action, pattern, type, target, cwd } = args;

  // target=global SEMPRE exige confirmacao humana (afeta todos os projetos)
  if (target === "global") {
    return {
      requiresConfirmation: true,
      reason: "target=global afeta todos os projetos — confirmacao humana obrigatoria",
    };
  }

  // Se HARNESS_ALLOWLIST_AUTO_CONFIRM=1, permite bypass (CI/script)
  if (getAutoConfirmFlag()) {
    return { requiresConfirmation: false };
  }

  // Default fail-secure: exige confirmacao
  return {
    requiresConfirmation: true,
    reason: "HARNESS_ALLOWLIST_AUTO_CONFIRM=1 para bypass (CI/scripts)",
  };
}

export default tool({
  description:
    "Gerencia o allowlist merged (project + global). Acoes: list (mostra regras), add (adiciona pattern), remove (remove pattern). Use para liberar paths bloqueados pelo path-boundary.",
  args: {
    action: tool.schema
      .enum(["list", "add", "remove"])
      .describe("Acao a executar: list, add ou remove"),
    pattern: tool.schema
      .string()
      .describe("Pattern glob (ex: 'docs/**', 'src/legacy/**'). Obrigatorio para add/remove."),
    type: tool.schema
      .enum(["allow", "deny"])
      .describe("Tipo de regra: allow (default) ou deny"),
    target: tool.schema
      .enum(["project", "global"])
      .describe("Onde adicionar/remover: project (default, .harness/harness-allowlist.json) ou global (~/.config/opencode/...)"),
  },
  async execute(rawArgs: any, rawContext: any) {
    const args = (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs : {}) as Record<string, any>;
    const action = typeof args.action === "string" ? args.action : "";
    const pattern = typeof args.pattern === "string" ? args.pattern : "";
    const type = typeof args.type === "string" ? args.type : "allow";
    const target = typeof args.target === "string" ? args.target : "project";
    const context = (rawContext && typeof rawContext === "object" ? rawContext : {}) as Record<string, any>;
    const cwd = resolveProjectCwd(context, { log: console.error });
    const filePath = target === "project"
      ? ensureProjectAllowlist(cwd)
      : GLOBAL_ALLOWLIST;

    // action=list
    if (action === "list") {
      // Auditoria: toda chamada é logada (mesmo read-only)
      writeAuditEvent(cwd, {
        ts: new Date().toISOString(),
        tool: "harness-allowlist",
        action: "list",
        pattern: "",
        type: "",
        target: "",
        result: "approved",
      });

      const projectFile = projectAllowlistPath(cwd);
      const projectExists = fs.existsSync(projectFile);
      const globalExists = fs.existsSync(GLOBAL_ALLOWLIST);

      const allowSet = new Set<string>();
      const denySet = new Set<string>();

      if (projectExists) {
        try {
          const data = readJSON(projectFile);
          (data.allow || []).forEach((p) => allowSet.add(`[project] ${p}`));
          (data.deny || []).forEach((p) => denySet.add(`[project] ${p}`));
          if (Array.isArray((data as any).rules)) {
            for (const r of (data as any).rules) {
              if (r?.pattern) {
                const t = r.type === "deny" ? "deny" : "allow";
                if (t === "deny") denySet.add(`[project] ${r.pattern}`);
                else allowSet.add(`[project] ${r.pattern}`);
              }
            }
          }
        } catch (e) {
          // ignora
        }
      }
      if (globalExists) {
        try {
          const data = readJSON(GLOBAL_ALLOWLIST);
          (data.allow || []).forEach((p) => allowSet.add(`[global] ${p}`));
          (data.deny || []).forEach((p) => denySet.add(`[global] ${p}`));
          if (Array.isArray((data as any).rules)) {
            for (const r of (data as any).rules) {
              if (r?.pattern) {
                const t = r.type === "deny" ? "deny" : "allow";
                if (t === "deny") denySet.add(`[global] ${r.pattern}`);
                else allowSet.add(`[global] ${r.pattern}`);
              }
            }
          }
        } catch (e) {
          // ignora
        }
      }

      return {
        success: true,
        project: { path: projectFile, exists: projectExists },
        global: { path: GLOBAL_ALLOWLIST, exists: globalExists },
        merged: {
          allowCount: allowSet.size,
          denyCount: denySet.size,
          allow: [...allowSet].sort(),
          deny: [...denySet].sort(),
        },
        note: "Regras de ambos os arquivos sao mergeadas. Deny de qualquer source bloqueia. Allow de qualquer source permite.",
      };
    }

    // action=add / remove requer pattern
    if (!pattern) {
      return {
        success: false,
        error: `action="${action}" requer pattern (ex: 'docs/**')`,
      };
    }

    // action=add
    if (action === "add") {
      // Registra evento de auditoria ANTES de qualquer modificacao
      writeAuditEvent(cwd, {
        ts: new Date().toISOString(),
        tool: "harness-allowlist",
        action: "add",
        pattern,
        type,
        target,
        result: "requested",
      });

      // Confirmation gate: fail-secure by default
      const gate = checkConfirmationGate({ action, pattern, type, target, cwd });
      if (gate.requiresConfirmation) {
        return {
          success: false,
          requiresConfirmation: true,
          action,
          pattern,
          type,
          target,
          hint: gate.reason,
        };
      }

      if (!fs.existsSync(filePath)) {
        if (target === "project") ensureProjectAllowlist(cwd);
        else return { success: false, error: `Allowlist global nao existe: ${GLOBAL_ALLOWLIST}` };
      }

      let data: AllowlistData;
      try {
        data = readJSON(filePath);
      } catch (e) {
        return { success: false, error: `Falha ao parsear ${filePath}: ${(e as Error).message}` };
      }

      let existsInRules = false;
      if (Array.isArray((data as any).rules)) {
        const rules: any[] = (data as any).rules;
        existsInRules = rules.some((r) => r && r.pattern === pattern && (r.type || "allow") === type);
        if (!existsInRules) {
          rules.push({ pattern, type, target: target || "project" });
        }
      }

      const list = type === "allow" ? (data.allow ||= []) : (data.deny ||= []);
      const existsInList = list.includes(pattern);
      if (!existsInList) {
        list.push(pattern);
      }

      if (existsInList && (!Array.isArray((data as any).rules) || existsInRules)) {
        return {
          success: true,
          alreadyExists: true,
          message: `Pattern "${pattern}" ja existe em ${type} (${target})`,
          file: filePath,
        };
      }

      writeJSON(filePath, data);

      // Registra aprovacao no audit trail
      writeAuditEvent(cwd, {
        ts: new Date().toISOString(),
        tool: "harness-allowlist",
        action: "add",
        pattern,
        type,
        target,
        result: "approved",
      });

      return {
        success: true,
        added: pattern,
        type,
        target,
        file: filePath,
        message: `Pattern "${pattern}" adicionado em ${type} (${target}). Reinicie o opencode para o plugin path-boundary recarregar.`,
      };
    }

    // action=remove
    if (action === "remove") {
      // Registra evento de auditoria ANTES de qualquer modificacao
      writeAuditEvent(cwd, {
        ts: new Date().toISOString(),
        tool: "harness-allowlist",
        action: "remove",
        pattern,
        type,
        target,
        result: "requested",
      });

      // Confirmation gate: fail-secure by default
      const gate = checkConfirmationGate({ action, pattern, type, target, cwd });
      if (gate.requiresConfirmation) {
        return {
          success: false,
          requiresConfirmation: true,
          action,
          pattern,
          type,
          target,
          hint: gate.reason,
        };
      }

      if (!fs.existsSync(filePath)) {
        return { success: false, error: `Allowlist nao existe: ${filePath}` };
      }

      let data: AllowlistData;
      try {
        data = readJSON(filePath);
      } catch (e) {
        return { success: false, error: `Falha ao parsear ${filePath}: ${(e as Error).message}` };
      }

      let foundInRules = false;
      if (Array.isArray((data as any).rules)) {
        const rules: any[] = (data as any).rules;
        const idx = rules.findIndex((r) => r && r.pattern === pattern && (r.type || "allow") === type);
        if (idx !== -1) {
          rules.splice(idx, 1);
          foundInRules = true;
        }
      }

      const list = type === "allow" ? (data.allow || []) : (data.deny || []);
      const idx = list.indexOf(pattern);
      let foundInList = false;
      if (idx !== -1) {
        list.splice(idx, 1);
        foundInList = true;
      }

      if (!foundInList && !foundInRules) {
        return {
          success: false,
          error: `Pattern "${pattern}" nao encontrado em ${type} (${target})`,
        };
      }

      writeJSON(filePath, data);

      // Registra aprovacao no audit trail
      writeAuditEvent(cwd, {
        ts: new Date().toISOString(),
        tool: "harness-allowlist",
        action: "remove",
        pattern,
        type,
        target,
        result: "approved",
      });

      return {
        success: true,
        removed: pattern,
        type,
        target,
        file: filePath,
        message: `Pattern "${pattern}" removido de ${type} (${target}). Reinicie o opencode para o plugin path-boundary recarregar.`,
      };
    }

    return { success: false, error: `Acao desconhecida: ${action}` };
  },
});