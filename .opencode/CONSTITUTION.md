# Constituição do Projeto — opencode-harness

> Este documento define os princípios imutáveis, a stack tecnológica e as diretrizes de engenharia do projeto. Todos os agentes em `.opencode/agents/` devem respeitar esta constituição antes de planejar ou escrever código.

## 1. Stack Tecnológica Detectada
- **Linguagem / Runtime:** TypeScript (Node.js)
- **Framework Principal:** Node.js Standard / Library
- **Gerenciador de Pacotes:** npm
- **Comando de Testes:** `npm test`
- **possui Interface Visual (UI):** Não (API / CLI / Backend puro)

## 2. Princípios Inegociáveis de Engenharia
1. **Spec-Anchored Development:** Nenhuma funcionalidade complexa (T2/T3) é implementada sem uma especificação correspondente em `.opencode/specs/<feature>/SPEC.md` contendo Critérios de Aceite (`AC-XX`) e Regras de Negócio (`BR-XX`).
2. **Integridade de Documentação e Comentários:** Nunca remova comentários explicativos ou docstrings do código existente durante edições ou refatorações.
3. **Testes Focados por Sprint:** Os testes são criados e executados por Sprint pelo `qa-tester` para validar se as regras de negócio estão funcionando, evitando testes desnecessários. Execute **apenas os testes relacionados à Sprint entregue** — nunca rode toda a suíte de testes do projeto a não ser que seja explicitamente solicitado pelo usuário.
4. **Simplicidade (YAGNI & KISS):** Evite abstrações prematuras. Funções devem ser coesas e arquivos fáceis de manter.
5. **Segurança e Privacidade (LGPD):** Nunca exponha segredos no código ou dados pessoais identificáveis (PII) em logs sem mascaramento. Valide todas as entradas externas.
6. **Excelência em Web, SEO e Acessibilidade:** Em páginas web, utilize HTML5 semântico, hierarquia correta de títulos (`h1`–`h3`), atributos ARIA, meta tags de SEO e otimização de performance (Core Web Vitals).

## 3. Fronteiras de Escrita (Path Boundaries)
- **Especificações e Tarefas:** `.opencode/specs/**`
- **Backend / Core:** `src/**`, `server/**`, `api/**`, `lib/**`
- **Frontend / UI:** `src/components/**`, `src/pages/**`, `src/app/**`, `public/**`
- **Testes Automatizados:** `tests/**`, `test/**`, `**/*.test.*`, `**/*.spec.*`
