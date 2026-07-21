# Object Storage — Referência Arquitetural

> Documento de referência para arquitetos e engenheiros sênior.
> Complementa `training/object-storage-standard.md` (que é o "como fazer")
> e `tools/object-storage-uploader.ts` (que é o "código de referência").
> Este doc é o "**por que**" e o "**quando**".

---

## 1. Diagrama de arquitetura geral

```
                    ┌─────────────────────────────────────────┐
                    │              Cliente                    │
                    │  (Browser, Mobile, Server-to-Server)   │
                    └────────────────┬────────────────────────┘
                                     │ HTTPS (TLS 1.2+)
                                     │ POST /uploads (multipart, streamed)
                                     ▼
        ┌────────────────────────────────────────────────────────────┐
        │                     API Gateway                              │
        │  ├─ Auth (JWT, API key, OAuth)                              │
        │  ├─ Rate limit (per user, per IP)                           │
        │  ├─ WAF / DDoS protection                                   │
        │  └─ Request validation (size, kind, content-type header)   │
        └────────────────────────────┬───────────────────────────────┘
                                     │
                                     ▼
        ┌────────────────────────────────────────────────────────────┐
        │                     API Server                              │
        │                                                              │
        │  1. Parse multipart stream (NÃO bufferize)                  │
        │  2. Validar: kind, size, declared MIME                      │
        │  3. Hash streaming (SHA-256)                                │
        │  4. Upload streaming pra staging                            │
        │  5. Persistir metadados iniciais (status=PROCESSING)        │
        │  6. Enqueue job na queue                                    │
        │  7. Retornar 202 + jobId                                    │
        │                                                              │
        └────────────────────────────┬───────────────────────────────┘
                                     │
                                     ▼
        ┌────────────────────────────────────────────────────────────┐
        │                   Message Queue                             │
        │  (BullMQ / RabbitMQ / SQS / Cloud Tasks / Redis Streams)  │
        │  Channel: "media.process"                                   │
        └────────────────────────────┬───────────────────────────────┘
                                     │
                                     ▼
        ┌────────────────────────────────────────────────────────────┐
        │              Worker(s) — escalável horizontalmente          │
        │                                                              │
        │  Para cada job:                                              │
        │   1. Download do staging                                    │
        │   2. Magic bytes → detected MIME                            │
        │   3. ClamAV scan (ou serviço gerenciado)                    │
        │   4. Se infectado → REJECTED + quarentena                   │
        │   5. Se MIME mismatch → REJECTED                            │
        │   6. Transcoding: lg/md/sm (+ thumb pra vídeo)             │
        │   7. Upload paralelo pros buckets finais                    │
        │   8. Atualizar banco (status=READY)                         │
        │   9. Limpar staging                                         │
        │  10. Notificar cliente (webhook / SSE / fila de eventos)    │
        │                                                              │
        └────────────────────────────┬───────────────────────────────┘
                                     │
                                     ▼
        ┌────────────────────────────────────────────────────────────┐
        │              Object Storage (S3-compatible)                │
        │                                                              │
        │  ┌────────────┐  ┌────────────┐  ┌────────────┐             │
        │  │ -staging   │  │ -images    │  │ -videos    │  ...        │
        │  │ (delete    │  │ /lg/ /md/  │  │ /lg/ /md/  │             │
        │  │  após 24h) │  │  /sm/      │  │  /sm/      │             │
        │  └────────────┘  │ /thumb/    │  │  /thumb/   │             │
        │                   └────────────┘  └────────────┘             │
        │  ┌────────────┐  ┌────────────┐                              │
        │  │ -audios    │  │ -documents │                              │
        │  │ /lg/ /md/  │  │ /<uuid>.*  │  (1 versão só)             │
        │  │  /sm/      │  └────────────┘                              │
        │  └────────────┘                                              │
        │  ┌────────────┐                                              │
        │  │ -quarantine│  (delete após 30d)                          │
        │  └────────────┘                                              │
        └────────────────────────────┬───────────────────────────────┘
                                     │
                                     ▼ (signed URL, 5-15min)
        ┌────────────────────────────────────────────────────────────┐
        │                    CDN (opcional)                           │
        │  (CloudFront / Cloudflare / Fastly)                          │
        │  ├─ Cache de GET requests                                    │
        │  ├─ Cache miss → signed URL → bucket privado                │
        │  └─ HTTPS termination                                        │
        └────────────────────────────────────────────────────────────┘
```

