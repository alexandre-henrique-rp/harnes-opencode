# LGPD para Engenheiros de Software — Training Avançado

> Baseado no **Guia Avançado de LGPD para Engenharia de Software** (ANPD/Lei 13.709/2018).
> Tempo de leitura: ~25 min. Aplicável a backend, frontend, SRE, security engineers.

---

## Por que este training existe

LGPD não é responsabilidade do DPO sozinho. É da **engenharia** — quem
desenha, codifica, deploya e opera os sistemas. A lei te dá poderes
(controlar dados) e te cobra deveres (proteger, eliminar, notificar).

**O que você vai aprender:**

1. Como modelar dados pensando em LGPD desde o design
2. Como evitar os 10 erros mais comuns de implementação
3. Como estruturar logs que servem como prova (e não como problema)
4. Como integrar LLMs sem virar passivo regulatório
5. O que fazer (e o que NÃO fazer) quando acontece um incidente

---

## 1. Mentalidade: Privacidade é Requisito Não-Funcional

Antes de escrever uma linha de código, responda:

- **Qual a base legal para coletar isso?** (consentimento, contrato, legítimo interesse, etc — art. 7º)
- **Esse dado é estritamente necessário?** (princípio da minimização)
- **Por quanto tempo vou reter?** (e como aviso o titular?)
- **Quem precisa ver isso?** (privilégio mínimo)
- **Como o titular exerce o direito de esquecer?** (art. 18, VI)
- **Se vazar amanhã, qual o dano?** (DPIA)

Se você não sabe responder 2+ dessas, **volta pro design** antes de
codar.

---

## 2. Modelagem de Dados (DB Schema)

### ❌ Anti-pattern: "schema-first, LGPD depois"

```prisma
model User {
  id            String   @id
  cpf           String   @unique     // texto plano
  rg            String?
  email         String   @unique
  phone         String
  birthDate     DateTime
  address       String   // logradouro completo
  income        Decimal
  creditScore   Int
  healthNotes   String?  // ⚠️ sensível
  biometricHash String?  // ⚠️ sensível
  // ... 30 outros campos "úteis"
}
```

Problemas:

- Nenhum campo está marcado como "sensível" (art. 11)
- Sem indicação de retenção por campo
- Sem distinção entre dado operacional e dado analítico
- Sem mascaramento por padrão

### ✅ Pattern: schema com classificação

```prisma
model User {
  // === Identificação ===
  id            String   @id
  emailHash     String   @unique  // hash com salt; email real vai em tabela separada
  
  // === Operacional ===
  createdAt     DateTime
  lastLoginAt   DateTime?
  accountState  AccountState  // ACTIVE | INACTIVE | PENDING_DELETION | DELETED
  
  // === Retenção ===
  scheduledHardDeleteAt DateTime?  // calculado no momento de soft delete
  
  // === Relacionamentos (PII em tabelas dedicadas) ===
  pii           UserPII?    // 1-1, separado pra criptografia colunar
  consents      Consent[]
  auditLogs     AuditLog[]  // relação reversa
}

model UserPII {
  userId      String  @id
  // Criptografado em repouso (AES-256-GCM, chave em KMS)
  cpfEnc      Bytes
  cpfHash     String  @unique  // hash com salt pra busca sem descriptografar
  nameEnc     Bytes
  emailEnc    Bytes
  phoneEnc    Bytes
  birthDateEnc Bytes
  addressEnc  Bytes
  healthNotesEnc Bytes?  // sensível (art. 11)
  biometricTemplateEnc Bytes?  // sensível
  
  user        User    @relation(fields: [userId], references: [id], onDelete: Cascade)
}

enum AccountState {
  ACTIVE
  INACTIVE             // sem login > 23 meses → alerta enviado
  PENDING_DELETION     // soft delete + carência
  DELETED              // hard delete executado
}
```

**Boas práticas:**

- PII in **tabela dedicada** (criptografada colunar, não a tabela principal)
- **Hash + salt** para campos indexáveis (busca sem descripto)
- **Enum explícito** de estado de conta
- **Retenção automática** via campo calculado

---

## 3. Autenticação: Parâmetros Inegociáveis

### Política de senhas (mínimo)

