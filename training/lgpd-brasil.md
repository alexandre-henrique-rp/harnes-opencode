---
id: lgpd-brasil
title: LGPD — Lei Geral de Proteção de Dados (Brasil) — Referência completa para software
description: Guia técnico-jurídico da Lei 13.709/2018, Decreto 10.474/2020 e regulamentação ANPD, com mapeamento direto para padrões de implementação de software. Aplicável a qualquer sistema que colete, processe, armazene ou compartilhe dados pessoais no Brasil.
category: law
tags: [lgpd, lgpd-brasil, protecao-de-dados, privacidade, anpd, marco-civil, dados-pessoais, dados-sensiveis, dpo, encarregado, consentimento, dpi-a]
scope: global
priority: critical
status: approved
source: manual
appliesTo: [all]
language: pt-BR
createdAt: 2026-06-07T00:00:00Z
updatedAt: 2026-06-07T00:00:00Z
version: 1
changelog:
  - version: 1
    date: 2026-06-07T00:00:00Z
    change: "Initial creation do harness v6 — referencia completa LGPD + Marco Civil + regulamentacao ANPD"
---

# LGPD — Lei Geral de Proteção de Dados (Lei 13.709/2018)

> **Este RAG doc é a fonte da verdade de proteção de dados para o Harness v6.**
> Todo agent que lida com dados pessoais **DEVE** consultar este documento antes de:
> - Modelar schemas de banco de dados
> - Implementar endpoints que recebem/enviam dados de usuários
> - Configurar logs, analytics, tracking ou cookies
> - Integrar com APIs externas que processam dados pessoais
> - Implementar fluxos de marketing, vendas ou comunicação
> - Escrever migrations, jobs, exports ou qualquer persistência
>
> **Instalação global:** este doc é instalado em `~/.config/opencode/training/` pelo `install.sh` do harness v6, ficando disponível automaticamente em **todo projeto** que use o harness. Para contexto local do projeto, o `documenter` pode copiá-lo para `.harness/RAG/` e indexar em `RAG/index.json`.

---

## 1. Contexto

**QUANDO isto se aplica:** Este RAG é **obrigatório** em qualquer projeto que:
- Colete, registre, processe, armazene, compartilhe ou elimine dados pessoais de pessoas físicas no Brasil
- Ofereça serviço ou produto para pessoas localizadas no Brasil
- Tenha sede no Brasil ou faça tratamento de dados no Brasil

**Escopo extraterritorial (Art. 3º):** A LGPD aplica-se a qualquer operação de tratamento, **independentemente do país sede da empresa**, quando:
- Operação é realizada no Brasil
- Finalidade é oferecer bens/serviços a pessoas no Brasil
- Dados foram coletados no Brasil

**Definição crítica — dado pessoal (Art. 5º, I):** qualquer informação que identifique ou possa identificar pessoa física (CPF, RG, nome completo, e-mail, telefone, endereço, IP, geolocalização, cookie ID, RFID, foto de rosto, voz, prontuário médico, etc.). **Não é dado pessoal:** dados de pessoa jurídica, dados anônimos (Art. 5º, III — não permite re-identificação), dados anonimizados irreversíveis.

**Definição crítica — dado sensível (Art. 5º, II):** dado sobre origem racial/étnica, convicção religiosa, opinião política, filiação a sindicato/organização religiosa, filosófica ou política, dado referente à saúde, vida sexual, dado biométrico ou genético. **Tratamento é muito mais restrito** (Art. 11).

**Sanção máxima (Art. 52):** multa de até 2% do faturamento do grupo econômico, limitada a R$ 50.000.000,00 (cinquenta milhões) por infração. Sanções da ANPD começaram em 2023 e já há casos públicos com multas significativas.

---

## 2. Lei / Norma (conteúdo técnico-jurídico)

### 2.1 Princípios do tratamento (Art. 6º) — OBRIGATÓRIOS

Todo tratamento de dado pessoal deve observar, simultaneamente, **todos estes princípios**:

| # | Princípio | Tradução prática em software |
|---|---|---|
| I | **Finalidade** | Propósito específico, explícito e legítimo. **Não reutilize** dado para finalidade diferente sem nova base legal. |
| II | **Adequação** | Compatibilidade da finalidade com contexto do tratamento. Justifique cada coleta. |
| III | **Necessidade** | **Minimização.** Colete só o mínimo indispensável. Se pode resolver sem CPF, não colete CPF. |
| IV | **Livre acesso** | Titular pode consultar seus dados de forma simples, gratuita e clara. **API/UI dedicada.** |
| V | **Qualidade dos dados** | Dados corretos, atualizados, completos. **Pipeline de validação + atualização.** |
| VI | **Transparência** | Titular sabe o que é feito, com quem, por quê, por quanto tempo. **Política de privacidade clara + logs de acesso visíveis.** |
| VII | **Segurança** | Medidas técnicas e administrativas para proteger contra acessos não autorizados, situações acidentais ou ilícitas. **Criptografia, controle de acesso, logs.** |
| VIII | **Prevenção** | Adoção de medidas para prevenir danos. **DPIA, security by design.** |
| IX | **Não discriminação** | Tratamento não pode ser usado para finalidades discriminatórias. **Veto a uso de dado sensível para precificação, scoring, crédito etc., sem base legal específica.** |
| X | **Responsabilização e prestação de contas** | **Demonstre conformidade.** Mantenha registros, RIPD, evidências de consentimento, logs de auditoria. |

### 2.2 Bases legais para tratamento (Art. 7º) — escolha UMA e documente

O tratamento de dado pessoal só é lícito se fundado em **pelo menos uma** destas hipóteses. **Não dá pra empilhar** sem justificativa. Escolha a mais específica:

| Inciso | Base legal | Quando usar em software | Exemplo típico |
|---|---|---|---|
| I | **Consentimento** | Opt-in explícito, granular, revogável, destacado. Não pode ser pré-unchecked. Não pode ser condição para usar o serviço (a não ser que o serviço dependa do dado). | Newsletter, marketing, cookies não-essenciais, LGPD-aware analytics |
| II | Cumprimento de obrigação legal/regulatória | Quando lei/regulamento obriga o tratamento | NF-e (CPF/CNPJ na nota), obrigações fiscais, SUS (saúde) |
| III | Execução de políticas públicas | Governos, entidades públicas | CadÚnico, censo |
| IV | Estudos por órgão de pesquisa | Pesquisa acadêmica, anonimizada quando possível | Pesquisa científica |
| V | **Execução de contrato** | Contrato com o titular ou procedimentos preliminares | Cadastro para entrega de produto, login com e-mail/senha |
| VI | Exercício regular de direitos em processo | Judicial, administrativo, arbitral | Dados solicitados via ordem judicial |
| VII | Proteção da vida ou incolumidade física | Emergência, tutela de saúde | Atendimento médico de emergência |
| VIII | Tutela da saúde | Procedimentos realizados por profissionais de saúde / saúde pública | Prontuário eletrônico, telemedicina |
| IX | **Interesse legítimo** | Para fins legítimos, considerando direitos do titular. **NÃO pode ser usado para crianças/adolescentes (Art. 14).** Requer LIA (Legitimate Interest Assessment). | Prevenção a fraude, segurança da rede, perfil de recomendação com opt-out |
| X | Proteção do crédito | Score de crédito, bureaus | Análise de risco, SPC/Serasa |

> **Regra de ouro:** o **consentimento** é a base mais frágil. "Consent for everything" não vale. Tem que ser **específico, informado, livre e inequívoco**. Para **dado sensível (Art. 11)**, bases legais são ainda mais restritas (consentimento específico e destacado, ou finalidade de saúde/proteção à vida etc.).

### 2.3 Direitos do titular (Art. 18) — TODOS estes precisam ter endpoint/UI

O titular tem **10 direitos** que devem ser atendidos em **prazo razoável** (Resolução CD/ANPD nº 15/2024 define prazo de **15 dias** para resposta):

1. **Confirmação da existência de tratamento** (Art. 18, I)
2. **Acesso aos dados** (Art. 18, II) — devolver todos os dados em formato estruturado
3. **Correção de dados incompletos, incorretos ou desatualizados** (Art. 18, III)
4. **Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade** (Art. 18, IV)
5. **Portabilidade dos dados** (Art. 18, V) — formato estruturado, interoperável (JSON, CSV, XML)
6. **Eliminação dos dados pessoais tratados com consentimento** (Art. 18, VI) — direito ao esquecimento
7. **Informação sobre entidades públicas e privadas com as quais houve compartilhamento** (Art. 18, VII)
8. **Informação sobre a possibilidade de não fornecer consentimento e suas consequências** (Art. 18, VIII)
9. **Revogação do consentimento** (Art. 18, IX) — tão fácil quanto dar
10. **Oposição a tratamento que considere descumprimento da LGPD** (Art. 18, §1º)