---

## 1.1 Arquitetura Alternativa: File System Storage (Disco Local — Secundário / Sob Demanda)

> ⚠️ **Prioridade Arquitetural**: O **Object Storage (S3 / R2 / MinIO)** é a arquitetura principal e padrão do harness. O uso de **File System (Disco Local)** é uma capacidade secundária/sob demanda, recomendada apenas quando solicitada pelo usuário ou em ambientes isolados/on-premise sem S3.

### Diferenças de Arquitetura e Roteamento

```
[ Object Storage (S3) ]
Cliente ──────────────────────── Presigned URL ────────────────────────► S3 / CDN Direct

[ File System (Disco Local) ]
Cliente ──────► GET /api/v1/storage/files/:bucket/* ──────► [ Backend API ] ──────► Disco Local (${basePath})
```

1. **Paridade de Diretórios**:
   - Os arquivos são salvos sob `${basePath}` mantendo exatamente a mesma taxonomia dos buckets S3 (`staging/`, `images/{lg,md,sm}/`, `videos/{lg,md,sm,thumb}/`, `audios/{lg,md,sm}/`, `documents/`, `quarantine/`).
2. **Alternância de Antivírus**:
   - A verificação de vírus via ClamAV é configurável (`virusScan.enabled: boolean`). Caso desativada (ex: `VIRUS_SCAN_ENABLED=false`), o worker pula o scan mantendo o pipeline assíncrono.
3. **Roteamento Obrigatório pelo Backend**:
   - Para File System, **todas as requisições de leitura/download passam obrigatoriamente pela API do Backend** (`createFileSystemServeHandler`).
   - O Backend executa validação de autenticação/autorização, previne **Path Traversal** (`path.resolve`), e faz o stream direto do arquivo com os cabeçalhos apropriados.

---

## 2. Decisões de arquitetura — quando usar cada padrão

### 2.1 Streaming vs buffer em memória

| Volume | Padrão | Justificativa |
|---|---|---|
| < 5 MB | Buffer OK | Memória suficiente em qualquer servidor moderno |
| 5-100 MB | Multipart upload | Recomendado pela AWS (>100MB obrigatório, >5MB ideal) |
| 100 MB - 5 GB | Multipart + worker async | Bloquearia request síncrona |
| > 5 GB | Direct-to-S3 (signed PUT URL) | Cliente faz upload direto pro S3, sem passar pela API |

### 2.2 Síncrono vs assíncrono (decisão pelo tempo de processamento)

| Tempo estimado | Padrão | Quando |
|---|---|---|
| < 5s | Síncrono (request bloqueia) | Imagem 1MB, scan rápido |
| 5-60s | Síncrono com progress | Imagem grande, transcoding simples |
| > 60s | Assíncrono (OBRIGATÓRIO) | Vídeo, áudio longo, lote de imagens |

**Regra de ouro:** se pode dar timeout na request HTTP, é assíncrono.

### 2.3 Auto-criação de buckets vs IaC

| Cenário | Padrão |
|---|---|
| Dev local (LocalStack, MinIO Docker) | Auto-create OK (script `ensureBucketsExist`) |
| Staging (cloud) | IaC (Terraform) — provisiona junto da infra |
| Produção | **SEMPRE IaC** — Terraform/Pulumi/CDK |
| Multi-tenant SaaS | IaC com módulos parametrizados por tenant |

**Por quê:** app com permissão de criar bucket tem permissão de criar
número ilimitado de buckets = custo descontrolado + risco de typos
virarem buckets públicos.

### 2.4 URL pública vs signed URL

