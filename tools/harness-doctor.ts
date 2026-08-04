/**
 * harness-doctor.ts — Harness v6 tool
 *
 * Diagnostico consolidado do ambiente + configuracao + recomendacoes.
 * Consolida:
 *   - Status do ai-jail/bwrap (via harness-workspace.diagnoseSandbox)
 *   - Estado do allowlist merged (project + global) + audit log
 *   - Status do harness (.harness/ existe? state.json? phase atual?)
 *   - Variaveis de ambiente relevantes
 *   - Recomendacoes acionaveis baseadas nos problemas encontrados
 *
 * Saida: relatorio estruturado com score 0-100 e lista priorizada de issues.
 *
 * Uso:
 *   harness-doctor                  # resumo rapido
 *   harness-doctor report=full      # tudo
 *   harness-doctor report=summary   # so summary
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

import { diagnoseSandbox } from "./harness-workspace.ts";
import {
  loadMergedAllowlist,
  addToProjectAllowlist,
} from "../plugins/path-boundary.ts";

const PROJECT_ALLOWLIST = (cwd: string) =>
  path.join(cwd, ".harness", "harness-allowlist.json");
const GLOBAL_ALLOWLIST = path.join(
  os.homedir(),
  ".config/opencode/harness-allowlist.json"
);
const AUDIT_FILE = (cwd: string) =>
  path.join(cwd, ".harness", "audit", "auto-allow.jsonl");

interface DoctorReport {
  summary: {
    status: "ok" | "warning" | "error";
    score: number;
    issues: { priority: "high" | "medium" | "low"; message: string }[];
  };
  environment: {
    platform: NodeJS.Platform;
    node: string;
    bun: string | null;
    opencode: string | null;
    aiJail: {
      installed: boolean;
      version: string | null;
      bwrapWorks: boolean;
      userNamespacesEnabled: boolean | null;
    };
  };
  harness: {
    initialized: boolean;
    project: string | null;
    phase: string | null;
    phaseName: string | null;
    progress: { completed: number; total: number; percent: number } | null;
    hasAuditLog: boolean;
  };
  allowlist: {
    projectExists: boolean;
    projectPath: string;
    globalExists: boolean;
    globalPath: string;
    mergedCount: { allow: number; deny: number };
    autoAllowEnabled: boolean;
    autoAllowDisabledByMarker: boolean;
    autoAllowDisabledByEnv: boolean;
    cooldownMs: number;
    maxPerMin: number;
  };
  sandbox: {
    status: "available" | "unavailable" | "disabled";
    recommendation: string;
  };
  audit: {
    fileExists: boolean;
    filePath: string;
    totalEntries: number;
    lastAutoAdd: { ts: string; pattern: string } | null;
  };
  recommendations: { priority: "high" | "medium" | "low"; text: string }[];
}

function readState(cwd: string): DoctorReport["harness"] {
  const statePath = path.join(cwd, ".harness", "state.json");
  if (!fs.existsSync(statePath)) {
    return {
      initialized: false,
      project: null,
      phase: null,
      phaseName: null,
      progress: null,
      hasAuditLog: false,
    };
  }
  try {
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const machinePath = path.join(cwd, ".harness", "state-machine.json");
    let phaseName: string | null = null;
    let total = 0;
    let completed = 0;
    if (fs.existsSync(machinePath)) {
      const machine = JSON.parse(fs.readFileSync(machinePath, "utf8"));
      const phaseInfo = (machine.phases || []).find(
        (p: any) => p.id === state.currentPhase
      );
      phaseName = phaseInfo?.name || null;
      total = (machine.phases || []).length;
    }
    completed = Object.values<any>(state.phases || {}).filter(
      (p) => p?.status === "completed"
    ).length;

    return {
      initialized: true,
      project: state.project || null,
      phase: state.currentPhase || null,
      phaseName,
      progress: total > 0
        ? { completed, total, percent: Math.round((completed / total) * 100) }
        : null,
      hasAuditLog: fs.existsSync(AUDIT_FILE(cwd)),
    };
  } catch {
    return {
      initialized: false,
      project: null,
      phase: null,
      phaseName: null,
      progress: null,
      hasAuditLog: false,
    };
  }
}

function readAudit(cwd: string): DoctorReport["audit"] {
  const filePath = AUDIT_FILE(cwd);
  if (!fs.existsSync(filePath)) {
    return {
      fileExists: false,
      filePath,
      totalEntries: 0,
      lastAutoAdd: null,
    };
  }
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    const entries = lines
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const lastAutoAdd = entries
      .filter((e: any) => e.source === "auto")
      .pop();
    return {
      fileExists: true,
      filePath,
      totalEntries: entries.length,
      lastAutoAdd: lastAutoAdd
        ? { ts: lastAutoAdd.ts, pattern: lastAutoAdd.pattern }
        : null,
    };
  } catch {
    return {
      fileExists: true,
      filePath,
      totalEntries: 0,
      lastAutoAdd: null,
    };
  }
}

function tryExec(cmd: string): { ok: boolean; output: string } {
  try {
    return { ok: true, output: execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() };
  } catch {
    return { ok: false, output: "" };
  }
}

export default tool({
  name: "harness-doctor",
  description:
    "Diagnostico consolidado do ambiente, sandbox, allowlist e estado do harness. Retorna relatorio com score 0-100 e recomendacoes acionaveis.",
  args: {
    report: tool.schema
      .enum(["summary", "full"])
      .optional()
      .default("full")
      .describe("Nivel de detalhe: 'summary' (so resumo) ou 'full' (tudo)"),
  },
  async execute({ report = "full" }, context) {
    const cwd = context?.directory || process.cwd();

    // 1. Environment
    const nodeVer = process.version;
    const bunVer = tryExec("bun --version").output || null;
    const opencodePath = tryExec("command -v opencode").output || null;
    const aiJailInstalled = tryExec("command -v ai-jail").ok;
    const aiJailVersion = aiJailInstalled
      ? tryExec("ai-jail --version 2>&1 || echo 'unknown'").output
      : null;

    // 2. Sandbox
    const sandboxDiag = diagnoseSandbox();

    // 3. Allowlist (merged)
    const merged = loadMergedAllowlist(cwd);
    const projectAllowExists = fs.existsSync(PROJECT_ALLOWLIST(cwd));
    const globalAllowExists = fs.existsSync(GLOBAL_ALLOWLIST);

    const autoAllowEnabled =
      process.env.HARNESS_AUTO_ALLOW_ON_BLOCK === "1";
    const autoAllowDisabledByEnv =
      process.env.HARNESS_NO_AUTO_ALLOW === "1";
    const autoAllowDisabledByMarker = fs.existsSync(
      path.join(cwd, ".harness", ".no-auto-allow")
    );

    const cooldownMs = parseInt(
      process.env.HARNESS_AUTO_ALLOW_COOLDOWN_MS || "60000",
      10
    );
    const maxPerMin = parseInt(
      process.env.HARNESS_AUTO_ALLOW_MAX_PER_MIN || "10",
      10
    );

    // 4. Harness state
    const harness = readState(cwd);

    // 5. Audit
    const audit = readAudit(cwd);

    // 6. Issues & recommendations
    const issues: DoctorReport["summary"]["issues"] = [];
    const recommendations: DoctorReport["recommendations"] = [];

    if (!harness.initialized) {
      issues.push({
        priority: "high",
        message: "Harness nao inicializado neste projeto. Rode harness_init.",
      });
      recommendations.push({
        priority: "high",
        text: "Execute a tool 'harness-init' com project=<nome> para inicializar.",
      });
    }

    if (!aiJailInstalled) {
      recommendations.push({
        priority: "low",
        text: "ai-jail nao instalado (opcional mas recomendado para sandbox). Veja https://github.com/akitaonrails/ai-jail",
      });
    }

    if (!sandboxDiag.bwrapWorks && sandboxDiag.aiJailInstalled) {
      issues.push({
        priority: "medium",
        message: "bwrap nao funciona neste kernel (user namespaces off).",
      });
      recommendations.push({
        priority: "medium",
        text: "Para habilitar: sudo sysctl -w kernel.unprivileged_userns_clone=1",
      });
      recommendations.push({
        priority: "medium",
        text: "Ou rode opencode dentro do ai-jail: AI_JAIL_ACTIVE=1 ai-jail opencode",
      });
    }

    if (autoAllowEnabled && !autoAllowDisabledByMarker && !autoAllowDisabledByEnv) {
      if (audit.totalEntries > 50) {
        recommendations.push({
          priority: "low",
          text: `Audit log tem ${audit.totalEntries} entradas. Considere revisar e consolidar o allowlist.`,
        });
      }
    }

    if (autoAllowEnabled && autoAllowDisabledByMarker) {
      recommendations.push({
        priority: "medium",
        text: "Auto-allow globalmente ON, mas projeto tem .harness/.no-auto-allow. Mude ./install.sh --enable-auto-allow ou remova o marker.",
      });
    }

    // 7. Score
    let score = 100;
    for (const issue of issues) {
      if (issue.priority === "high") score -= 30;
      else if (issue.priority === "medium") score -= 10;
      else score -= 3;
    }
    score = Math.max(0, score);

    const status: DoctorReport["summary"]["status"] =
      score >= 80 ? "ok" : score >= 50 ? "warning" : "error";

    const fullReport: DoctorReport = {
      summary: { status, score, issues },
      environment: {
        platform: process.platform,
        node: nodeVer,
        bun: bunVer,
        opencode: opencodePath,
        aiJail: {
          installed: aiJailInstalled,
          version: aiJailVersion,
          bwrapWorks: sandboxDiag.bwrapWorks,
          userNamespacesEnabled: sandboxDiag.userNamespacesEnabled,
        },
      },
      harness,
      allowlist: {
        projectExists: projectAllowExists,
        projectPath: PROJECT_ALLOWLIST(cwd),
        globalExists: globalAllowExists,
        globalPath: GLOBAL_ALLOWLIST,
        mergedCount: {
          allow: merged.allow.length,
          deny: merged.deny.length,
        },
        autoAllowEnabled,
        autoAllowDisabledByMarker,
        autoAllowDisabledByEnv,
        cooldownMs,
        maxPerMin,
      },
      sandbox: {
        status: sandboxDiag.alreadySandboxed || sandboxDiag.bwrapWorks
          ? "available"
          : !sandboxDiag.aiJailInstalled
          ? "disabled"
          : "unavailable",
        recommendation: sandboxDiag.recommendation,
      },
      audit,
      recommendations,
    };

    if (report === "summary") {
      return {
        status: fullReport.summary.status,
        score: fullReport.summary.score,
        issues: fullReport.summary.issues,
        topRecommendations: fullReport.recommendations.slice(0, 3),
      };
    }

    return fullReport;
  },
});