# AGENTS — Definições dos Agentes

## Propósito
- Reger alterações em `agents/` e manter prompts, permissões e responsabilidades coerentes com o harness.

## Dependências
- Leia `file:///home/kingdev/.config/opencode/AGENTS.md` e `file:///home/kingdev/.config/opencode/GERAIS.md` antes de mudar agentes.
- Trate frontmatter como contrato de runtime e o corpo como instrução operacional.
- Consulte `file:///home/kingdev/.config/opencode/state-machine.json` ao alterar roteamento entre fases; não edite seu schema em runtime.

## Mapa de arquivos
- `file:///home/kingdev/.config/opencode/agents/orchestrator.md`: roteamento, delegação e gates.
- `file:///home/kingdev/.config/opencode/agents/backend.md` e `file:///home/kingdev/.config/opencode/agents/frontend.md`: workers escritores por domínio.
- `file:///home/kingdev/.config/opencode/agents/tester.md`: testes e validação.
- Demais arquivos: owners de fase, revisores e oficiais de conformidade.

## Restrições
- Não habilite `*-tdd` nem `qa-e2e` para frontend.
- Não retire ownership de paths de um worker para eliminar conflitos; resolva no roteamento do orchestrator.
- Após mudar agentes, valide os prompts e reinicie o OpenCode para recarregar a configuração.