| Caso | Padrão |
|---|---|
| Asset público (logo do site, marketing) | URL pública via CDN (CloudFront com OAI) |
| Conteúdo do usuário (foto, vídeo) | **SEMPRE signed URL** (LGPD art. 46) |
| Documento pessoal (PDF de identidade) | Signed URL com expiração curta (5min) |
| Vídeo de curso comprado | Signed URL com expiração + DRM |

**Princípio:** se foi feito upload por um usuário, é privado por default.
Só vira público se houver decisão explícita + auditoria.

### 2.5 Single bucket vs multi-bucket

| Caso | Padrão |
|---|---|
| App pequeno, < 10k usuários | 1-2 buckets (staging + final) com prefixos |
| App médio, multi-mídia | 4-5 buckets (staging + image + video + audio + document) |
| Enterprise, multi-region | 5 buckets × N regiões + replication |
| Multi-tenant com isolamento forte | 1 bucket por tenant (custo↑, segurança↑) |

---

## 3. Decisões de provedores

### 3.1 Matriz de decisão

```
                         Custo ↓
                          │
                          │
       Self-host ◄────────┼────────► Cloud
        (MinIO)           │            │
                          │    ┌───────┼───────┐
                          │    │       │       │
                          │   AWS    Cloudflare   GCP
                          │   S3       R2       GCS
                          │
                          │
                         Controle ↑
```

| Provedor | Quando usar | Quando NÃO usar |
|---|---|---|
| **AWS S3** | Já usa AWS, precisa de integrações nativas (Lambda, Glue, Macie) | Custo de egress é matador (R$0,09/GB) |
| **Cloudflare R2** | Custo de egress importa (zero!), leitura frequente | Não usa Cloudflare, precisa de IAM complexo |
| **Google Cloud Storage** | Já usa GCP, multi-region nativa, BigQuery integration | Custo egress alto |
| **Backblaze B2** | Custo baixo, compatível S3 | Latência alta, sem CDN built-in |
| **MinIO** (self-host) | Compliance exige on-prem, dados não podem sair | Não tem time pra operar storage |
| **RustFS** | MinIO em Rust, mais rápido e memory-safe | Maduro? (verificar) |
| **Garage** | Self-host distribuído, S3-compatible | Operacional: requer cluster |
| **SeaweedFS** | Performance alta (FUSE-level), self-host | Complexidade operacional |

### 3.2 Recomendação padrão

**Produção nova:** Cloudflare R2 (egress grátis é o killer feature).

**Já tem AWS:** S3 + CloudFront.

**On-prem / regulado:** MinIO + ClamAV no mesmo cluster Kubernetes.

### 3.3 Multi-cloud / vendor lock-in

```typescript
// config/storage.ts
const PROVIDER_CONFIGS = {
  aws: { /* ... */ },
  r2: { /* ... */ },
  minio: { /* ... */ },
  rustfs: { /* ... */ },
  garage: { /* ... */ },
};

// Factory baseado em env var
export function selectProvider(): keyof typeof PROVIDER_CONFIGS {
  return (process.env.STORAGE_PROVIDER as any) ?? "aws";
}
```

**Migração de dados:** use **rclone** (sync entre S3-compatible).

---

## 4. Performance & Custos

### 4.1 Custo comparativo (1 TB storage, 10 TB egress/mês)

| Provedor | Storage/mês | Egress/mês | Total |
|---|---|---|---|
| AWS S3 STANDARD | \$23 | \$900 | **\$923** |
| AWS S3 + Intelligent Tiering | ~\$15-23 | \$900 | \$915-923 |
| Cloudflare R2 | \$15 | **\$0** | **\$15** |
| Google Cloud Storage | \$20 | \$1.200 | \$1.220 |
| Backblaze B2 | \$5 | \$100 | \$105 |
| MinIO (self-host, S3-like infra) | ~\$30 (infra) | \$0 (interno) | \$30 + ops |

**Insight:** egress domina o custo. R2 ganha quando há muita leitura.
S3 ganha quando há muita escrita e pouco egress (ex: backups).

### 4.2 Storage class — quando usar cada

