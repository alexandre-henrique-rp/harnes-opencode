/**
 * harness-workspace.ts — Harness v6 tool
 *
 * Garante e retorna o caminho para o diretório de artefatos temporários
 * do Harness (.harness/tmp) e adiciona um .gitignore para ignorar tudo.
 *
 * Mudança v6.5.0: removido suporte a ai-jail/bwrap sandbox (decisão de
 * projeto). Sem sandbox, esta tool se limita a garantir o tmpdir.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { resolveProjectCwd } from "../plugins/lib/resolve-project-cwd.js";

export default tool({
  description:
    "Garante a existencia do diretorio temporario do Harness (.harness/tmp) com .gitignore apropriado e retorna seu caminho.",
  args: {},
  async execute({}, context) {
    const cwd = resolveProjectCwd(context, { log: console.error });
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
      message: `Diretorio temporario garantido em: ${harnessTmpDir}`,
    };
  },
});