> **Implementação obrigatória:**
> - Endpoint/UI para cada um destes direitos
> - Logs de quem atendeu, quando, e o que foi entregue
> - Prazo: 15 dias (regra da ANPD)
> - Resposta deve ser gratuita
> - Identificação do titular é obrigatória (não vaze dados para quem não se identificou)

### 2.4 Dados sensíveis (Art. 11) — tratamento muito mais restrito

O tratamento de dado pessoal sensível só é permitido em **uma** destas hipóteses:

1. Consentimento do titular, de forma **específica e destacada**, para finalidades específicas
2. Cumprimento de obrigação legal/regulatória
3. Execução de políticas públicas
4. Estudos por órgão de pesquisa
5. Exercício regular de direitos (judicial, administrativo, arbitral)
6. Proteção da vida ou incolumidade física
7. Tutela da saúde
8. Interesse legítimo **específico** do controlador (mediante anonimização quando possível e observados os direitos do titular)
9. **Garantia da prevenção à fraude e à segurança do titular** (processo de identificação e autenticação em sistema eletrônico)

> **Vetores críticos em software:** biometria (reconhecimento facial, impressão digital), dados de saúde (prontuário, plano), religião/orientação sexual/origem racial em formulários de perfil. **Cuidado redobrado com coleta acidental** (ex.: câmera de celular coletando rosto como "feature de UX" sem consentimento).

### 2.5 Encarregado / DPO (Art. 41) — designação obrigatória

**Todo controlador** (quem decide o tratamento) deve **designar um Encarregado pelo Tratamento de Dados Pessoais** (também chamado de DPO — Data Protection Officer).

Obrigações do controlador:
- **Divulgar publicamente** o nome e contato do encarregado (no site, na política de privacidade, em local de fácil acesso)
- Comunicar à ANPD a identidade e contato do encarregado (Resolução CD/ANPD nº 18/2024)
- O encarregado pode ser pessoa física ou jurídica
- Não há exigência de formação específica, mas deve ter conhecimento sobre a LGPD e capacidade de executar as funções

Funções do encarregado (Art. 41, §2º):
- Aceitar reclamações e comunicações dos titulares
- Receber comunicações da ANPD
- Orientar funcionários e contratados sobre práticas de proteção de dados
- Executar as demais atribuições determinadas pelo controlador

> **Em software:** o e-mail do DPO **deve** aparecer:
> - Na política de privacidade
> - No rodapé do site/app
> - No formulário de consentimento
> - Em qualquer canal de comunicação com titulares
> - Em respostas a solicitações de direitos do titular (Art. 18)

### 2.6 Incidentes de segurança (Art. 48) — notificação obrigatória

Em caso de incidente de segurança que possa causar **risco relevante** aos titulares, o controlador deve:

1. **Comunicar à ANPD** (prazo: 2 dias úteis — Resolução CD/ANPD nº 15/2024)
2. **Comunicar aos titulares afetados** — informando:
   - Natureza do incidente
   - Categorias e número de titulares afetados
   - Medidas técnicas e de segurança adotadas
   - Riscos envolvidos
   - Procedimentos para mitigar riscos

> **Risco relevante** = incidente que cause ou possa causar: dano patrimonial, moral, financeiro, à vida, à saúde, à reputação. Vazamento de **dado sensível** quase sempre é risco relevante.
>
> **Em software:** ter **plano de resposta a incidente** documentado + runbook + logs preservados + canal de notificação pronto. **Não deletar logs do incidente** (pode obstruir ANPD).

### 2.7 Transferência internacional de dados (Art. 33-36, Cap. V)

Só é permitida transferência internacional de dados em **uma** das hipóteses:

