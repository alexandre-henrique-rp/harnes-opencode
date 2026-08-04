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

export default tool({
  name: "harness-allowlist",
  description:
    "Gerencia o allowlist merged (project + global). Acoes: list (mostra regras), add (adiciona pattern), remove (remove pattern). Use para liberar paths bloqueados pelo path-boundary.",
  args: {
    action: tool.schema
      .enum(["list", "add", "remove"])
      .describe("Acao a executar: list, add ou remove"),
    pattern: tool.schema
      .string()
      .optional()
      .describe("Pattern glob (ex: 'docs/**', 'src/legacy/**'). Obrigatorio para add/remove."),
    type: tool.schema
      .enum(["allow", "deny"])
      .optional()
      .default("allow")
      .describe("Tipo de regra: allow (default) ou deny"),
    target: tool.schema
      .enum(["project", "global"])
      .optional()
      .default("project")
      .describe("Onde adicionar/remover: project (default, .harness/harness-allowlist.json) ou global (~/.config/opencode/...)"),
  },
  async execute({ action, pattern, type = "allow", target = "project" }, context) {
    const cwd = context?.directory || process.cwd();
    const filePath = target === "project"
      ? ensureProjectAllowlist(cwd)
      : GLOBAL_ALLOWLIST;

    // action=list
    if (action === "list") {
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
        } catch (e) {
          // ignora
        }
      }
      if (globalExists) {
        try {
          const data = readJSON(GLOBAL_ALLOWLIST);
          (data.allow || []).forEach((p) => allowSet.add(`[global] ${p}`));
          (data.deny || []).forEach((p) => denySet.add(`[global] ${p}`));
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

      const list = type === "allow" ? (data.allow ||= []) : (data.deny ||= []);
      if (list.includes(pattern)) {
        return {
          success: true,
          alreadyExists: true,
          message: `Pattern "${pattern}" ja existe em ${type} (${target})`,
          file: filePath,
        };
      }

      list.push(pattern);
      writeJSON(filePath, data);
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
      if (!fs.existsSync(filePath)) {
        return { success: false, error: `Allowlist nao existe: ${filePath}` };
      }

      let data: AllowlistData;
      try {
        data = readJSON(filePath);
      } catch (e) {
        return { success: false, error: `Falha ao parsear ${filePath}: ${(e as Error).message}` };
      }

      const list = type === "allow" ? (data.allow || []) : (data.deny || []);
      const idx = list.indexOf(pattern);
      if (idx === -1) {
        return {
          success: false,
          error: `Pattern "${pattern}" nao encontrado em ${type} (${target})`,
        };
      }

      list.splice(idx, 1);
      writeJSON(filePath, data);
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