```typescript
// Validação
import { z } from "zod";

const PasswordSchema = z
  .string()
  .min(12, "Mínimo 12 caracteres")
  .max(128, "Máximo 128 caracteres")
  .refine((s) => /[A-Z]/.test(s), "Precisa de maiúscula")
  .refine((s) => /[a-z]/.test(s), "Precisa de minúscula")
  .refine((s) => /[0-9]/.test(s), "Precisa de número")
  .refine((s) => /[^A-Za-z0-9]/.test(s), "Precisa de símbolo")
  .refine((s) => !isCommonPassword(s), "Senha muito comum (vazou)")
  .refine((s) => !containsUserInfo(s, user), "Não use seu nome/email na senha");

// Hash (NUNCA md5/sha1/bcrypt — use argon2id)
import { argon2id } from "hash-wasm";

const hash = await argon2id({
  password: plainPassword,
  salt: randomBytes(16),
  parallelism: 4,
  iterations: 3,
  memorySize: 64 * 1024, // 64MB
  hashLength: 32,
  outputType: "encoded", // inclui salt + params
});
```

### Cookies e sessão

```typescript
// Backend
import { serialize, parse } from "cookie";

const sessionCookie = serialize("session_id", randomToken, {
  httpOnly: true,           // bloqueia acesso via JS (mitiga XSS)
  secure: true,             // só envia sob HTTPS
  sameSite: "strict",       // mitiga CSRF
  domain: "app.example.com", // escopo mínimo (sem .example.com global)
  path: "/",                // escopo mínimo necessário
  maxAge: 60 * 60 * 24 * 7, // 7 dias (e-commerce); 24h se app crítico
});

res.setHeader("Set-Cookie", sessionCookie);

// Logout destrói no servidor, não só no cliente
app.post("/logout", async (req, res) => {
  await sessionStore.revoke(req.cookies.session_id);
  res.setHeader("Set-Cookie", "session_id=; Max-Age=0");
  res.status(204).end();
});
```

### MFA em funções sensíveis

```typescript
// Toda operação que toca PII, finanças, ou admin → MFA obrigatório
app.post("/admin/users/:id/export", requireMFA, exportUserData);
app.post("/admin/payouts", requireMFA, processPayout);
app.delete("/account", requireMFA, scheduleAccountDeletion);
```

---

## 4. Banners de Consentimento (Front-End)

### O que a ANPD proíbe (resumo)

❌ Botão "Aceitar" em verde chamativo + "Rejeitar" em cinza apagado
❌ Cookie wall (bloqueia conteúdo se rejeitar)
❌ Pré-checkbox em analytics
❌ "Ao continuar navegando você aceita"
❌ Política de privacidade em inglês se app é BR

### Implementação (React)

```tsx
// Banner 1º nível
function ConsentBanner() {
  const { consent, setConsent } = useConsent();

  if (consent.hasResponded) return null;

  return (
    <div role="dialog" aria-label="Consentimento de cookies" className="consent-banner">
      <h2>Este site usa cookies</h2>
      <p>
        Usamos cookies para segurança, analytics e personalização. Você pode
        aceitar todos, rejeitar ou gerenciar. Veja nossa{" "}
        <a href="/politica-cookies">Política de Cookies</a>.
      </p>

      {/* Os 3 botões DEVEM ter idêntico destaque visual */}
      <div className="consent-actions">
        <button
          className="btn btn-neutral"
          onClick={() => setConsent({ analytics: true, marketing: true, functional: true })}
        >
          Aceitar Todos
        </button>

        <button
          className="btn btn-neutral"  // mesmo estilo!
          onClick={() => setConsent({ analytics: false, marketing: false, functional: false })}
        >
          Rejeitar Todos
        </button>

        <button
          className="btn btn-neutral"  // mesmo estilo!
          onClick={() => openPreferences()}
        >
          Gerenciar Opções
        </button>
      </div>
    </div>
  );
}

// Banner 2º nível
function ConsentPreferences() {
  const { consent, setConsent } = useConsent();

  return (
    <div role="dialog" aria-label="Preferências de cookies">
      <h2>Preferências de Cookies</h2>

      <label>
        <input type="checkbox" checked disabled />
        <strong>Essenciais</strong>
        <small>(sempre ativos, segurança)</small>
      </label>

      {/* TODOS os outros vêm desmarcados por default (privacy by default) */}
      <label>
        <input
          type="checkbox"
          checked={consent.analytics}
          onChange={(e) => setConsent({ ...consent, analytics: e.target.checked })}
        />
        <strong>Analíticos</strong>
        <small>(Google Analytics, Hotjar — métricas agregadas)</small>
      </label>

      <label>
        <input
          type="checkbox"
          checked={consent.marketing}
          onChange={(e) => setConsent({ ...consent, marketing: e.target.checked })}
        />
        <strong>Publicidade</strong>
        <small>(ads comportamentais, retargeting)</small>
      </label>

      <button onClick={save}>Salvar Preferências</button>
    </div>
  );
}
```

