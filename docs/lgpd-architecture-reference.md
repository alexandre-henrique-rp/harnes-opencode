# LGPD — Referência Arquitetural

> Documento de referência técnica para arquitetos, security engineers e DPOs.
> Complementa a skill `lgpd-compliance` e o training `lgpd-engineering-advanced`.
> Baseado no Guia Avançado de LGPD para Engenharia de Software (ANPD).

---

## 1. Visão geral da arquitetura LGPD-compliant

```
┌─────────────────────────────────────────────────────────────────────┐
│                       APLICAÇÃO (camadas)                            │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Front-end (Browser)                                         │   │
│  │  ├─ Banner de consentimento (2 níveis)                        │   │
│  │  ├─ Sem PII em localStorage/cookies (exceto session)         │   │
│  │  └─ CSP, HSTS, cookie Secure/HttpOnly/SameSite               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                │                                     │
│                                ▼ HTTPS (TLS 1.2+)                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  API Gateway / Edge                                          │   │
│  │  ├─ Rate limit, WAF, DDoS                                    │   │
│  │  ├─ Origin allowlist                                         │   │
│  │  └─ Auth + MFA enforcement                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                │                                     │
│                                ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Application Server (Backend)                                │   │
│  │  ├─ Validação de input (Zod)                                 │   │
│  │  ├─ Autorização (privilégio mínimo)                          │   │
│  │  ├─ Criptografia de campos (envelope encryption)             │   │
│  │  ├─ Log de auditoria (PII hasheado)                          │   │
│  │  └─ Tratamento de consentimento                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                │                                     │
│                                ▼                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │  PII Table      │  │  Operational DB │  │  Analytics DB   │     │
│  │  (criptografada)│  │  (sem PII)      │  │  (anonimizado)  │     │
│  │  AES-256-GCM    │  │  PostgreSQL     │  │  k-anonymity    │     │
│  │  KMS-managed key│  │                 │  │                 │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Audit Log Storage (WORM)                                    │   │
│  │  ├─ Hash chain (SHA-256)                                     │   │
│  │  ├─ UTC timestamps (NTP synced)                              │   │
│  │  ├─ Object Lock (S3) / Immutable Storage (Azure)             │   │
│  │  └─ Retenção 5+ anos                                        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  LLM Gateway (Shadow AI mitigation)                           │   │
│  │  ├─ Pipeline de sanitização (lgpd-sanitizer)                 │   │
│  │  ├─ Modelo soberano (VPC BR) OU provider com opt-out        │   │
│  │  ├─ Telemetria desabilitada                                  │   │
│  │  └─ Log de chamadas (sem conteúdo do prompt)                │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Tabelas de Decisão

### 2.1 Onde mora o dado?

| Tipo de dado | Storage | Criptografia | Retenção |
|---|---|---|---|
| Identificação direta (CPF, nome) | Tabela dedicada, separada da operacional | AES-256-GCM com chave em KMS | Até exclusão ou anonimização |
| Identificação pseudonimizada (hash com salt) | Tabela principal, indexada | Hash SHA-256 com salt único | Até exclusão |
| Email operacional | Tabela operacional, hasheado pra busca | Hash HMAC com segredo do servidor | Enquanto conta ativa |
| Email marketing | Subprocessador (Sendgrid, Mailchimp) | TLS only | Até opt-out + 30 dias |
| Logs de auditoria | Storage WORM (S3 Object Lock) | Append-only, hash chain | 5+ anos |
| Analytics agregado | Data warehouse separado | Anonimização (k-anonymity ≥ 5) | 3 anos máx |
| Modelos de ML | Storage isolado, sem PII | Treinado com dados anonimizados | Re-treino anual |
| Backups | Storage criptografado (S3 SSE-KMS) | Criptografia em repouso | 30 dias, depois expurgo |

### 2.2 Quem pode acessar?

| Role | Permissão | Justificativa |
|---|---|---|
| **Admin** | Tudo | Operação do sistema |
| **Suporte N1** | Nome, email, status da conta | Resolver dúvidas do titular |
| **Suporte N2** | + endereço, telefone (com auditoria) | Investigação ativa |
| **Suporte N3 / Security** | + CPF, dados sensíveis (com MFA + log) | Investigação crítica |
| **Marketing** | Email + tag de opt-in (NÃO nome, NÃO CPF) | Envio de comunicações |
| **Analytics** | Apenas dados agregados anonimizados | Relatórios |
| **ML/IA** | Dataset de treino anonimizado (k-anonymity) | Treino de modelos |
| **DPO** | Acesso total, leitura de logs | Resposta a titular, auditoria |
| **Auditor externo** | Acesso temporário, somente-leitura, registrado | Auditoria periódica |

### 2.3 Qual a base legal de cada tratamento?

| Tratamento | Base legal | Requisito de consentimento |
|---|---|---|
| Criação de conta | Execução de contrato (art. 7º, V) | Não (mas termo de uso claro) |
| Login | Execução de contrato | Não |
| Envio de email transacional (recibo, alerta) | Execução de contrato | Não |
| Envio de email marketing | Consentimento (art. 7º, I) | SIM — opt-in explícito |
| Analytics de uso | Legítimo interesse (art. 7º, IX) | Não, mas com opt-out |
| Compartilhamento com subprocessador BR | Execução de contrato | Não |
| Compartilhamento com subprocessador internacional | Consentimento específico | SIM — destacar destino |
| Treinamento de ML | Consentimento específico ou legítimo interesse (anonimizado) | Variável |
| Atendimento a obrigação legal (ex: NF) | Cumprimento de obrigação legal/regulatória | Não |
| Investigação de fraude | Legítimo interesse (art. 7º, IX) ou interesse público | Não, mas log rigoroso |

---

## 3. Criptografia — Quando e Como

### 3.1 Em trânsito (TLS)

| Camada | Protocolo | Configuração |
|---|---|---|
| Browser → API | TLS 1.2+ (ideal 1.3) | HSTS habilitado, cipher suites fortes |
| API → DB | TLS obrigatório | Conexão criptografada nativa do DB |
| API → Subprocessador | TLS 1.2+ mínimo | Validar certificado do destino |
| Logs → SIEM | TLS 1.2+ | Mútua autenticação (mTLS) se possível |
| Backup → Storage | TLS 1.2+ | Server-side encryption adicional |

### 3.2 Em repouso (at-rest)

| Tipo de dado | Algoritmo | Onde mora a chave |
|---|---|---|
| PII em coluna (CPF, nome) | AES-256-GCM (envelope encryption) | AWS KMS, Azure Key Vault, GCP KMS |
| Senhas | argon2id (não reversível) | N/A — hash apenas |
| Hash de busca (CPF hash, email hash) | SHA-256 com HMAC + segredo | Segredo em secret manager |
| Logs de auditoria | AES-256 no storage (S3 SSE-KMS) | KMS com rotação automática |
| Backups | AES-256 + envelope encryption | KMS dedicado para backup |
| Chaves privadas de crypto | HSM (Cloud HSM, AWS CloudHSM) | HSM físico |

### 3.3 Padrão de envelope encryption

```
Master Key (KMS)
   │
   ├── DEK (Data Encryption Key) por registro/tabela
   │     │
   │     └── Criptografa a coluna PII
   │
   └── DEK armazenada criptografada com Master Key
