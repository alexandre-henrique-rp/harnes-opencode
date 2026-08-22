---
id: "silent-failure-prevention"
title: "Prevenção de Falhas Silenciosas e Tratamento de Erros"
category: "convention"
priority: "critical"
status: "approved"
scope: "global"
summary: "Regras invioláveis contra erros silenciosos, exceções suprimidas, fallbacks indevidos para mocks e falta de contexto em exceções."
updatedAt: "2026-08-17T00:00:00Z"
---
# Prevenção de Falhas Silenciosas (Silent Failure Prevention)

Este guia estabelece o padrão inviolável de **Tolerância Zero a Erros Silenciosos e Tratamento de Erros Inadequado** para todos os agentes do Harness v6 (especialmente `backend`, `frontend` e auditado pelo `code-reviewer`).

---

## 🚫 Regras Invioláveis

### 1. Proibição Absoluta de Bloco `catch` Vazio ou Passivo
- ❌ **Proibido:** `catch (e) {}` ou `catch (err) { /* ignore */ }`
- ❌ **Proibido:** `catch (e) { console.log(e); }` sem propagar ou tratar com resposta HTTP/domínio adequada.
- ✅ **Obrigatório:** Todo `catch` deve registrar o erro com severidade apropriada, incluir contexto relevante (ID de operação, parâmetros) e propagar o erro ou retornar uma resposta tratada de erro estruturada.

### 2. Proibição de Fallbacks Silenciosos para Mocks em Produção
- ❌ **Proibido:** Fazer fallback automático para dados fictícios/mocks quando uma API externa ou banco falha em ambiente de produção.
- ✅ **Obrigatório:** Fallbacks só são permitidos se explicitamente exigidos pela especificação (`SPEC.md`) e devem sempre emitir aviso claro nos logs e na resposta.

### 3. Uso Consciente de Optional Chaining (`?.`) e Null Coalescing (`??`)
- ❌ **Proibido:** Usar `obj?.prop?.method()` para contornar retornos de erro de APIs ou banco, mascarando exceções reais.
- ✅ **Obrigatório:** Valide a existência dos objetos e trate ausências com exceções de domínio ou validações de esquema (ex: Zod, Yup, Joi).

### 4. Mensagens e Status de Erro Claros e Ação Direta
- ❌ **Proibido:** Retornar status HTTP 200 OK com corpo `{ success: false, error: "Error" }`.
- ❌ **Proibido:** Retornar status HTTP 500 para erros de validação do usuário (deve ser 422 ou 400).
- ✅ **Obrigatório:** Retornar códigos de status HTTP semânticos (400, 401, 403, 404, 422, 500) com mensagens explicativas e campos afetados.

---

## 📊 Critérios de Auditoria do `code-reviewer`

Durante a revisão de código, o `code-reviewer` deve penalizar rigorosamente:
- ❌ **-25 pontos (Falha Crítica):** Presença de bloco `catch` vazio ou que silencie erro fatal.
- ❌ **-20 pontos:** Fallback silencioso para dados *mockados* fora do ambiente de teste.
- ❌ **-15 pontos:** Captura genérica de erros (`catch (e: any)`) que mascare exceções imprevistas.
- ❌ **-10 pontos:** Log de erro sem informações de contexto para depuração.