### Log de consentimento (LGPD art. 46)

```typescript
// Cada mudança de consentimento deve ser logada
await auditLogger.log({
  type: "consent.change",
  userId: hashUserId(user.id),
  ipHash: hashIp(req.ip),
  choices: {
    essential: true,        // sempre true
    analytics: consent.analytics,
    marketing: consent.marketing,
    functional: consent.functional,
  },
  timestamp: new Date().toISOString(),
  policyVersion: "v2.3",    // qual versão da política foi aceita
});
```

---

## 5. Anonimização vs Pseudonimização (Decisão de Arquitetura)

Use esta matriz para decidir:

| Caso de uso | Técnica | Por quê |
|---|---|---|
| Analytics agregado de comportamento | Anonimização (generalização + perturbação) | Não precisa de reidentificação |
| Logs de acesso em produção | Pseudonimização (hash com salt) | Precisa investigar incidente específico |
| Dataset de pesquisa (parceria) | Anonimização (k-anonymity ≥ 5) | Compartilhamento com terceiro |
| Ambiente de dev/test | Pseudonimização + chaves diferentes | Realismo sem expor dados reais |
| Backup criptografado | Pseudonimização (AES-256) | Precisa restaurar in disaster recovery |
| Marketing por perfil | Pseudonimização (perfil comportamental) | Permite personalização sem expor identificação |

### Implementação segura de hash

```typescript
import { createHash, randomBytes } from "node:crypto";

// ❌ ERRADO: SHA-256 sem salt
const cpfHash = createHash("sha256").update(cpf).digest("hex");
// Atacante com rainbow table quebrou em 0.5s

// ✅ CERTO: hash com salt persistido
function hashWithSalt(value: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256")
    .update(salt + value)
    .digest("hex");
  return { hash, salt };
}

// Armazena: { hash, salt } — sem salt, reverter é inviável

// 🔒 AINDA MELHOR: HMAC com segredo do servidor
function hmacHash(value: string): string {
  const secret = process.env.HASH_SECRET!; // rotacionado a cada 90 dias
  return createHash("sha256")
    .update(secret + value)
    .digest("hex");
}
// Quando o segredo rotaciona, hashes antigos viram lixo — auditoria forense limitada
```

### Anonimização em dataset de pesquisa

```python
# k-anonymity: cada registro indistinguível de pelo menos k-1 outros
import pandas as pd
from pycanon import anonymity

df = pd.read_csv("users.csv")
df_anon = df.copy()

# Generalização: idade → faixa etária
df_anon["age_range"] = pd.cut(df["age"], bins=[0, 18, 30, 45, 60, 100])

# Supressão: remover colunas com PII direta
df_anon = df_anon.drop(columns=["cpf", "name", "email", "phone"])

# Verificar k-anonymity
k = anonymity.k_anonymity(df_anon)
print(f"k-anonymity: {k}")  // se k < 5, REVISAR (k-Anônimo insuficiente)
```

---

## 6. Ciclo de Vida dos Dados (Soft → Hard Delete)

### Endpoint de "excluir minha conta"