```

Vantagem: rotação da Master Key não exige re-criptografar tudo. DEKs
são descriptografadas sob demanda.

---

## 4. Retenção e Descarte

### 4.1 Política de retenção por tipo

| Tipo | Retenção ativa | Após exclusão | Observação |
|---|---|---|---|
| Conta de usuário | Enquanto ativa + 30 dias carência | Hard delete + anonimização | Webhooks p/ subprocessadores |
| Logs de auditoria | 5 anos | Anonimização (manter evento, zerar PII) | WORM storage |
| Logs de aplicação | 90 dias | Hard delete | Sem PII ou com PII hasheado |
| Backups | 30 dias | Hard delete | Criptografados |
| Email transacional | 2 anos | Hard delete | Pra auditoria fiscal |
| Email marketing | Até opt-out + 30 dias | Hard delete | LGPD + CAN-SPAM |
| Sessões ativas | 7 dias (rolling) | Hard delete | Session store |
| API tokens | Enquanto ativo + 30 dias após revoke | Hard delete | Log de revogação |
| Dados de analytics | 3 anos | Anonimização agregada | k-anonymity ≥ 5 |
| Modelos de ML | Re-treino anual | Re-treino exclui titulares | Untrain expression |
| Imagens de documentos (KYC) | 90 dias após aprovação | Hard delete criptografado | Setor financeiro |

### 4.2 Ciclo de dormência automatizado

```typescript
// Cron job mensal
async function processDormantAccounts() {
  const now = new Date();
  const twentyThreeMonthsAgo = new Date(now.setMonth(now.getMonth() - 23));

  // 1. Encontra contas sem login há 23 meses
  const dormant = await prisma.user.findMany({
    where: {
      lastLoginAt: { lt: twentyThreeMonthsAgo },
      accountState: "ACTIVE",
    },
  });

  // 2. Envia alerta de inatividade
  for (const user of dormant) {
    await emailService.send({
      to: await piiService.getEmail(user.id),
      template: "inactivity-warning",
      data: { reactivateUrl: generateReactivateUrl(user.id) },
    });

    await auditLogger.log({
      type: "inactivity.warning_sent",
      userId: hashUserId(user.id),
    });
  }

  // 3. Após 30 dias do alerta sem reativação, soft delete
  // (próximo cron job cuida)
}
```

---

## 5. Subprocessadores — Inventário e Contratos

### 5.1 Inventário obrigatório (manter atualizado)

```yaml
subprocessadores:
  - nome: "AWS (serviços de infraestrutura)"
    servicos: ["EC2", "RDS", "S3", "KMS"]
    regiao: "sa-east-1 (São Paulo)"
    tipo_dados: ["PII operacional", "logs de auditoria"]
    base_legal: "Execução de contrato"
    dpa_assinado: "2024-03-15"
    proxima_revisao: "2026-03-15"
    transferencia_internacional: false  # tudo em BR

  - nome: "Sendgrid (email transacional)"
    servicos: ["API de envio"]
    regiao: "global (default US)"
    tipo_dados: ["email", "nome"]
    base_legal: "Execução de contrato + consentimento (marketing)"
    dpa_assinado: "2024-05-10"
    transferencia_internacional: true
    safeguard: "Standard Contractual Clauses (SCC) + DPA específico"

  - nome: "Stripe (pagamentos)"
    servicos: ["processamento de pagamento"]
    regiao: "global"
    tipo_dados: ["dados de cartão (tokenizados)", "CPF"]
    base_legal: "Execução de contrato"
    dpa_assinado: "2024-01-20"
    transferencia_internacional: true
    safeguard: "PCI-DSS + DPA + SCC"
    observacao: "Stripe NUNCA vê cartão em claro (tokenização)"
