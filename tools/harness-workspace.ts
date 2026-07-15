/**
 * harness-workspace.ts — Harness v6 tool
 *
 * Garante e retorna o caminho para o diretório de artefatos temporários
 * do Harness (.harness/tmp) e adiciona um .gitignore para ignorar tudo.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

export default tool({
  name: "harness-workspace",
  description: "Garante a existência do diretório temporário do Harness (.harness/tmp) com .gitignore apropriado e retorna seu caminho.",
  args: {},
  async execute({}, context) {
    const cwd = context?.directory || process.cwd();
    const harnessTmpDir = path.resolve(cwd, ".harness", "tmp");

    if (!fs.existsSync(harnessTmpDir)) {
      fs.mkdirSync(harnessTmpDir, { recursive: true });
    }

    const gitignorePath = path.join(harnessTmpDir, ".gitignore");
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, "*\n");
    }

    return {
      success: true,
      path: harnessTmpDir,
      message: `Diretório temporário garantido em: ${harnessTmpDir}`
    };
  }
});