```typescript
// 1. Soft delete (carência)
app.delete("/account", requireMFA, async (req, res) => {
  const userId = req.user.id;
  const now = new Date();
  const hardDeleteAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 dias

  await prisma.user.update({
    where: { id: userId },
    data: {
      accountState: "PENDING_DELETION",
      isDeleted: true,
      deletedAt: now,
      scheduledHardDeleteAt: hardDeleteAt,
    },
  });

  // Email de confirmação + opt-out link
  await emailService.send({
    to: await piiService.getEmail(userId),
    template: "account-deletion-scheduled",
    data: { hardDeleteAt, optOutToken: generateOptOutToken(userId) },
  });

  // Log auditoria
  await auditLogger.log({
    type: "account.deletion_requested",
    userId: hashUserId(userId),
    timestamp: now.toISOString(),
    scheduledHardDeleteAt: hardDeleteAt.toISOString(),
  });

  // Webhook para subprocessadores
  await Promise.allSettled([
    stripeService.deleteCustomer(userId),       // billing
    sendgridService.suppress(userId),           // email marketing
    intercomService.deleteUser(userId),         // suporte
    mlService.untrain(userId),                  // se houver modelo treinado
  ]);

  res.status(202).json({
    message: "Conta será excluída em 30 dias",
    cancellationDeadline: hardDeleteAt,
  });
});

// 2. Cron job — executa hard delete
// (roda diariamente, 03:00 AM)
cron.schedule("0 3 * * *", async () => {
  const due = await prisma.user.findMany({
    where: {
      accountState: "PENDING_DELETION",
      scheduledHardDeleteAt: { lte: new Date() },
    },
  });

  for (const user of due) {
    // Anonimização em vez de DELETE puro (preserva integridade referencial)
    await prisma.$transaction([
      // Anonimiza PII
      prisma.userPII.update({
        where: { userId: user.id },
        data: {
          cpfEnc: null, cpfHash: null,
          nameEnc: null,
          emailEnc: null,
          phoneEnc: null,
          // mantém a linha para FK, mas zera PII
        },
      }),
      // Marca como deletado
      prisma.user.update({
        where: { id: user.id },
        data: {
          accountState: "DELETED",
          emailHash: `deleted_${user.id}`, // imutável, só pra histórico
        },
      }),
      // Deleta sessões ativas
      prisma.session.deleteMany({ where: { userId: user.id } }),
      // Deleta tokens de API
      prisma.apiToken.deleteMany({ where: { userId: user.id } }),
    ]);

    await auditLogger.log({
      type: "account.hard_deleted",
      userId: hashUserId(user.id),
      timestamp: new Date().toISOString(),
    });
  }
});
```

### Untrain expression (modelos de ML)

```python
# Se o sistema usa dados de interação pra treinar modelos
class MLModelService:
    def untrain(self, user_id: str):
        """
        Chamado quando titular exerce direito de exclusão.
        Implementa 'untrain expression' (LGPD art. 18, VI + 20).
        """
        # 1. Remove do dataset de treino
        self.training_dataset = self.training_dataset[
            self.training_dataset.user_id != user_id
        ]

        # 2. Marca como excluído no feature store
        self.feature_store.exclude(user_id)

        # 3. Para modelos que armazenam embeddings:
        if hasattr(self.model, "user_embeddings"):
            if user_id in self.model.user_embeddings:
                del self.model.user_embeddings[user_id]
            # Persiste
            self.model.save()

        # 4. Adiciona à lista de "direitos exercidos" (auditoria)
        self.audit_log.append({
            "event": "untrain",
            "user_id": hash(user_id),  // hash pra audit sem expor
            "timestamp": datetime.now().isoformat(),
            "model_version": self.model.version,
        })

        # 5. Se a exclusão é crítica, força re-treino (caro mas correto)
        if self.is_critical_user(user_id):
            self.queue_retrain(reason=f"user_exclusion:{hash(user_id)}")
```

---

## 7. Logs de Auditoria (Imutáveis)

### Estrutura mínima do evento

```typescript
interface AuditEvent {
  timestamp: string;       // ISO 8601 UTC
  eventType: string;       // "user.access", "user.modify", etc
  actor: {
    userId: string;        // hash com salt
    role: string;
    ipHash: string;        // hash do IP (LGPD: não loga IP puro)
    sessionId: string;
  };
  subject: {
    userId?: string;       // titular afetado
    resource: string;      // "user:abc", "report:xyz"
  };
  action: string;          // "read", "create", "update", "delete"
  outcome: "success" | "failure" | "denied";
  reason?: string;         // por que foi feito
  prevHash: string;        // hash chain
  hash: string;            // hash do próprio evento
}
```

### Heurística de integridade (hash chain)