```

### 5.2 Onboarding de novo subprocessador

Checklist:

- [ ] **DPA assinado** (Data Processing Agreement)
- [ ] **Transferência internacional** documentada (se aplicável)
  - [ ] SCC (Standard Contractual Clauses) assinadas
  - [ ] Adequação do país destino verificada
  - [ ] Política de privacidade do produto atualizada mencionando
- [ ] **Auditoria de segurança** (SOC 2, ISO 27001, ou similar)
- [ ] **Tempo de retenção** acordado (≤ nossa política)
- [ ] **Webhook de exclusão** configurado (chamaremos ao hard delete)
- [ ] **Política de incidentes** (como nos notificar, em quanto tempo)
- [ ] **Aprovação do DPO** registrada em ata
- [ ] **Política de privacidade** do produto atualizada

### 5.3 Offboarding

Quando encerrar contrato com subprocessador:

- [ ] Hard delete de todos os dados no subprocessador (solicitar evidência)
- [ ] Webhook de exclusão chamado pra todos os usuários ativos
- [ ] Revogar credenciais/API keys
- [ ] Atualizar política de privacidade
- [ ] Notificar ANPD se havia dados sigilosos
- [ ] Arquivar DPA por 5 anos (obrigação legal)

---

## 6. Resposta a Incidentes — Runbook Detalhado

### 6.1 Classificação de severidade

| Severidade | Definição | SLA de resposta | Quem aciona |
|---|---|---|---|
| **P0** | Vazamento de dados sensíveis em massa, ou exposição pública de credenciais | 30 min | CISO + DPO + CEO |
| **P1** | Vazamento de PII de <100k titulares, ou acesso não autorizado sem confirmação de exfiltração | 2h | CISO + DPO |
| **P2** | Suspeita de incidente, sem confirmação | 8h | Security on-call |
| **P3** | Bug ou configuração incorreta sem impacto a titulares | 24h | Engineering manager |

### 6.2 Procedimento (P0/P1)

```
T+0:00  Detectar (alerta SIEM, reporte, monitoring)
T+0:05  Security on-call acknowledge, page CISO
T+0:10  Bridge call (Security + SRE + DPO + CISO)
T+0:15  Containment: isolar sistema, revogar credenciais comprometidas
T+0:30  Preservar evidências (snapshots, logs, network capture)
T+1:00  Investigação inicial: escopo estimado
T+2:00  Decisão: notificar ANPD? (DPO + Legal)
T+4:00  Comunicação interna: board, conselho, customer success
T+24h   Investigação profunda: vetor, exploração, dados afetados
T+48h   Notificação ANPD (se aplicável) — LGPD art. 48
T+72h   Notificação titulares (se aplicável)
T+7d    Post-mortem público interno + plano de remediação
T+30d   Implementação de correções
T+90d   Auditoria de follow-up
```

### 6.3 Template de comunicação a titulares

```
Assunto: [Importante] Notificação de incidente de segurança

