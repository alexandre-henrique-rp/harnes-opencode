---
name: security-lgpd
description: Diretrizes de Segurança de Aplicações (OWASP) e Conformidade de Privacidade de Dados (LGPD/PII) para implementação e revisão de código.
---

# Skill: Segurança (OWASP) & Conformidade LGPD

Esta skill define os controles obrigatórios de segurança e proteção de dados pessoais (PII) para todos os agentes de implementação e revisão do OpenCode Harness v7.

## 1. Checklist de Segurança (OWASP Top 10)
1. **Validação e Sanitização de Entrada:**
   - Valide todos os payloads, parâmetros de rota, query strings e cabeçalhos na fronteira da aplicação.
   - Nunca concatene strings diretamente em queries SQL/NoSQL ou comandos de shell (prevenção de SQL Injection e Command Injection).
2. **Autenticação e Autorização:**
   - Verifique permissões no nível do recurso (prevenção de BOLA / IDOR — garanta que o usuário autenticado é dono do registro acessado).
   - Nunca exponha hashes de senha, chaves privadas ou tokens internos em respostas de API.
3. **Gestão de Segredos:**
   - Proibido usar credenciais, chaves de API ou JWT secrets hardcoded no código-fonte. Utilize variáveis de ambiente documentadas em `.env.example`.
4. **Prevenção de Falhas Silenciosas:**
   - Nunca utilize blocos `catch () {}` vazios. Registre erros com contexto técnico adequado e retorne mensagens seguras ao cliente (sem expor stack traces internos em produção).

## 2. Proteção de Dados Pessoais — LGPD (PII)
Quando a feature manipular dados pessoais (CPF, CNPJ, RG, e-mail, telefone, endereço, dados financeiros ou de saúde):
1. **Zero PII em Logs:** Nunca faça `console.log` ou registro em arquivos de log contendo CPF, senha, token, cartão ou e-mail em texto claro. Utilize mascaramento (ex: `***@dominio.com`, `***.456.789-**`).
2. **Minimização de Dados:** Retorne nos endpoints da API apenas os campos estritamente necessários para a tela ou consumidor (evite serializar a entidade inteira do banco sem filtro/DTO).
3. **Consentimento e Rastreabilidade:** Em operações críticas de criação, exclusão ou exportação de dados pessoais, garanta que o evento seja auditável sem vazar o dado sensível.