| Storage class | $/GB/mês | Min storage | Retrieval | Quando |
|---|---|---|---|---|
| STANDARD | \$0.023 | — | ms | Acesso frequente |
| STANDARD_IA | \$0.0125 | 30 dias | ms | Acesso 1-2x/mês |
| ONEZONE_IA | \$0.01 | 30 dias | ms | Não-crítico, 1 zona |
| GLACIER_IR | \$0.004 | 90 dias | min | Backup raro |
| GLACIER | \$0.0036 | 90 dias | horas | Compliance 7+ anos |
| DEEP_ARCHIVE | \$0.00099 | 180 dias | 12h | Retenção > 7 anos |

**Estratégia padrão:**

```
Original (lg)  → STANDARD por 30d → STANDARD_IA → GLACIER_IR (após 1 ano)
md              → STANDARD_IA direto (sempre menos acessado)
sm              → STANDARD_IA direto
thumb           → STANDARD_IA (raramente acessado)
```

Implementar via **S3 Lifecycle Policy** ou equivalente:

```json
{
  "Rules": [
    {
      "ID": "move-lg-to-ia",
      "Status": "Enabled",
      "Filter": { "Prefix": "*/lg" },
      "Transitions": [
        { "Days": 30, "StorageClass": "STANDARD_IA" },
        { "Days": 365, "StorageClass": "GLACIER_IR" }
      ]
    },
    {
      "ID": "auto-cleanup-staging",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "Expiration": { "Days": 1 }
    },
    {
      "ID": "auto-cleanup-quarantine",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "Expiration": { "Days": 30 }
    }
  ]
}
```

---

## 5. Segurança

### 5.1 Camadas de defesa

```
        1. Auth + rate limit (API gateway)
        2. Validação de input + magic bytes
        3. Vírus scan
        4. Bucket privado (block public access)
        5. Signed URLs (5-15min)
        6. HTTPS obrigatório
        7. Audit log
        8. Lifecycle automático
        9. Versioning habilitado (recovery de delete acidental)
       10. Encryption at rest (SSE-S3 ou SSE-KMS)
       11. Encryption in transit (TLS 1.2+)
```

### 5.2 Configuração obrigatória do bucket

```json
{
  "BlockPublicAcls": true,
  "IgnorePublicAcls": true,
  "BlockPublicPolicy": true,
  "RestrictPublicBuckets": true,
  "Versioning": "Enabled",
  "ObjectLock": {
    "Enabled": true,
    "Mode": "COMPLIANCE"
  },
  "ServerSideEncryption": {
    "Rule": {
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"  // ou "aws:kms" pra compliance
      }
    }
  },
  "LifecycleConfiguration": { /* ver §4.2 */ }
}
```

### 5.3 IAM mínimo (princípio de menor privilégio)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": [
        "arn:aws:s3:::${PROJECT}-staging/*",
        "arn:aws:s3:::${PROJECT}-staging",
        "arn:aws:s3:::${PROJECT}-images/${userId}/*",
        "arn:aws:s3:::${PROJECT}-videos/${userId}/*"
      ]
    },
    {
      "Effect": "Deny",
      "Action": ["s3:DeleteBucket", "s3:PutBucketPolicy"],
      "Resource": "arn:aws:s3:::*"
    }
  ]
}
```

**API server:** só PutObject (staging) + GetObject.
**Worker:** GetObject (staging) + PutObject (finais) + DeleteObject (staging após sucesso).
**Cliente:** NUNCA credencial direta. Sempre signed URL.

---

## 6. LGPD — correlações com object storage

### 6.1 Onde mora PII no storage

| Tipo de mídia | Contém PII? | Como tratar |
|---|---|---|
| Foto de perfil | SIM | Signed URL, retenção explícita |
| Documento (PDF identidade) | SIM (CRÍTICO) | Bucket dedicado com lifecycle curta |
| Vídeo pessoal | SIM | Signed URL, retenção curta |
| Áudio mensagem | SIM | Signed URL, retenção curta |
| Marketing banner | NÃO | Pode ser público (com auditoria) |
| Logotipo | NÃO | Pode ser público |

### 6.2 Retenção por tipo

```typescript
// Implementação alinhada com LGPD (consistente com o training lgpd-engineering-advanced)
const RETENTION = {
  image: 24,    // meses (2 anos)
  video: 12,    // meses (1 ano)
  audio: 6,     // meses
  document: 60, // meses (5 anos — compliance fiscal)
};

