import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import fastContextTool, { buildFastContextIndex } from "../tools/fast-context.ts";

test("Suíte de Testes do FastContext (Simbolismo & Grafo de Dependências)", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(tmpdir(), "fast-context-test-"));
  
  // Criar estrutura de teste fictícia
  const srcDir = path.join(tempDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });

  const userServicePath = path.join(srcDir, "userService.ts");
  const userControllerPath = path.join(srcDir, "userController.ts");

  fs.writeFileSync(userServicePath, `
export interface User {
  id: string;
  name: string;
}

export async function getUser(id: string): Promise<User> {
  return { id, name: "Test User" };
}
`);

  fs.writeFileSync(userControllerPath, `
import { getUser, User } from "./userService";

export class UserController {
  async handleGetUser(id: string) {
    return await getUser(id);
  }
}
`);

  await t.test("1. buildFastContextIndex — deve indexar símbolos, funções, interfaces e exportações", () => {
    const index = buildFastContextIndex(tempDir);

    assert.strictEqual(index.totalFiles, 2);
    assert.ok(index.totalSymbols >= 3);
    assert.ok(index.symbols["getUser"]);
    assert.ok(index.symbols["User"]);
    assert.ok(index.symbols["UserController"]);

    const userServiceNode = index.files["src/userService.ts"];
    assert.ok(userServiceNode);
    assert.deepStrictEqual(userServiceNode.exports, ["User", "getUser"]);
  });

  await t.test("2. fastContextTool — action=query deve ranquear arquivos relevantes por termo", async () => {
    const result: any = await fastContextTool.execute({
      action: "query",
      query: "getUser"
    }, { directory: tempDir, worktree: tempDir } as any);

    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.action, "query");
    assert.ok(parsed.totalMatches >= 1);
    assert.ok(parsed.topResults[0].file.includes("userService.ts"));
  });

  await t.test("3. fastContextTool — action=graph deve construir a árvore de dependências e importadores", async () => {
    const result: any = await fastContextTool.execute({
      action: "graph",
      filePath: "src/userService.ts"
    }, { directory: tempDir, worktree: tempDir } as any);

    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.action, "graph");
    assert.strictEqual(parsed.targetFile, "src/userService.ts");
    assert.ok(parsed.importedBy.includes("src/userController.ts"));
  });

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
});