```typescript
import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";

class AuditLogger {
  private prevHash: string = "genesis";
  private secret: string = process.env.AUDIT_SECRET!;

  async log(event: Omit<AuditEvent, "hash" | "prevHash">): Promise<void> {
    const payload = JSON.stringify(event);
    const hash = createHash("sha256")
      .update(this.prevHash + payload + this.secret)
      .digest("hex");

    const finalEvent: AuditEvent = { ...event, prevHash: this.prevHash, hash };

    // Append-only, write-once
    await appendFile(".harness/audit.log", JSON.stringify(finalEvent) + "\n", { flag: "a" });

    this.prevHash = hash;
  }

  /** Verifica integridade da cadeia inteira */
  async verifyChain(): Promise<{ valid: boolean; brokenAt?: number }> {
    const lines = (await readFile(".harness/audit.log", "utf-8")).split("\n").filter(Boolean);
    let prev = "genesis";
    for (let i = 0; i < lines.length; i++) {
      const event = JSON.parse(lines[i]);
      const expected = createHash("sha256")
        .update(prev + JSON.stringify(event) + this.secret)
        .digest("hex");
      if (event.hash !== expected) {
        return { valid: false, brokenAt: i };
      }
      prev = event.hash;
    }
    return { valid: true };
  }
}
```

### Configuração de infraestrutura (NTP + UTC)

```bash
# /etc/chrony/chrony.conf (Linux)
server a.ntp.br iburst
server b.ntp.br iburst
server time.cloudflare.com iburst

# Servidor
timedatectl set-timezone UTC
```

```typescript
// Código
process.env.TZ = "UTC";
// Todas as datas em UTC; conversão pra timezone do usuário só na camada de apresentação
```

### Storage WORM

```bash
# AWS S3 Object Lock (Compliance mode)
aws s3api put-object-lock-configuration \
  --bucket audit-logs-prod \
  --object-lock-configuration '{
    "ObjectLockEnabled": "Enabled",
    "Rule": {
      "DefaultRetention": {
        "Mode": "COMPLIANCE",
        "Years": 5
      }
    }
  }'
```

---

## 8. Shadow AI: Integrando LLM Sem Virar Caso de Polícia

O harness USA LLM. Isso te torna um **caso de Shadow AI por padrão** se
você não tratar.

### As 4 perguntas antes de cada chamada LLM

1. **O prompt pode conter PII?** → Se sim, sanitize primeiro
2. **O LLM é soberano (VPC BR) ou global?** → Se global, anonimize ou
   use modelo self-hosted
3. **O LLM armazena o prompt pra retreino?** → Se sim, desabilite
   (Anthropic e OpenAI têm opt-out)
4. **O LLM toma decisão que afeta titular?** → Se sim, documente
   critério (LGPD art. 20)

### Implementação do pipeline de sanitização

Use `tools/lgpd-sanitizer.ts` deste pacote:

```typescript
import { createReversibleSession } from "./tools/lgpd-sanitizer";

const session = createReversibleSession({
  detection: "balanced",
  replacement: "placeholder",
});

// Antes de enviar pro LLM
const sanitized = session.sanitize(userPrompt);
const result = await llm.complete({
  model: "claude-sonnet-4-5",
  prompt: sanitized.sanitized,  // ← não tem PII
  // ... outros params
});

// Depois de receber, reverter placeholders
const finalResponse = session.reverse(result.text);
return finalResponse;  // ← tem PII restaurado pro user
```

**Garantia:** o LLM nunca vê PII real. A resposta pro usuário tem PII
restaurado.

### Self-hosted como alternativa

```yaml
# Modelo self-hosted em VPC nacional
infra:
  vpc: vpc-prod-br (privada, sem internet pública)
  gpu: 1x A100 80GB
  modelo: Llama 3.1 70B Instruct (ou Mixtral 8x22B)
  serving: vLLM ou TGI
  retention: 0 (modelo não retém prompts)
  telemetria: desabilitada
  log: storage nacional, retenção 30 dias
```

---

## 9. Checklist Pré-Merge (Cole no PR Template)

```markdown
## LGPD Self-Audit (pre-merge)

### Dados
- [ ] Base legal identificada pra cada coleta nova
- [ ] Dados são estritamente necessários (minimização)
- [ ] PII em tabela dedicada com criptografia
- [ ] Anonimização em ambiente de dev/test

### Autenticação
- [ ] Política de senhas robusta (argon2id, 12+ chars)
- [ ] Cookies Secure + HttpOnly + SameSite
- [ ] MFA em funções sensíveis

### Logs
- [ ] Eventos críticos logados com hash chain
- [ ] Sem PII in log (mask aplicado)
- [ ] Storage WORM configurado

### Delete
- [ ] Soft delete + carência implementada
- [ ] Hard delete via cron job
- [ ] Webhook pra subprocessadores
- [ ] Untrain expression se envolve ML

### UI de consentimento (se aplicável)
- [ ] 3 botões equivalentes (sem dark patterns)
- [ ] Preferências granulares desmarcadas por default
- [ ] CMP integrada
- [ ] Log de consentimento com policy version

### Shadow AI
- [ ] Nenhum LLM sem aprovação
- [ ] Sanitização de prompts
- [ ] Telemetria de LLM desabilitada
- [ ] Decisões automatizadas documentadas
```