// Auto-delete via lifecycle + cron job que atualiza retention_until
```

### 6.3 Exercício do direito de exclusão (LGPD art. 18, VI)

```typescript
// DELETE /api/v1/uploads/:id (chamado pelo titular)
async function deleteUpload(uploadId: string, userId: string) {
  const upload = await db.uploads.findById(uploadId);
  if (!upload || upload.userId !== userId) throw new ForbiddenError();

  // 1. Soft delete
  await db.uploads.update(uploadId, { deletedAt: new Date() });

  // 2. Mover pra quarentena (30d) — janela de arrependimento
  await moveToQuarantine(upload.bucket, upload.storageKeyPrefix, "user_deletion");

  // 3. Após 30d, hard delete (cron job)
  // (implementado via lifecycle policy que expira objetos em /quarantine/user-deletion/*)

  // 4. Se é documento com PII: notificar subprocessadores
  // (Sendgrid, Stripe, etc — ver training lgpd-engineering-advanced)
  await notifySubprocessors(upload);

  // 5. Audit log (LGPD art. 46)
  await auditLog.record({
    event: "upload.deleted",
    actor: { userId, role: "user" },
    subject: { uploadId },
    action: "delete",
  });
}
```

---

## 7. Observabilidade

### 7.1 Métricas essenciais (Prometheus)

```typescript
// Métricas exportadas pelo API + worker
export const METRICS = {
  upload_requests_total: counter({
    name: "uploads_requests_total",
    help: "Total upload requests",
    labelNames: ["kind", "outcome"],  // outcome: success, rejected_virus, rejected_mime, error
  }),

  upload_processing_duration_seconds: histogram({
    name: "uploads_processing_duration_seconds",
    help: "Time from upload request to READY status",
    labelNames: ["kind"],
    buckets: [1, 5, 10, 30, 60, 300, 600],
  }),

  upload_bytes_total: counter({
    name: "uploads_bytes_total",
    help: "Total bytes uploaded",
    labelNames: ["kind"],
  }),

  upload_storage_bytes: gauge({
    name: "uploads_storage_bytes",
    help: "Current storage usage in bytes",
    labelNames: ["bucket", "kind"],
  }),

  upload_queue_depth: gauge({
    name: "uploads_queue_depth",
    help: "Number of jobs waiting in queue",
  }),

  clamav_signature_age_seconds: gauge({
    name: "clamav_signature_age_seconds",
    help: "Age of ClamAV signature database",
  }),

  s3_5xx_errors_total: counter({
    name: "s3_5xx_errors_total",
    help: "Number of 5xx errors from S3-compatible storage",
    labelNames: ["operation"],
  }),
};
```

### 7.2 Dashboards recomendados (Grafana)

1. **Operacional:** upload rate, queue depth, worker count, processing time
2. **Segurança:** rejected by reason (virus, mime), ClamAV signature age
3. **Custo:** bytes por bucket/kind, projeção de custo mensal
4. **LGPD:** uploads perto de expirar, retenção violations, soft-deleted aguardando hard-delete

### 7.3 Alertas críticos

```yaml
alerts:
  - name: ClamAVSignatureStale
    condition: clamav_signature_age_seconds > 86400  # 24h
    severity: critical
    action: page on-call

  - name: HighVirusDetectionRate
    condition: |
      rate(uploads_rejected_total{reason="virus_detected"}[5m]) > 0.1
    severity: warning
    action: notify security channel

  - name: QueueBacklogGrowing
    condition: uploads_queue_depth > 100
    severity: warning
    action: scale worker (Kubernetes HPA)

  - name: StorageCostSpike
    condition: |
      increase(uploads_storage_bytes[1d]) > 100GB
    severity: warning
    action: notify finance + check lifecycle

  - name: S3ProviderDown
    condition: rate(s3_5xx_errors_total[5m]) > 0.5
    severity: critical
    action: page on-call + consider failover