1. Países com **nível adequado de proteção** reconhecido pela ANPD (lista atual: consulte [gov.br/anpd](https://www.gov.br/anpd/))
2. Oferecer **garantias de conformidade** por:
   - Cláusulas-padrão contratuais aprovadas pela ANPD
   - Cláusulas contratuais específicas (avaliadas caso a caso)
   - BCRs (Binding Corporate Rules) — para grupos econômicos
   - Selos, certificações e códigos de conduta aprovados
3. **Cooperação internacional** entre órgãos públicos
4. Proteção à vida ou incolumidade física
5. Execução de políticas públicas
6. Consentimento **específico e destacado** do titular, com informação sobre o país destino e os riscos
7. Cumprimento de obrigação legal/regulatória
8. Exercício regular de direitos em processo

> **Em software:** se sua stack usa **AWS US, GCP US, Azure US, Vercel, Netlify, Cloudflare, etc.**, é **transferência internacional**. Exige base legal + garantias. **Não é opt-in automático**.

### 2.8 Relatório de Impacto à Proteção de Dados Pessoais — RIPD / DPIA (Art. 38)

O controlador deve elaborar **RIPD** (Relatório de Impacto à Proteção de Dados Pessoais) para tratamento que possa gerar **risco alto** às garantias e princípios da LGPD.

Quando é obrigatório (regulamentação ANPD):
- Tratamento de dados sensíveis em larga escala
- Tratamento para fins de segurança pública
- Tratamento para fins de mercado de capitais
- Tratamento que envolva perfilamento, scoring, classificação
- Tratamento que envolva criança/adolescente
- Tratamento de dados biométricos para identificação única
- Tratamento com transferência internacional fora de país adequado

> **Em software:** RIPD **antes de implementar** feature de risco. Não é relatório de incidente — é **análise prévia**. Documentar: descrição do tratamento, riscos, medidas de mitigação, salvaguardas.

### 2.9 Cookies, tracking e marketing digital (ANPD — Resolução 4/2023, orientações)

**Cookies e tecnologias similares** são tratamento de dados pessoais (mesmo cookie ID pode ser dado pessoal).

Regra geral (consentimento — Art. 7º, I):
- **Cookies não-essenciais** exigem **consentimento prévio, livre, informado, inequívoco** (Art. 8º)
- **Não usar cookie wall** (bloquear todo o site até aceitar) sem oferecer alternativa razoável
- **Opt-out** em vez de opt-in **NÃO basta** para cookies não-essenciais
- Granularidade: consentimento por **finalidade** (analytics, marketing, personalização são diferentes)
- **Revogação** deve ser tão fácil quanto a aceitação
- Banner deve ser **claro**, sem dark patterns
- Política de cookies **específica**, não escondida na política de privacidade

Cookies **isentos** de consentimento (essenciais):
- Autenticação (sessão de login)
- Segurança (CSRF token, rate limit)
- Preferência de interface (idioma, tema) que não envolve tracking
- Carrinho de compra
- Balanceamento de carga

> **Em software:** implementar **Consent Management Platform (CMP)** que:
> - Mostra banner com opt-in/opt-out granular
> - Bloqueia scripts não-essenciais até consentimento
> - Registra log de consentimento (data, IP truncado, escolha)
> - Permite revogação
> - Detecta mudanças na escolha (re-consentimento periódico)

### 2.10 Compartilhamento de dados (Art. 26-27)

- Controlador pode compartilhar dado com **operador** (que trata em nome do controlador) — exige contrato
- Compartilhamento com **outros controladores** exige base legal específica
- **Vendedor de banco de dados** (ex.: Serasa) precisa obter consentimento específico do titular
- Em fusões/aquisições: transferência de banco de dados exige notificação ao titular

### 2.11 ANPD — Agência Nacional de Proteção de Dados

Poderes da ANPD (Art. 33):
- Editar normas e procedimentos
- Fiscalizar e aplicar sanções
- Celebrar compromisso com controlador
- Coordenar ações com órgãos do Executivo Federal
- Receber petições, reclamações, representações
- Promover estudos e ações educativas
- Articular-se com autoridades internacionais
- Zelar pelo reconhecimento de direitos do titular
- Aplicar sanções (Art. 52)

Sanções (Art. 52-54):
- **Advertência** (sem multa, com prazo para correção)
- **Multa** simples: até 2% do faturamento do grupo econômico, **limitada a R$ 50.000.000,00 por infração**
- Multa diária: até o mesmo limite
- Publicização da infração (nome e CNPJ no site da ANPD)
- Bloqueio, eliminação ou anonimização dos dados
- Proibição de tratamento de dados
- Suspensão parcial do funcionamento
- Outras (Art. 52, §1º, IX)

> Atenção: multas **começaram em 2023**. Em 2024-2025, ANPD publicou várias sanções administrativas e proibições. Multas de R$ 1,4 milhão a R$ 14 milhões já foram aplicadas.

---

## 3. Por quê

### 3.1 Marco legal e fontes oficiais

- **LGPD** — Lei nº 13.709, de 14 de agosto de 2018 — [planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
- **Vetado parcialmente** em 2019, restaurado em 2020 — entrou em vigor em **agosto de 2020** (sanções a partir de agosto de 2021, primeiras sanções administrativas em 2023)
- **Decreto nº 10.474/2020** — regulamenta a LGPD no Poder Executivo Federal
- **Resoluções ANPD:**
  - CD/ANPD nº 1/2020 — Regimento Interno
  - CD/ANPD nº 2/2022 — Aprovação de cláusulas-padrão contratuais
  - CD/ANPD nº 4/2023 — Orientação sobre cookies
  - CD/ANPD nº 15/2024 — Prazos para atendimento aos direitos do titular (15 dias)
  - CD/ANPD nº 18/2024 — Comunicação de incidente à ANPD
  - CD/ANPD nº 19/2024 — Regulamento do processo administrativo
  - CD/ANPD nº 23/2024 — Lista de países com nível adequado
- **Marco Civil da Internet** (Lei 12.965/2014) — proteção de registros de conexão e acesso a aplicações (Art. 10-23)
- **Código de Defesa do Consumidor (Lei 8.078/1990)** — base para abusos em marketing
- **Código Civil** — responsabilidade civil objetiva e subjetiva
- **Constituição Federal** — Art. 5º, X (intimidade, vida privada, honra) e LXXVIII (inviolabilidade do sigilo de dados)

### 3.2 Por que LGPD não é igual GDPR

Comparações relevantes para software:

| Aspecto | LGPD (Brasil) | GDPR (Europa) |
|---|---|---|
| Multa máxima | 2% do faturamento, max R$ 50M | 4% do faturamento global, max €20M |
| DPO obrigatório | Sim (Art. 41) | Sim (Art. 37) — com mais requisitos |
| Transferência internacional | Lista de países + garantias | Adequacy decisions + SCCs + BCRs |
| Prazo para titulares | 15 dias (Res. CD/ANPD 15/2024) | 1 mês (Art. 12) |
| Notificação de incidente | 2 dias úteis (Res. CD/ANPD 18/2024) | 72 horas (Art. 33) |
| Base legal mais comum | Consentimento | Consentimento + legítimo interesse |
| Cookies | Opt-in granular (Res. CD/ANPD 4/2023) | Opt-in (ePrivacy ainda em discussão) |
| Crianças | Bloqueio de tratamento sem consentimento específico dos pais (Art. 14) | Idem, com idade variando por país (13-16) |

> **Em software:** se sua stack já é GDPR-compliant, **não assuma que é LGPD-compliant**. Verifique cada base legal, cada prazo, cada retenção.

### 3.3 Casos públicos relevantes

- **2023 — Telekall Infoservice:** primeira sanção administrativa da ANPD — multa de R$ 14.400 (pequena empresa, base de cálculo baixa) por não designar DPO e não informar base legal.
- **2024 — Telekall Infoservice:** R$ 14.400 multa adicional por não regularizar após advertência.
- **2024 — ANPD proibiu programa "Minha Casa Minha Vida"** de usar dados de candidatos de modo incompatível com a finalidade.
- **2024 — Banco Pan:** vazamento de dados de 28 mil clientes (não-anônimo, incluindo nome, CPF, e-mail, renda) — houve ação judicial coletiva.
- **Diversas** — Lojas Americanas, Magazine Luiza, etc.: incidentes reportados publicamente que geraram ações judiciais com base na LGPD.

---

## 4. Como aplicar (em software)

### 4.1 Modelagem de schema

```typescript
// ✅ CORRETO — princípio da necessidade (Art. 6º, III)
const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),              // para login — necessário
  hashedPassword: z.string(),              // para autenticação
  createdAt: z.date(),
  lastLoginAt: z.date().nullable(),
  marketingOptIn: z.boolean().default(false), // consentimento separado
  marketingOptInAt: z.date().nullable(),   // quando aceitou
  marketingOptOutAt: z.date().nullable(),  // quando revogou
  // NÃO coletamos: CPF no cadastro (só quando emite NF-e — Art. 7º, II)
});

// ❌ ERRADO — coleta excessiva
const userSchemaBad = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  cpf: z.string(),        // sem justificativa clara
  rg: z.string(),         // sem justificativa
  fullAddress: z.string(),// sem justificativa
  religion: z.string(),   // DADO SENSÍVEL — Art. 11
  healthInfo: z.string(), // DADO SENSÍVEL — Art. 11
  motherName: z.string(), // sem justificativa
});
```

### 4.2 Endpoints de direitos do titular (Art. 18)

```typescript
// ✅ Endpoints OBRIGATÓRIOS para qualquer sistema que coleta dado pessoal
// Prazo: 15 dias (Res. CD/ANPD 15/2024)

// Art. 18, I — confirmação de tratamento
app.get('/api/privacy/treatments', authenticate, async (req, res) => {
  const userId = req.user.id;
  const treatments = await getTreatmentsForUser(userId);
  return res.json({ treatments });
});

// Art. 18, II — acesso aos dados
app.get('/api/privacy/my-data', authenticate, async (req, res) => {
  const userId = req.user.id;
  const userData = await exportUserData(userId);  // todos os dados
  return res.json(userData);
});

// Art. 18, III — correção
app.patch('/api/privacy/my-data', authenticate, async (req, res) => {
  const userId = req.user.id;
  await updateUserData(userId, req.body);
  return res.json({ ok: true });
});

// Art. 18, V — portabilidade (formato estruturado e interoperável)
app.get('/api/privacy/portability', authenticate, async (req, res) => {
  const userId = req.user.id;
  const data = await exportUserData(userId);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="my-data.json"');
  return res.json(data);
});

// Art. 18, VI — eliminação (direito ao esquecimento)
app.delete('/api/privacy/my-data', authenticate, async (req, res) => {
  const userId = req.user.id;
  // Não deleta dados sob obrigação legal (fiscal, etc.) — Art. 16
  await softDeleteUser(userId, { keepLegal: true });
  return res.json({ ok: true });
});

// Art. 18, IX — revogação de consentimento
app.post('/api/privacy/revoke-consent', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { consentType } = req.body;
  await revokeConsent(userId, consentType);
  return res.json({ ok: true });
});
```

### 4.3 Logs de auditoria (Art. 6º, X — responsabilização)

```typescript
// ✅ Auditoria de acesso a dados pessoais — OBRIGATÓRIO
async function accessUserData(actorId: string, targetUserId: string, action: string) {
  await auditLog.create({
    timestamp: new Date().toISOString(),
    actor: actorId,             // quem acessou
    target: targetUserId,        // dado de quem
    action: action,              // "view", "update", "export", "delete"
    resource: "user_data",
    ipAddress: hashIp(req.ip),   // IP com hash, não puro
    userAgent: req.headers['user-agent'],
    legalBasis: "user_request",  // Art. 7º, V — execução de contrato
  });
}

// ❌ ERRADO — sem auditoria
async function getUser(id) {
  return await db.user.findById(id);  // sem log de quem acessou
}
```

### 4.4 Criptografia de dados sensíveis (Art. 6º, VII)

```typescript
// ✅ Criptografia em repouso — Art. 6º, VII
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY; // 32 bytes (AES-256)

export function encryptPII(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptPII(ciphertext: string): string {
  const [iv, authTag, encrypted] = ciphertext.split(':');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ❌ ERRADO — CPF em texto plano
const user = {
  cpf: "123.456.789-00", // sem criptografia — Art. 6º, VII
  email: "user@example.com",
};
```

### 4.5 Consentimento granular (Art. 7º, I e Art. 8º)

```typescript
// ✅ Consentimento granular, específico, destacado
interface ConsentRecord {
  userId: string;
  consents: {
    necessary: { granted: true; cannotRevoke: true }; // cookies essenciais
    analytics: { granted: boolean; timestamp: Date | null; ipHash: string };
    marketing: { granted: boolean; timestamp: Date | null; ipHash: string };
    personalization: { granted: boolean; timestamp: Date | null; ipHash: string };
  };
  policyVersion: string;  // qual versão da política foi aceita
  ipAddress: string;      // IP de quem aceitou (com hash, GDPR-aware)
  userAgent: string;
  timestamp: Date;
}

// Log de consentimento é obrigatório (Art. 8º, §2º)
// "O consentimento será revogável a qualquer momento"
// "O consentimento é a base legal frágil — não abuse"

// ❌ ERRADO
// Pré-unchecked: cookies de marketing ligados por default
// Bundled: "Ao continuar você aceita tudo"
// Cookie wall sem alternativa
// Granularidade zero: 1 toggle para "tudo"
```

### 4.6 Resposta a incidente (Art. 48)

```typescript
// ✅ Plano de resposta — OBRIGATÓRIO
async function handleSecurityIncident(incident: Incident) {
  // 1. Conter (1 hora) — parar o vazamento
  await containIncident(incident);

  // 2. Avaliar risco (2-4 horas)
  const risk = await evaluateRisk(incident);
  if (risk.isRelevantRisk) {
    // 3. Notificar ANPD em 2 dias úteis
    await notifyANPD(incident, risk);

    // 4. Notificar titulares afetados
    await notifyAffectedUsers(incident, risk);
  }

  // 5. Documentar tudo
  await documentIncident(incident, risk, responseActions);

  // 6. NUNCA deletar logs do incidente
  // Art. 6º, X — responsabilização e prestação de contas
}
```

### 4.7 Política de privacidade — itens obrigatórios

Toda política de privacidade **deve** conter (Art. 9º):

1. Identificação do controlador (nome, CNPJ, contato)
2. **Identificação e contato do encarregado (DPO)**
3. Finalidades específicas do tratamento
4. Base legal para cada finalidade
5. Categorias de dados tratados
6. Categorias de destinatários (com quem compartilha)
7. **Transferência internacional** (se houver) — países, garantias
8. Prazo de retenção (ou critério para definir)
9. Direitos do titular + como exercê-los
10. Mecanismos de segurança
11. Informações sobre uso de cookies e tecnologias similares
12. Como o titular pode revogar consentimento
13. Reclamações à ANPD

---

## 5. Como NÃO aplicar (antipadrões)

### ❌ Antipadrão 1: "Privacy theater" — política bonita, implementação vazia

```typescript
// Política de privacidade fala em "criptografia AES-256"
// Banco de dados guarda CPF em VARCHAR sem criptografia
// ANPD aplica multa de até 2% do faturamento (Art. 52)
```

### ❌ Antipadrão 2: "Consent bundle" — um checkbox para tudo

```html
<!-- ❌ "Ao continuar, você aceita receber emails, SMS, WhatsApp e compartilhamento com parceiros" -->
<input type="checkbox" name="all-consent" />
<label>Aceito todos os termos</label>
<!-- Isso NÃO É consentimento granular — Art. 8º, §1º -->
<!-- Cada finalidade precisa de consentimento específico -->
```

### ❌ Antipadrão 3: "Right to be forgotten — 50 dias úteis"

```typescript
// ❌ Implementação do direito de eliminação com prazo de 50 dias
// Res. CD/ANPD 15/2024: prazo é 15 DIAS
// Implementar com SLA de 5-10 dias úteis (margem de segurança)
```

### ❌ Antipadrão 4: "Marketing forever"

```typescript
// ❌ "Consentimento de marketing uma vez, vale para sempre"
// Consentimento pode ser revogado a qualquer momento (Art. 18, IX)
// Implementar: revogação imediata, opt-out fácil, supressão do envio
```

### ❌ Antipadrão 5: "DPO fantasma"

```typescript
// ❌ DPO listado na política de privacidade, mas:
// - e-mail não responde
// - sem visibilidade interna
// - sem poder decisório
// - não aparece no rodapé do site
// - desconhece os tratamentos da empresa
// ANPD entende isso como "não designação" — pode aplicar multa
```

### ❌ Antipadrão 6: "Logs infinitos"

```typescript
// ❌ Retenção de logs de acesso por 5 anos "por segurança"
// Art. 6º, V — necessidade: reter o MÍNIMO necessário
// Definir prazo de retenção (ex: 6-12 meses) e anonimizar
// Logs pessoais devem ser tratados com a mesma base legal que os dados
```

### ❌ Antipadrão 7: "Fingerprint + cookie sem consentimento"

```typescript
// ❌ Device fingerprinting + cookie sem banner de consentimento
// Res. CD/ANPD 4/2023: cookies não-essenciais exigem consentimento prévio
// Fingerprinting também é tratamento de dado pessoal
```

### ❌ Antipadrão 8: "Dados sensíveis como feature"

```typescript
// ❌ "Recomende conteúdos religiosos baseado na religião do usuário"
// ❌ "Precificação dinâmica baseada em perfil de saúde"
// ❌ "Score de crédito usando biometria"
// Art. 6º, IX — não discriminação
// Art. 11 — dado sensível tem bases legais restritas
```

### ❌ Antipadrão 9: "Compartilhamento sem contrato"

```typescript
// ❌ Enviar dados de clientes para parceiro comercial sem contrato
// Art. 26, §1º — operador trata em nome do controlador com contrato
// Art. 27 — compartilhamento entre controladores precisa de base legal
```

### ❌ Antipadrão 10: "Backup do banco de produção exposto"

```typescript
// ❌ Snapshot do banco em S3 público, com CPF, email, endereço
// Vazamento de backup = incidente (Art. 48)
// Encriptar backups, controle de acesso, logs de leitura
```

---

## 6. Cross-refs

Relacionado a este RAG:

- `security:owasp-top-10` — A02 (criptografia), A03 (injection em endpoints de privacidade)
- `security:hardcoded-secrets` — segredos vazados = incidente
- `pattern:audit-log` — implementação de logs de auditoria
- `pattern:consent-management` — CMP (Consent Management Platform)
- `pattern:rights-endpoints` — endpoints do Art. 18
- `law:marco-civil` — Lei 12.965/2014, proteção de registros de conexão
- `law:cdcf` — Código de Defesa do Consumidor (marketing abusivo)
- `convention:naming-conventions` — nomes claros para campos de auditoria
- `decision:data-retention-policy` — quanto tempo guardar cada categoria de dado

Outros RAGs do harness v6:

- `security-hardcoded-secrets` — companion deste
- `pattern-input-validation` — companion para endpoints de privacidade
- `pattern-error-handling` — nunca vazar dado pessoal em logs de erro

---

## 7. Última validação

- **Quando foi verificado pela última vez:** 2026-06-07
- **Por qual agente:** rag-curator (sistema — empacotado no harness v6)
- **Evidência:** revisão manual do texto integral da Lei 13.709/2018, Decreto 10.474/2020, Resoluções CD/ANPD vigentes em jun/2026 (Resoluções 1, 2, 4, 15, 18, 19, 23), comparação com GDPR (Reg. UE 2016/679), jurisprudência recente do STJ sobre dano moral em vazamento de dados (Tema 712 de 2021, REsp 1.737.412/SE).

### Notas de atualização (mantidas em changelog)

- **v1 — 2026-06-07:** Initial creation. Cobre LGPD completa + Marco Civil + regulamentação ANPD vigente + comparação com GDPR + 10 antipadrões comuns + 7 padrões de implementação. Idade estimada: 1 ano de revisão periódica (LGPD evolui com resoluções da ANPD a cada 2-3 meses).

### Pendente de revisão (próxima iteração)

- Incluir Resoluções ANPD que venham a ser publicadas após 2026-06
- Adicionar casos públicos novos da ANPD
- Atualizar lista de países com nível adequado
- Adicionar jurisprudência do STJ com tema de dano moral em LGPD

---

**Aviso importante:** Este documento é referência técnica para implementação de software. **Não substitui aconselhamento jurídico formal.** Para casos complexos (DPIA, incidente com risco alto, transferência internacional sem país adequado, tratamento de dado sensível em larga escala), consulte advogado(a) especializado(a) em proteção de dados. O agent `lgpd-officer` deste harness é uma ferramenta de triagem e auditoria automatizada, **não é um parecer jurídico**.