---

## 10. Quando o Pior Acontece: Plano de Resposta a Incidente

LGPD art. 48: notificar ANPD em **2 dias úteis**. Não em 30. Não em
"quando tivermos certeza". Em 2 dias.

### Cronograma de resposta (D-day = detecção)

| Tempo | Ação | Responsável |
|---|---|---|
| **D + 0h** | Detectar e triar (SOC, alerta, reporte) | Security on-call |
| **D + 2h** | Conter (isolar sistema afetado, revogar credenciais) | SRE + Security |
| **D + 6h** | Investigar escopo (quem foi afetado, que dados vazaram) | Security + Eng |
| **D + 12h** | Decidir comunicação interna vs externa | CISO + DPO + Legal |
| **D + 24h** | Notificar stakeholders internos (board, conselho) | CISO |
| **D + 48h (2 dias úteis)** | Notificar ANPD (se risco significativo) | DPO + Legal |
| **D + 72h** | Notificar titulares afetados (se risco de dano) | Marketing + DPO |
| **D + 7 dias** | Post-mortem público interno | Eng + Security |
| **D + 30 dias** | Implementar correções | Eng + Security |
| **D + 90 dias** | Auditoria de follow-up | DPO + Auditoria |

### Template de notificação à ANPD

```yaml
relatorio:
  identificacao:
    nome_empresa: <razão social>
    cnpj: <CNPJ>
    encarregado_dpo: <nome + email + telefone>
  incidente:
    data_deteccao: YYYY-MM-DD HH:MM
    data_ocorrencia_estimada: YYYY-MM-DD HH:MM (ou "indeterminada")
    tipo: "acesso_nao_autorizado | perda | alteracao | vazamento | outro"
    natureza_dados: "pessoais | sensiveis | ambos"
    categoria_dados: ["nome", "cpf", "email", "saude", ...]
    numero_titulares_afetados: N
  medidas:
    adotadas: ["revogacao de credenciais", "reset de senhas", ...]
    pendentes: ["auditoria completa", "comunicacao aos titulares", ...]
  riscos:
    probabilidade_reincidencia: baixa | media | alta
    dano_potencial: "roubo de identidade | fraude financeira | discriminacao | ..."
```

---

## Resumo

LGPD na engenharia é **construir sistemas que respeitam o titular por
design**. Não é sobre bloquear feature, é sobre implementar do jeito
certo desde o dia 1.

**10 regras de ouro:**

1. Minimize. Colete só o que precisa, retenha só pelo tempo necessário.
2. Criptografe. Em trânsito (TLS 1.2+) e em repouso (AES-256).
3. Senhas fortes. Argon2id, 12+ chars, blacklist, MFA.
4. Cookies seguros. Secure, HttpOnly, SameSite, escopo mínimo.
5. Consentimento claro. 3 botões equivalentes, sem dark patterns.
6. Soft + hard delete. Com carência, com webhook pra subprocessadores.
7. Untrain expression. Modelos de ML também precisam esquecer.
8. Logs imutáveis. Hash chain, UTC, storage WORM, retenção definida.
9. LLM sanitizado. Nunca envie PII cru pra API global.
10. Notifique cedo. ANPD em 2 dias úteis. Transparência > encobrimento.

---

## Recursos adicionais

- **Lei 13.709/2018** (texto integral): https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- **Guia Orientativo ANPD para Cookies**: https://www.gov.br/anpd/
- **OWASP Top 10**: https://owasp.org/Top10/
- **NIST 800-63B** (Authentication): https://pages.nist.gov/800-63-3/sp800-63b.html
- **Argon2 spec**: https://github.com/P-H-C/phc-winner-argon2
- **Harness `tools/lgpd-sanitizer.ts`**: implementação do pipeline de sanitização
- **Harness `plugins/audit-logger.ts`**: hash chain automático
- **Harness `agents/lgpd-officer.md`**: auditor automatizado