```

---

## 8. Disaster Recovery

### 8.1 Cenários e respostas

| Cenário | Impacto | RTO | RPO | Mitigação |
|---|---|---|---|---|
| Bucket acidentalmente deletado | Dados perdidos (se não versionado) | 1h | 0 (com versioning) | Versioning habilitado |
| Região AWS down | API não responde | 1h | 0 (com multi-region) | Multi-region replication |
| Worker travado | Uploads não processam | 5min | 0 | Auto-restart + DLQ |
| ClamAV signature desatualizada | Falsos negativos | 1h | 0 | Cron de freshclam + alerta |
| Ataque de virus em massa | Quarentena cheia | 30min | N/A | Rate limit + análise |
| Database corrompido | Sem metadados | 2h | 1h (com backup) | Backup automático do DB |

### 8.2 Cross-region replication

```json
{
  "Rules": [
    {
      "ID": "replicate-to-backup-region",
      "Status": "Enabled",
      "Priority": 1,
      "Filter": {},
      "Status": "Enabled",
      "Destination": {
        "Bucket": "arn:aws:s3:::${PROJECT}-images-backup-us-west-2",
        "StorageClass": "STANDARD_IA"
      },
      "DeleteMarkerReplication": { "Status": "disabled" }
    }
  ]
}
```

### 8.3 Backup do banco de metadados

- **PostgreSQL:** WAL archiving + snapshot diário (pitr)
- **Backup S3 cross-region** (não confiar só no DB local)
- **Restore testado mensalmente** (cron job + smoke test)

---

## 9. Troubleshooting comum

| Sintoma | Causa provável | Fix |
|---|---|---|
| Upload retorna 413 mas arquivo é menor que o limite | Header `Content-Length` errado / multipart mal formado | Validar parsing do multipart, checar `req.file.size` real |
| ClamAV lento (>5s por arquivo) | Signature DB muito grande, I/O ruim | SSD no worker, freshclam incremental, cluster ClamAV |
| Variants não geram (status trava em TRANSCODING) | Worker crashou mid-job | DLQ + retry com backoff exponencial |
| URLs assinadas expirando rápido demais | Cliente não está usando corretamente | Retornar `expiresAt` no JSON, documentar |
| Bucket público apareceu do nada | IAM policy mal escrita ou migration bug | `BlockPublicAccess` em TODOS os buckets, audit mensal |
| Custo de egress alto inesperado | Vídeo sem CDN, ou hot-linking | CloudFront/Cloudflare na frente, hot-link protection |
| Vírus detectado em arquivo legítimo (falso positivo) | ClamAV heurística | Quarentena + revisão manual + whitelist (raro) |
| MIME mismatch em upload que parece OK | Client mandou Content-Type errado | Confiar em magic bytes (CORRETO), ajudar o client a corrigir |

---

## 10. Recursos adicionais

- [AWS S3 Best Practices](https://docs.aws.amazon.com/AmazonS3/latest/userguide/best-practices.html)
- [Cloudflare R2 docs](https://developers.cloudflare.com/r2/)
- [MinIO + ClamAV](https://min.io/docs/minio/linux/operations/concepts.html)
- [Uploadcare signed delivery](https://uploadcare.com/docs/security/secure-delivery/)
- [Google Cloud CDN signed URLs](https://docs.cloud.google.com/cdn/docs/using-signed-urls)
- [Harness `training/object-storage-standard.md`](../training/object-storage-standard.md) — como fazer
- [Harness `tools/object-storage-uploader.ts`](../tools/object-storage-uploader.ts) — código de referência
- [Harness `training/lgpd-engineering-advanced.md`](../../harness-v6.6.0-lgpd/training/lgpd-engineering-advanced.md) — correlações LGPD
- [Harness `skills/lgpd-compliance/SKILL.md`](../../harness-v6.6.0-lgpd/skills/lgpd-compliance/SKILL.md) — skill de compliance