Prezado(a) [Nome],

Estamos entrando em contato para informar sobre um incidente de segurança
identificado em [data], que pode ter afetado seus dados pessoais.

O que aconteceu:
[descrição clara, sem jargão técnico]

Que informações foram potencialmente afetadas:
[listar tipos de dados, sem expor os valores]

O que estamos fazendo:
[medidas tomadas]

O que você pode fazer:
[recomendações específicas: trocar senha, monitorar extrato, etc]

Quem contatar em caso de dúvidas:
[nome do DPO + email + telefone]

Pedimos desculpas pelo ocorrido. Levamos a segurança dos seus dados
a sério e estamos comprometidos em evitar que isso se repita.

Atenciosamente,
[Assinatura do DPO ou representante legal]
```

---

## 7. Auditoria — Checklist Trimestral

### 7.1 Técnico (Engenharia)

- [ ] SAST rodando em todo PR (CodeQL, Semgrep)
- [ ] DAST rodando antes de release (OWASP ZAP)
- [ ] SCA em dependências (Snyk, npm audit)
- [ ] Secrets scan (Gitleaks, TruffleHog)
- [ ] Cobertura de testes de segurança ≥ 80%
- [ ] Pentest externo anual (ou após mudanças significativas)
- [ ] Bug bounty ativo (ou aceitação de reportes responsáveis)

### 7.2 Dados

- [ ] Todos PII em tabelas dedicadas com criptografia
- [ ] Logs de auditoria com hash chain verificado
- [ ] Storage WORM configurado e testado
- [ ] Política de retenção implementada e automatizada
- [ ] Webhooks de exclusão pra subprocessadores funcionando
- [ ] Anonimização em ambiente de dev/test verificada

### 7.3 Processos

- [ ] DPIA atualizado (anual ou após mudança significativa)
- [ ] Inventário de subprocessadores atualizado
- [ ] DPAs vigentes e revisados
- [ ] Treinamento de LGPD pra equipe (anual)
- [ ] Simulado de resposta a incidente (semestral)
- [ ] Revisão da Política de Privacidade (anual)
- [ ] Revisão dos Termos de Uso (anual)
- [ ] Relatório de Impacto à Proteção de Dados (DPIA) — quando aplicável

### 7.4 Pessoas

- [ ] DPO designado e conhecido pela equipe
- [ ] Equipe de segurança com acesso ao código (white box)
- [ ] Canais de relato de incidente sem punição
- [ ] Capacitação contínua (OWASP, LGPD updates)

---

## 8. LGPD + Harness (Aplicação Direta)

O harness v6.6.0 USA LLMs extensivamente. Isso nos torna parte do
problema de Shadow AI. Medidas implementadas:

| Componente | Mitigação |
|---|---|
| `tools/lgpd-sanitizer.ts` | Sanitiza prompts antes de enviar pro LLM |
| `plugins/audit-logger.ts` | Hash chain imutável de eventos |
| `plugins/context-compressor.ts` | Comprime outputs grandes (reduz superfície de log) |
| `system/objectivity.md` | Carregado em toda sessão; orienta contra exposição desnecessária |
| `skills/lgpd-compliance/SKILL.md` | Skill on-demand pra qualquer agente que toca PII |
| `agents/lgpd-officer.md` | Auditor automatizado no fim de cada sprint |
| `training/lgpd-engineering-advanced.md` | Onboarding de novos engenheiros |

### Configuração obrigatória para projetos que usam o harness

```jsonc
// opencode.json (trecho)
{
  "plugin": [
    "./plugins/audit-logger.ts",       // hash chain sempre
    "./plugins/lgpd-sanitizer.ts"      // sanitização sempre
  ],
  "lgpdSanitizer": {
    "detection": "balanced",
    "replacement": "placeholder",
    "types": ["cpf", "cnpj", "email", "phone_br", "credit_card", "api_key", "jwt", "private_key", "url_with_pii"],
    "onDetect": "log-warning"  // sempre alerta quando detecta
  }
}
```

### Política interna do harness

**PII nunca é hardcoded em:**

- Documentação (docs/, training/, AGENTS.md de exemplo)
- Test fixtures (use factories com dados sintéticos)
- Comentários em código
- Mensagens de commit
- Logs de erro estruturados

**PII sintético para exemplos:**

- Use `000.000.000-00` (CPF zerado) em vez de CPF real
- Use `joao@example.com` (RFC 2606 reserved) em vez de email real
- Use `+55 11 91234-5678` em vez de telefone real
- Use dados de fixture em `tests/fixtures/synthetic-users.ts`

---

## 9. Glossário

| Termo | Significado |
|---|---|
| **PII** | Personally Identifiable Information (dado pessoal) |
| **Dado sensível** | PII com proteção extra (saúde, religião, biometria, etc) |
| **Anonimização** | Remoção irreversível de possibilidade de reidentificação |
| **Pseudonimização** | Substituição reversível por identificador artificial |
| **DPO** | Data Protection Officer (Encarregado de Dados) |
| **DPIA** | Data Protection Impact Assessment (Relatório de Impacto) |
| **DPA** | Data Processing Agreement (contrato com subprocessador) |
| **SCC** | Standard Contractual Clauses (cláusulas pra transferência internacional) |
| **WORM** | Write Once Read Many (storage imutável) |
| **Hash chain** | Cadeia de hashes onde cada um depende do anterior |
| **MFA** | Multi-Factor Authentication |
| **k-anonymity** | Cada registro indistinguível de pelo menos k-1 outros |
| **SCA** | Software Composition Analysis |
| **SAST** | Static Application Security Testing |
| **DAST** | Dynamic Application Security Testing |
| **Shadow AI** | Uso de IA sem aprovação/homologação |
| **Untrain expression** | Desfazer associação de titular em modelo de ML |
| **CMP** | Consent Management Platform |
| **TCF** | Transparency & Consent Framework (padrão IAB) |

---

## 10. Referências cruzadas

| Necessita info sobre... | Veja |
|---|---|
| Como implementar sanitização de prompts | `tools/lgpd-sanitizer.ts` |
| Como configurar hash chain em logs | `plugins/audit-logger.ts` |
| Como rodar auto-auditoria | `agents/lgpd-officer.md` |
| Como treinar equipe nova | `training/lgpd-engineering-advanced.md` |
| Como aplicar LGPD em feature nova | `skills/lgpd-compliance/SKILL.md` |
| O que NÃO fazer | Seção §14 do SKILL.md (anti-patterns) |
| Onde mora o PII no schema | Seção §2 deste documento |
| Quem pode acessar o quê | Seção §2.2 deste documento |
| Como responder a incidente | Seção §6 deste documento + training §10 |
