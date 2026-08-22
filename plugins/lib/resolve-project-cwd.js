// plugins/lib/resolve-project-cwd.js
//
// Shim de compatibilidade: arquivos .ts (tools/, plugins/) importam este
// modulo com extensao `.js` literal. Sem este shim, Node dispara
// ERR_MODULE_NOT_FOUND porque o arquivo fonte real e `.ts` e o strip-types
// nao reescreve paths de import.
//
// O shim faz dynamic import do `.ts` subjacente e re-exporta as funcoes
// publicas. Funciona com `node --experimental-strip-types` (Node 22+) e
// com `tsc --noEmit` (TypeScript resolve o `.ts` atraves do mesmo source file
// quando referenciado por dynamic import).
//
// API publica espelhada de resolve-project-cwd.ts:
//   - resolveProjectCwd (default)
//   - resolveProjectCwdWithSource
//   - findSiblingProjects
//   - getCachedResolution
//   - clearResolutionCache
//
// CAVEAT: Top-level await requer ESM (type=module no package.json — OK no harness).

const _mod = await import("./resolve-project-cwd.ts");

export const resolveProjectCwd = _mod.resolveProjectCwd;
export const resolveProjectCwdWithSource = _mod.resolveProjectCwdWithSource;
export const findSiblingProjects = _mod.findSiblingProjects;
export const getCachedResolution = _mod.getCachedResolution;
export const clearResolutionCache = _mod.clearResolutionCache;