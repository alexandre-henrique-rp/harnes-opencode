# PRODUCT — Definição Funcional do Produto ({{PROJECT_NAME}})

## 1. Visão Geral e Personas
- **Usuário Principal:** Utiliza os fluxos centrais do sistema.
- **Administrador / Sistema:** Gerencia configurações, regras e auditoria.

## 2. Mapa de Módulos, Telas e Rotas
| Módulo / Rota | Descrição Funcional | Possui Interface (UI)? |
| :--- | :--- | :---: |
| `/api/...` | Endpoints e regras de negócio do backend | Não |
| `/...` | Páginas e componentes interativos do usuário | Sim |

## 3. Fluxos Críticos de Ponta a Ponta
1. **Fluxo Principal:** Entrada do usuário $\rightarrow$ Validação de Contrato $\rightarrow$ Processamento da Regra de Negócio (`BR-XX`) $\rightarrow$ Feedback Visual (`AC-XX`).
