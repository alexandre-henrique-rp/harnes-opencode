// plugins/lib/quiet-warn.js
//
// Shim de compatibilidade para ./resolve-project-cwd.js — plugins importam
// este modulo com extensao `.js` literal. Sem este shim, Node dispara
// ERR_MODULE_NOT_FOUND porque o arquivo fonte real e `.ts`.
//
// Dynamic import do `.ts` subjacente + re-export unico.

const _mod = await import("./quiet-warn.ts");
export const quietWarn = _mod.quietWarn;