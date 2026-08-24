/**
 * review-packager.ts — Harness v6 tool
 *
 * Gera um pacote de revisão de diff limpo contendo a lista de commits,
 * estatísticas e o diff com 10 linhas de contexto entre um commit BASE e HEAD.
 *
 * Migração A4 (v6.5.0+): substituído execSync por runGit (safe-exec) — args
 * sempre como array, sem interpretacao de shell. commit refs do usuário
 * agora sao passados como arg, nao concatenados em string.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { resolveProjectCwd } from "../plugins/lib/resolve-project-cwd.js";
import { runGit } from "./lib/safe-exec.ts";

export default tool({
  description: "Gera um pacote com diff detalhado e histórico de commits entre BASE e HEAD, gravando-o em um arquivo temporário.",
  args: {
    baseCommit: tool.schema.string().describe("Commit, branch ou tag de base (ex: main, git rev-parse HEAD antes da tarefa)"),
    headCommit: tool.schema.string().describe("Commit, branch ou tag de destino (ex: HEAD)"),
    outFile: tool.schema.string().describe("Caminho opcional do arquivo de saída. Se omitido, salva sob .harness/tmp/")
  },
  async execute({ baseCommit, headCommit = "HEAD", outFile }, context) {
    const cwd = resolveProjectCwd(context, { log: console.error });
    const harnessTmpDir = path.resolve(cwd, ".harness", "tmp");

    // Validações básicas de commit no Git
    const baseCheck = runGit(["rev-parse", "--verify", "--quiet", baseCommit], { cwd, silentStderr: true });
    if (!baseCheck.ok) {
      return { success: false, error: `Commit BASE inválido ou não encontrado: ${baseCommit}` };
    }

    const headCheck = runGit(["rev-parse", "--verify", "--quiet", headCommit], { cwd, silentStderr: true });
    if (!headCheck.ok) {
      return { success: false, error: `Commit HEAD inválido ou não encontrado: ${headCommit}` };
    }

    // Resolve o hash curto
    const baseShortRes = runGit(["rev-parse", "--short", baseCommit], { cwd });
    const headShortRes = runGit(["rev-parse", "--short", headCommit], { cwd });
    if (!baseShortRes.ok || !headShortRes.ok) {
      return { success: false, error: "Falha ao resolver hash curto" };
    }
    const baseShort = baseShortRes.stdout.trim();
    const headShort = headShortRes.stdout.trim();

    if (!fs.existsSync(harnessTmpDir)) {
      fs.mkdirSync(harnessTmpDir, { recursive: true });
    }

    const outputFilePath = outFile
      ? path.resolve(cwd, outFile)
      : path.join(harnessTmpDir, `review-${baseShort}..${headShort}.diff`);

    try {
      // rangeRef = "baseCommit..headCommit" — passamos como arg único do git
      // (git interpreta isso corretamente; sem shell interpolation)
      const rangeRef = `${baseCommit}..${headCommit}`;

      const commitLogRes = runGit(["log", "--oneline", rangeRef], { cwd });
      const diffStatRes = runGit(["diff", "--stat", rangeRef], { cwd });
      const fullDiffRes = runGit(["diff", "-U10", rangeRef], { cwd });
      const commitCountRes = runGit(["rev-list", "--count", rangeRef], { cwd });

      if (!commitLogRes.ok || !diffStatRes.ok || !fullDiffRes.ok || !commitCountRes.ok) {
        return {
          success: false,
          error: `git falhou: ${commitLogRes.stderr || diffStatRes.stderr || fullDiffRes.stderr || commitCountRes.stderr}`,
        };
      }

      const packageContent = [
        `# Review Package: ${baseShort}..${headShort}`,
        "",
        "## Commits",
        commitLogRes.stdout,
        "",
        "## Files Changed",
        diffStatRes.stdout,
        "",
        "## Detailed Diff (-U10)",
        "```diff",
        fullDiffRes.stdout,
        "```"
      ].join("\n");

      fs.writeFileSync(outputFilePath, packageContent);

      return {
        success: true,
        diffPath: outputFilePath,
        commitCount: parseInt(commitCountRes.stdout.trim(), 10),
        sizeBytes: fs.statSync(outputFilePath).size,
        message: `Pacote de revisão gerado com sucesso em: ${outputFilePath}`
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erro ao executar comandos Git ou gravar pacote de diff: ${err?.message || err}`
      };
    }
  }
});
