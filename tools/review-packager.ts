/**
 * review-packager.ts — Harness v6 tool
 *
 * Gera um pacote de revisão de diff limpo contendo a lista de commits,
 * estatísticas e o diff com 10 linhas de contexto entre um commit BASE e HEAD.
 */

import { tool } from "@opencode-ai/plugin";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export default tool({
  name: "review-packager",
  description: "Gera um pacote com diff detalhado e histórico de commits entre BASE e HEAD, gravando-o em um arquivo temporário.",
  args: {
    baseCommit: tool.schema.string().describe("Commit, branch ou tag de base (ex: main, git rev-parse HEAD antes da tarefa)"),
    headCommit: tool.schema.string().default("HEAD").describe("Commit, branch ou tag de destino (ex: HEAD)"),
    outFile: tool.schema.string().optional().describe("Caminho opcional do arquivo de saída. Se omitido, salva sob .harness/tmp/")
  },
  async execute({ baseCommit, headCommit = "HEAD", outFile }, context) {
    const cwd = context?.directory || process.cwd();
    const harnessTmpDir = path.resolve(cwd, ".harness", "tmp");

    // Validações básicas de commit no Git
    try {
      execSync(`git rev-parse --verify --quiet "${baseCommit}"`, { cwd, stdio: "ignore" });
    } catch {
      return { success: false, error: `Commit BASE inválido ou não encontrado: ${baseCommit}` };
    }

    try {
      execSync(`git rev-parse --verify --quiet "${headCommit}"`, { cwd, stdio: "ignore" });
    } catch {
      return { success: false, error: `Commit HEAD inválido ou não encontrado: ${headCommit}` };
    }

    // Resolve o hash curto para criar nomes de arquivos limpos e semambíguos
    const baseShort = execSync(`git rev-parse --short "${baseCommit}"`, { cwd, encoding: "utf8" }).trim();
    const headShort = execSync(`git rev-parse --short "${headCommit}"`, { cwd, encoding: "utf8" }).trim();

    if (!fs.existsSync(harnessTmpDir)) {
      fs.mkdirSync(harnessTmpDir, { recursive: true });
    }

    const outputFilePath = outFile 
      ? path.resolve(cwd, outFile)
      : path.join(harnessTmpDir, `review-${baseShort}..${headShort}.diff`);

    try {
      const commitLog = execSync(`git log --oneline "${baseCommit}..${headCommit}"`, { cwd, encoding: "utf8" });
      const diffStat = execSync(`git diff --stat "${baseCommit}..${headCommit}"`, { cwd, encoding: "utf8" });
      const fullDiff = execSync(`git diff -U10 "${baseCommit}..${headCommit}"`, { cwd, encoding: "utf8" });
      const commitCount = execSync(`git rev-list --count "${baseCommit}..${headCommit}"`, { cwd, encoding: "utf8" }).trim();

      const packageContent = [
        `# Review Package: ${baseShort}..${headShort}`,
        "",
        "## Commits",
        commitLog,
        "",
        "## Files Changed",
        diffStat,
        "",
        "## Detailed Diff (-U10)",
        "```diff",
        fullDiff,
        "```"
      ].join("\n");

      fs.writeFileSync(outputFilePath, packageContent);

      return {
        success: true,
        diffPath: outputFilePath,
        commitCount: parseInt(commitCount, 10),
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
