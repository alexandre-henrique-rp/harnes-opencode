# Object Storage Standard — Padrão para Uploads em APIs

> Training de ~30 min. Aplicável a **toda API** desenvolvida no harness que receba arquivos.
> Compatível com: AWS S3, Cloudflare R2, Backblaze B2, Google Cloud Storage, MinIO, RustFS, Garage, SeaweedFS, qualquer S3-compatible.
>
> Inspirado em: AWS S3 Malware Scanning, Uploadcare signed delivery, Google Media CDN, Cloudflare Stream.

---

## 1. Mentalidade (defense in depth + async-first)

Três princípios inegociáveis antes de qualquer linha de código:

**① Processamento pesado é assíncrono.**

Vírus scan + transcoding de variantes + hash + persistência multi-bucket
**não cabem dentro de uma request HTTP**. Vídeo de 500 MB pode levar
minutos. Cliente desconecta, timeout, requisição duplicada.

**Padrão correto:**

```
[Cliente] → POST /upload (multipart, arquivo grande)
     │
     ▼
[API] → Salva em bucket "staging" via streaming → retorna 202 + jobId
     │
     ▼ (assíncrono, em worker/queue)
[Worker] → Download do staging → Virus scan → transcoding lg/md/sm
     → Upload nos buckets finais → Delete do staging → Marca jobId como done
     │
     ▼ (cliente faz polling ou recebe webhook)
[Cliente] → GET /upload/:jobId → status + URLs prontas
```

**② Privacidade por padrão. Signed URLs > URLs públicas.**

URL pública de bucket = LGPD art. 46 violado (controle de acesso
quebrado). Qualquer pessoa com o link acessa. Pode vazar em logs,
screenshots, e-mails.

**Padrão correto:** bucket privado + signed URLs com expiração 5-15min.
Ou CloudFront/Cloudflare com signed cookies.

**③ Magic bytes > Content-Type declarado.**

Client pode mandar `Content-Type: image/jpeg` com payload `.exe`.
MIME declarado é sugestão, não verdade. Validar com `libmagic` (file(1))
ou primeiros N bytes do arquivo.

---

## 2. Os 4 buckets padrão (separação por tipo)

```
                ┌──────────────────────────────────┐
                │  ${PROJECT}-staging             │  (lifecycle: delete após 24h)
                │  Recebe upload bruto antes de   │
                │  processar. Privado.            │
                └──────────────────────────────────┘
                              │
                              │ (worker processa)
                              ▼
        ┌────────────────────┬─────────────────────┬────────────────────┐
        │                    │                     │                    │
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  ${PROJECT}  │    │  ${PROJECT}  │    │  ${PROJECT}  │    │  ${PROJECT}  │
│  -images     │    │  -videos     │    │  -audios     │    │  -documents  │
│              │    │              │    │              │    │              │
│  /lg/        │    │  /lg/        │    │  /lg/        │    │  /<uuid>.pdf │
│  /md/        │    │  /md/        │    │  /md/        │    │  /<uuid>.doc │
│  /sm/        │    │  /sm/        │    │  /sm/        │    │  /<uuid>.xls │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
  Privado.            Privado.            Privado.            Privado.
  CDN na frente.      CDN na frente.      CDN na frente.      (sem variants)
  Signed URLs.        Signed URLs.        Signed URLs.        Signed URLs.
```

**Por que separar:**

- **Permissões granulares** (worker de imagem não toca vídeo)
- **Lifecycle policies independentes** (imagens em STANDARD por 1 ano, áudios em GLACIER após 90 dias)
- **Métricas de custo** separadas por tipo de mídia
- **Compliance** (PII em documento pode ter retenção diferente de imagem de marketing)
- **Resiliência** (desastre em um bucket não afeta outros)

**Regras:**

- **Imagens**: 3 variantes (lg/md/sm). Documentos: **só original**.
- **Vídeos**: 3 variantes (lg/md/sm) + thumbnail estático (`.jpg` do frame 0)
- **Áudios**: 3 bitrates (lg/md/sm), mantidos como mesmo formato ou transcoded pra `mp3`/`opus`
- **Documentos**: 1 versão (original). **Sem variants** — não faz sentido ter "PDF pequeno".
- **Auto-criação**: **só em dev** (LocalStack/MinIO). **Produção = IaC** (Terraform/Pulumi).

---

## 3. A rota de upload (padrão obrigatório)

### 3.1 Endpoint

```http
POST /api/v1/uploads
Authorization: Bearer <jwt>
Content-Type: multipart/form-data; boundary=...

Form fields:
  - file: <binary>           # obrigatório
  - kind: "image" | "video" | "audio" | "document"   # obrigatório
  - contextId?: string        # opcional, pra relacionamento
  - contextType?: string      # opcional, ex: "user.avatar", "post.attachment"
  - isPublic?: boolean        # default false; signed URLs mesmo pra "public"
  - metadata?: JSON string    # livre, ex: {"alt": "logo", "source": "..."}
```

### 3.2 Fluxo server-side (pseudocódigo)

```typescript
async function handleUpload(req, res) {
  // 1. Autenticação + autorização
  const user = await requireAuth(req);
  if (!user.canUpload) return res.status(403).json({ error: "quota_exceeded" });

  // 2. Parse multipart (stream, não buffer!)
  const form = await parseMultipartStream(req);  // não usa memory pra arquivos grandes
  const { file, kind, contextId, contextType, isPublic, metadata } = form;

  // 3. Validações cheap (fail fast antes de processar)
  if (!ALLOWED_KINDS.includes(kind)) return res.status(400).json({ error: "invalid_kind" });
  if (file.size > MAX_SIZE_PER_KIND[kind]) return res.status(413).json({ error: "file_too_large" });
  if (file.size === 0) return res.status(400).json({ error: "empty_file" });

  // 4. Cria job + salva raw no staging (streaming, multipart upload)
  const jobId = randomUUID();
  const stagingKey = `uploads/${user.id}/${jobId}/${file.filename}`;

  await s3.send(new UploadPartCommand({
    Bucket: STAGING_BUCKET,
    Key: stagingKey,
    Body: file.stream,  // streaming, sem buffer em memória
    ContentType: file.mime,  // valor declarado (NÃO confiar)
  }));

  // 5. Persiste metadados iniciais no banco
  await db.uploads.create({
    id: jobId,
    userId: user.id,
    kind,
    contextId,
    contextType,
    isPublic: !!isPublic,
    originalFilename: file.filename,
    declaredMime: file.mime,       // valor declarado pelo client
    size: file.size,
    status: "PROCESSING",
    stagingKey,
    metadata: metadata ? safeJsonParse(metadata) : null,
    createdAt: new Date(),
  });

  // 6. Enfileira worker async (NÃO processa inline!)
  await queue.publish("media.process", {
    jobId,
    stagingKey,
    userId: user.id,
    kind,
    isPublic: !!isPublic,
  });

  // 7. Retorna 202 Accepted com jobId
  res.status(202).json({
    jobId,
    status: "PROCESSING",
    statusUrl: `/api/v1/uploads/${jobId}`,
    // NÃO retorna URLs ainda — variants não estão prontas
  });
}
```

### 3.3 Por que async?

| Arquivo | Tempo de processamento |
|---|---|
| Imagem 5 MB | ~2-5s (scan + 3 transcodes) |
| Vídeo 100 MB | ~20-60s (scan + 3 transcodes) |
| Vídeo 1 GB | ~3-10min (scan + 3 transcodes) |
| Documento 50 MB | ~5-10s (scan + validação PDF) |

Request HTTP típica: 30s timeout. **Maioria dos vídeos não cabe.** Async
resolve e ainda dá pra escalar o worker independentemente da API.

---

## 4. Worker assíncrono (pipeline de processamento)

### 4.1 Pipeline completo

```typescript
// Worker (roda em processo separado, scaling independente)
async function processMediaJob(job: ProcessJob) {
  const { jobId, stagingKey, kind, userId } = job;

  try {
    await updateStatus(jobId, "SCANNING");

    // === FASE 1: Download do staging ===
    const buffer = await downloadFromS3(STAGING_BUCKET, stagingKey);

    // === FASE 2: Validação de magic bytes (NÃO confiar no Content-Type) ===
    const detectedMime = await detectMimeFromBuffer(buffer);
    const expectedMimes = ALLOWED_MIMES[kind];
    if (!expectedMimes.includes(detectedMime)) {
      await markRejected(jobId, "mime_mismatch", {
        declared: job.declaredMime,
        detected: detectedMime,
      });
      await safeDelete(STAGING_BUCKET, stagingKey);
      return;
    }

    // === FASE 3: Hash + auditoria ===
    const hash = await sha256Stream(buffer);
    await db.uploads.update(jobId, { detectedMime, hash, status: "HASHED" });

    // === FASE 4: Vírus scan (ClamAV ou serviço gerenciado) ===
    const scanResult = await scanForVirus(buffer, jobId);
    if (scanResult.infected) {
      await markRejected(jobId, "virus_detected", {
        scanner: scanResult.scanner,
        threat: scanResult.threat,
      });
      // NÃO deleta staging imediatamente — guarda pra forense por 30 dias
      await moveToQuarantine(stagingKey);
      await notifySecurityTeam({ jobId, threat: scanResult.threat });
      return;
    }

    // === FASE 5: Geração de variants (só image/video/audio) ===
    const variants: Record<string, VariantResult> = {};

    if (kind === "image") {
      variants.lg = await transcodeImage(buffer, { max: 1920, quality: 85 });
      variants.md = await transcodeImage(buffer, { max: 768, quality: 80 });
      variants.sm = await transcodeImage(buffer, { max: 320, quality: 75 });
    } else if (kind === "video") {
      // Transcoding pesado — pode levar minutos
      variants.lg = await transcodeVideo(buffer, { resolution: "1080p", bitrate: "5000k" });
      variants.md = await transcodeVideo(buffer, { resolution: "480p", bitrate: "1200k" });
      variants.sm = await transcodeVideo(buffer, { resolution: "240p", bitrate: "400k" });
      variants.thumb = await extractVideoFrame(buffer, { at: "00:00:01" });
    } else if (kind === "audio") {
      variants.lg = await transcodeAudio(buffer, { bitrate: "192k" });
      variants.md = await transcodeAudio(buffer, { bitrate: "128k" });
      variants.sm = await transcodeAudio(buffer, { bitrate: "64k" });
    }
    // document: sem variants

    // === FASE 6: Upload paralelo pros buckets finais ===
    const targetBucket = TARGET_BUCKETS[kind];  // ex: "${PROJECT}-images"
    const finalKey = `${userId}/${jobId}`;

    await Promise.all(
      Object.entries(variants).map(([quality, variant]) =>
        uploadToS3(targetBucket, `${finalKey}/${quality}`, variant.buffer, {
          ContentType: variant.mime,
          Metadata: {
            "upload-id": jobId,
            "user-id": userId,
            "quality": quality,
            "original-hash": hash,
          },
        }),
      ),
    );

    // === FASE 7: Persistir URLs + metadados finais ===
    await db.uploads.update(jobId, {
      status: "READY",
      variants: Object.keys(variants),
      processedAt: new Date(),
    });

    // === FASE 8: Cleanup do staging ===
    await safeDelete(STAGING_BUCKET, stagingKey);

    // === FASE 9: Notificar cliente (webhook OU usuário faz polling) ===
    await notifyUser(userId, {
      type: "upload.ready",
      jobId,
      urls: buildSignedUrls(kind, finalKey, Object.keys(variants)),
    });
  } catch (err) {
    await markFailed(jobId, err);
    // staging fica até job ser reprocessado manualmente (auto-retry no queue)
  }
}
```

### 4.2 Worker robusto

```typescript
// Concurrency + retry + DLQ
const worker = new QueueWorker("media.process", {
  concurrency: 4,        // 4 transcodes simultâneos por worker
  timeoutMs: 15 * 60_000, // 15min max (Lambda também suporta isso)
  retry: {
    attempts: 3,
    backoff: "exponential",
    initialDelayMs: 5_000,
  },
  deadLetterQueue: "media.failed",
});

// Health check exposto pra k8s/docker
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    worker: worker.isRunning() ? "running" : "stopped",
    queueDepth: worker.queueDepth(),
    activeJobs: worker.activeJobs(),
  });
});
```

---

## 5. Antivírus — ClamAV e alternativas

### 5.1 ClamAV (open source, padrão)

```bash
# Instalação no worker
apt-get install -y clamav clamav-daemon

# Atualizar base de assinaturas
freshclam

# Modo daemon (recomendado pra performance)
systemctl enable clamav-daemon
systemctl start clamav-daemon
```

```typescript
// Cliente Node.js (clamdjs)
import { clamdjs } from "clamdjs";

const scanner = clamdjs.createScanner("127.0.0.1", 3310);

async function scanForVirus(buffer: Buffer, jobId: string) {
  const scanResult = await scanner.scanBuffer(buffer, 1024 * 1024); // 1MB chunks
  // scanResult: { good: true } ou { good: false, reason: "Win.Trojan.Agent-1234567" }
  return {
    infected: !scanResult.good,
    threat: scanResult.reason,
    scanner: "clamav",
    version: await scanner.version(),
  };
}
```

**Caveats do ClamAV:**

- Base atualizada diariamente (freshclam é obrigatório)
- Detecta ~95% das ameaças conhecidas; **falha em ameaças zero-day**
- Não suporta PDF/Office complexos tão bem quanto soluções comerciais
- Para alta confiança, **combine com sandbox** (Cloudflare Workers AI, AWS Macie)

### 5.2 Alternativas gerenciadas (mais robustas)

| Serviço | Modelo | Custo | Quando usar |
|---|---|---|---|
| **Cloudflare R2 Antivirus** | Built-in ao usar R2 | incluso | Já usa R2 |
| **AWS GuardDuty Malware Protection for S3** | Serverless | ~\$0.05/GB escaneado | Já usa AWS |
| **Sophos for S3** (via Cloud Storage Security) | API | sob consulta | Compliance crítico |
| **VirusTotal API** | API pública | free tier limitado | Verificação de hash, não streaming |
| **Cloudmersive Antivirus API** | SaaS | \$0-\$0.05/req | Multi-cloud |
| **Metadefender (OPSWAT)** | API + on-prem | enterprise | Setor financeiro |

### 5.3 Quando scanar

**Regra:** scanar TUDO, sempre. Não tem "esse arquivo é confiável".

O custo de scan é ordens de magnitude menor que o custo de servir
malware pra usuários.

### 5.4 Quarentena (não deletar imediatamente)

```typescript
// Bucket de quarentena (separado, acesso restrito)
const QUARANTINE_BUCKET = "${PROJECT}-quarantine";

// Lifecycle: delete após 30 dias (suficiente pra forense)
await s3.putBucketLifecycleConfiguration({
  Bucket: QUARANTINE_BUCKET,
  LifecycleConfiguration: {
    Rules: [
      {
        ID: "auto-purge-quarantine",
        Status: "Enabled",
        Filter: { Prefix: "" },
        Expiration: { Days: 30 },
      },
    ],
  },
});
```

**Por que guardar 30 dias?** Investigação forense, entender vetor de
ataque, identificar campanha, atualizar regras.

---

## 6. Multi-qualidade — quando, quanto, por quê

### 6.1 Tabela de variants por tipo

| Tipo | Variant | Resolução/bitrate | Formato | Uso |
|---|---|---|---|---|
| **Imagem** | `lg` | max 1920px, q85 | original (jpeg/png/webp) | Tela cheia desktop |
| | `md` | max 768px, q80 | webp preferencial | Card em feed |
| | `sm` | max 320px, q75 | webp | Thumbnail, avatar |
| **Vídeo** | `lg` | 1080p, 5000kbps | h264 + aac | Desktop fullscreen |
| | `md` | 480p, 1200kbps | h264 + aac | Mobile padrão |
| | `sm` | 240p, 400kbps | h264 + aac | Thumbnail animado / preview |
| | `thumb` | 640x360, jpg | jpeg | Poster estático |
| **Áudio** | `lg` | 192kbps | mp3 ou original | Streaming padrão |
| | `md` | 128kbps | opus/mp3 | Mobile |
| | `sm` | 64kbps | opus | Preview, voice memo |
| **Documento** | (só original) | — | pdf/doc/xls | Download direto |

### 6.2 Storage class por variant

```typescript
const STORAGE_CLASS = {
  lg: "STANDARD",              // acessado mais frequentemente
  md: "STANDARD",              // acessado frequentemente
  sm: "STANDARD_IA",           // infrequently accessed (barato)
  thumb: "STANDARD_IA",        // raramente acessado após criação
  // Lifecycle move pra GLACIER após N dias (configurável)
};
```

### 6.3 Quando NÃO criar variants

- **Imagens menores que 320px** (já é "sm", variantes seriam upscaling inútil)
- **GIFs animados** (preservar como original, sem variantes)
- **Documentos** (PDF pequeno não precisa de versão menor)
- **Áudios menores que 30s** (bitrate original já é "sm")

---

## 7. URLs — signed URLs, CDN, expiração

### 7.1 Padrão: signed URLs (5-15 min)

```typescript
function buildSignedUrl(bucket: string, key: string, expiresInSec: number = 900) {
  return s3.getSignedUrl("getObject", {
    Bucket: bucket,
    Key: key,
    Expires: expiresInSec,  // 15min default
    ResponseContentDisposition: "inline",  // abre no browser, não baixa
  });
}

// Para download (com filename customizado)
function buildDownloadUrl(bucket: string, key: string, filename: string) {
  return s3.getSignedUrl("getObject", {
    Bucket: bucket,
    Key: key,
    Expires: 900,
    ResponseContentDisposition: `attachment; filename="${filename}"`,
    ResponseContentType: "application/octet-stream",
  });
}
```

### 7.2 Quando o cliente PEDE a URL (API de leitura)

```typescript
// GET /api/v1/uploads/:id
async function getUpload(req, res) {
  const upload = await db.uploads.findById(req.params.id);

  // Autorização: só dono ou roles autorizadas
  if (upload.userId !== req.user.id && !req.user.canView(upload)) {
    return res.status(403).json({ error: "forbidden" });
  }

  // Se ainda processando, retorna status
  if (upload.status === "PROCESSING") {
    return res.status(202).json({ status: "PROCESSING" });
  }

  // Se rejeitado, retorna o motivo
  if (upload.status === "REJECTED") {
    return res.status(410).json({
      status: "REJECTED",
      reason: upload.rejectionReason,
      details: upload.rejectionDetails,
    });
  }

  // Pronto — retorna URLs assinadas
  const urls = {
    // Visualização (browser inline)
    preview: {
      lg: buildSignedUrl(BUCKET_IMAGES, `${upload.id}/lg`, 900),
      md: buildSignedUrl(BUCKET_IMAGES, `${upload.id}/md`, 900),
      sm: buildSignedUrl(BUCKET_IMAGES, `${upload.id}/sm`, 900),
    },
    // Download (sempre do lg = original)
    download: buildDownloadUrl(BUCKET_IMAGES, upload.id, upload.originalFilename),
  };

  res.json({
    status: "READY",
    kind: upload.kind,
    metadata: {
      originalFilename: upload.originalFilename,
      size: upload.size,
      mime: upload.detectedMime,  // valor REAL, não o declarado
      hash: upload.hash,         // SHA-256
      createdAt: upload.createdAt,
    },
    urls,
  });
}
```

### 7.3 CDN na frente (CloudFront, Cloudflare)

Para reduzir latência e custo de egress, coloque CDN na frente:

```
[Cliente] → https://cdn.example.com/images/<userId>/<jobId>/lg?signature=...
                ↓
            [CloudFront/Cloudflare]
                ↓ (cache miss)
            [S3 bucket privado, valida signature]
```

**Atenção:** ao usar CloudFront, signed URLs do CloudFront são diferentes
de signed URLs do S3. Use uma ou outra (não as duas).

---

## 8. Metadados — schema do banco

### 8.1 Tabela `uploads` (PostgreSQL)

```sql
CREATE TABLE uploads (
  id                  UUID PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES users(id),
  kind                VARCHAR(20) NOT NULL,  -- 'image' | 'video' | 'audio' | 'document'
  context_id          UUID,                  -- ID do objeto relacionado (post, user, etc)
  context_type        VARCHAR(50),           -- 'user.avatar' | 'post.attachment' | etc
  is_public           BOOLEAN NOT NULL DEFAULT FALSE,

  -- Identificação do arquivo
  original_filename   VARCHAR(255) NOT NULL,
  declared_mime       VARCHAR(100) NOT NULL,  -- o que o CLIENT disse (não confiar)
  detected_mime       VARCHAR(100),           -- magic bytes (verdade)
  size_bytes          BIGINT NOT NULL,
  sha256              VARCHAR(64),            -- hash do original
  md5                 VARCHAR(32),            -- ETag do S3

  -- Storage
  staging_key         VARCHAR(500) NOT NULL,  -- antes do processamento
  bucket              VARCHAR(100) NOT NULL,  -- bucket final
  storage_key_prefix  VARCHAR(500) NOT NULL, -- <userId>/<jobId>

  -- Variants
  variants            TEXT[],                 -- ['lg', 'md', 'sm'] | NULL p/ document

  -- Status
  status              VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
  -- 'PROCESSING' | 'SCANNING' | 'TRANSCODING' | 'READY' | 'REJECTED' | 'FAILED'
  rejection_reason    VARCHAR(50),            -- 'virus_detected' | 'mime_mismatch' | etc
  rejection_details   JSONB,

  -- Audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at        TIMESTAMPTZ,
  failed_at           TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ,            -- soft delete (LGPD)

  -- LGPD
  retention_until     TIMESTAMPTZ,            -- hard delete agendado
  is_pii              BOOLEAN NOT NULL DEFAULT FALSE,

  CONSTRAINT valid_kind CHECK (kind IN ('image', 'video', 'audio', 'document')),
  CONSTRAINT valid_status CHECK (status IN ('PROCESSING', 'SCANNING', 'TRANSCODING', 'READY', 'REJECTED', 'FAILED'))
);

CREATE INDEX idx_uploads_user_id ON uploads(user_id);
CREATE INDEX idx_uploads_context ON uploads(context_type, context_id);
CREATE INDEX idx_uploads_status ON uploads(status) WHERE status NOT IN ('READY', 'REJECTED');
CREATE INDEX idx_uploads_retention ON uploads(retention_until) WHERE retention_until IS NOT NULL;
```

### 8.2 Tabela `upload_audit_log` (LGPD art. 46)

```sql
CREATE TABLE upload_audit_log (
  id              BIGSERIAL PRIMARY KEY,
  upload_id       UUID NOT NULL REFERENCES uploads(id),
  event           VARCHAR(50) NOT NULL,  -- 'upload.requested' | 'scan.completed' | 'variant.created' | 'signed_url.issued' | etc
  actor_id        UUID,                  -- user que pediu (ou SYSTEM)
  actor_role      VARCHAR(50),
  details         JSONB,                 -- {scanner, threat, variant, expiresAt, etc}
  ip_hash         VARCHAR(64),           -- hash do IP (LGPD)
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prev_hash       VARCHAR(64),           -- hash chain
  hash            VARCHAR(64) NOT NULL
);
```

---

## 9. Endpoints da API (especificação)

### 9.1 Rotas obrigatórias

| Método | Path | Função | Auth |
|---|---|---|---|
| `POST` | `/api/v1/uploads` | Upload (multipart) | User |
| `GET` | `/api/v1/uploads/:id` | Status + signed URLs | User (dono ou role) |
| `GET` | `/api/v1/uploads/:id/download` | URL de download | User (dono ou role) |
| `DELETE` | `/api/v1/uploads/:id` | Soft delete (LGPD) | User (dono) |
| `GET` | `/api/v1/uploads` | Listar uploads do user | User |
| `POST` | `/api/v1/uploads/:id/regenerate-url` | Nova signed URL (renova expiração) | User (dono ou role) |
| `POST` | `/api/v1/uploads/:id/quarantine-info` | Info de arquivo em quarentena (forense) | Admin/Security |
| `GET` | `/api/v1/uploads/:id/audit-log` | Log de auditoria | Admin/Security |

### 9.2 Webhook de notificação (alternativa a polling)

```typescript
// Cliente fornece no upload:
const upload = await api.post("/uploads", formData, {
  headers: { "X-Webhook-URL": "https://app.cliente.com/webhooks/upload" },
});

// Quando processamento termina, API faz POST:
POST https://app.cliente.com/webhooks/upload
Content-Type: application/json
X-Harness-Signature: hmac-sha256=...

{
  "jobId": "uuid",
  "status": "READY",
  "kind": "image",
  "urls": {
    "preview": { "lg": "...", "md": "...", "sm": "..." },
    "download": "..."
  },
  "metadata": { "size": 1234567, "mime": "image/jpeg", "hash": "..." },
  "timestamp": "2026-07-20T21:30:00Z"
}
```

**Segurança:** assinatura HMAC no header, body com timestamp, cliente
valida antes de processar.

---

## 10. Provedores S3-compatible — diferenças práticas

| Provedor | URL endpoint | Multipart | Signed URLs | Vírus scan built-in | Custo egress |
|---|---|---|---|---|---|
| **AWS S3** | `s3.<region>.amazonaws.com` | ✅ | ✅ | Via GuardDuty Malware | \$0.09/GB |
| **Cloudflare R2** | `<account>.r2.cloudflarestorage.com` | ✅ | ✅ | R2 Antivirus (built-in!) | **\$0** (sem egress) |
| **Backblaze B2** | `<endpoint>.backblazeb2.com` | ✅ | ✅ | Não built-in | \$0.01/GB |
| **Google Cloud Storage** | `storage.googleapis.com` | ✅ | ✅ | Via Event Threat Detection | \$0.12/GB |
| **MinIO** (self-host) | `<host>:9000` | ✅ | ✅ | Não built-in (integre ClamAV) | Infra local |
| **RustFS** | S3-compatible | ✅ | ✅ | Não built-in | Infra local |
| **Garage** (self-host) | S3-compatible | ✅ | ✅ | Não built-in | Infra local |
| **SeaweedFS** | S3-compatible | ✅ | ✅ | Não built-in | Infra local |

**Recomendação:**

- **Produção pequena/média**: **Cloudflare R2** (egress grátis é matador)
- **Produção AWS-heavy**: **S3 + GuardDuty Malware** (integração nativa)
- **Self-host / on-prem**: **MinIO + ClamAV** ou **RustFS** (Rust, mais rápido)
- **Distribuído/geo**: **SeaweedFS** ou **Garage**

---

## 11. Implementação de referência (Node.js + TypeScript)

### 11.1 Setup mínimo

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner clamdjs
npm install -D @types/node
```

### 11.2 Configuração

```typescript
// config/storage.ts
export const STORAGE_CONFIG = {
  provider: process.env.STORAGE_PROVIDER as "aws" | "r2" | "minio",

  endpoint: process.env.STORAGE_ENDPOINT,  // ex: "https://s3.amazonaws.com"
  region: process.env.STORAGE_REGION ?? "us-east-1",
  accessKeyId: process.env.STORAGE_ACCESS_KEY!,
  secretAccessKey: process.env.STORAGE_SECRET_KEY!,

  buckets: {
    staging: `${process.env.PROJECT}-staging`,
    images: `${process.env.PROJECT}-images`,
    videos: `${process.env.PROJECT}-videos`,
    audios: `${process.env.PROJECT}-audios`,
    documents: `${process.env.PROJECT}-documents`,
    quarantine: `${process.env.PROJECT}-quarantine`,
  },

  cdn: {
    baseUrl: process.env.CDN_BASE_URL,  // ex: "https://cdn.example.com"
  },

  upload: {
    maxSize: {
      image: 20 * 1024 * 1024,     // 20MB
      video: 5 * 1024 * 1024 * 1024, // 5GB
      audio: 200 * 1024 * 1024,     // 200MB
      document: 100 * 1024 * 1024,  // 100MB
    },
    signedUrlExpiry: 15 * 60,        // 15min
  },

  virusScan: {
    enabled: true,
    scanner: "clamav" as const,
    clamavHost: process.env.CLAMAV_HOST ?? "127.0.0.1",
    clamavPort: parseInt(process.env.CLAMAV_PORT ?? "3310"),
    quarantineRetentionDays: 30,
  },
};
```

### 11.3 Cliente S3 (factory por provider)

```typescript
// lib/storage-client.ts
import { S3Client } from "@aws-sdk/client-s3";
import { STORAGE_CONFIG } from "../config/storage";

export function createStorageClient(): S3Client {
  return new S3Client({
    endpoint: STORAGE_CONFIG.endpoint,
    region: STORAGE_CONFIG.region,
    credentials: {
      accessKeyId: STORAGE_CONFIG.accessKeyId,
      secretAccessKey: STORAGE_CONFIG.secretAccessKey,
    },
    // Force path-style addressing pra MinIO/RustFS/Garage
    forcePathStyle: STORAGE_CONFIG.provider !== "aws" && STORAGE_CONFIG.provider !== "r2",
  });
}
```

### 11.4 Helper de upload (com multipart + streaming)

```typescript
// lib/storage-upload.ts
import { Upload } from "@aws-sdk/lib-storage";
import { createStorageClient } from "./storage-client";
import { STORAGE_CONFIG } from "../config/storage";

export async function uploadStream(opts: {
  bucket: string;
  key: string;
  body: ReadableStream | Buffer;
  contentType: string;
  metadata?: Record<string, string>;
}) {
  const client = createStorageClient();
  const upload = new Upload({
    client,
    params: {
      Bucket: opts.bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
      Metadata: opts.metadata,
    },
    queueSize: 4,         // 4 partes em paralelo
    partSize: 5 * 1024 * 1024,  // 5MB por parte (mínimo 5MB, recomendado p/ arquivos >100MB)
    leavePartsOnError: false,
  });
  return upload.done();
}
```

### 11.5 Helper de signed URL

```typescript
// lib/storage-signed-url.ts
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createStorageClient } from "./storage-client";
import { STORAGE_CONFIG } from "../config/storage";

export async function getSignedPreviewUrl(
  bucket: string,
  key: string,
  expiresIn: number = STORAGE_CONFIG.upload.signedUrlExpiry,
): Promise<string> {
  const client = createStorageClient();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: "inline",
  });
  return getSignedUrl(client, command, { expiresIn });
}

export async function getSignedDownloadUrl(
  bucket: string,
  key: string,
  filename: string,
  expiresIn: number = STORAGE_CONFIG.upload.signedUrlExpiry,
): Promise<string> {
  const client = createStorageClient();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    ResponseContentType: "application/octet-stream",
  });
  return getSignedUrl(client, command, { expiresIn });
}
```

### 11.6 Auto-criação de buckets (só dev!)

```typescript
// lib/storage-bootstrap.ts
import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { createStorageClient } from "./storage-client";
import { STORAGE_CONFIG } from "../config/storage";

export async function ensureBucketsExist() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("ensureBucketsExist() must not run in production. Use IaC.");
  }
  const client = createStorageClient();
  for (const [name, bucket] of Object.entries(STORAGE_CONFIG.buckets)) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (err: any) {
      if (err.$metadata?.httpStatusCode === 404 || err.name === "NotFound") {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
        console.log(`[storage] Created bucket ${name}: ${bucket}`);
      } else {
        throw err;
      }
    }
  }
}
```

**Produção:** use Terraform/Pulumi/CDK. Não rode isso.

---

## 12. Migração entre provedores

O padrão S3-compatible torna migração razoavelmente indolor:

```typescript
// src/config/storage.ts
const PROVIDER_CONFIGS = {
  aws: {
    endpoint: undefined,  // SDK usa default
    region: "us-east-1",
    forcePathStyle: false,
  },
  r2: {
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: "auto",
    forcePathStyle: false,
  },
  minio: {
    endpoint: process.env.MINIO_ENDPOINT,
    region: "us-east-1",
    forcePathStyle: true,
  },
  rustfs: {
    endpoint: process.env.RUSTFS_ENDPOINT,
    region: "us-east-1",
    forcePathStyle: true,
  },
};
```

**Rclone** é seu melhor amigo pra migração de dados:

```bash
# Migração S3 → R2
rclone sync s3:source-bucket r2:destination-bucket \
  --transfers=32 --checkers=64 --s3-upload-cutoff=5M
```

---

## 13. Testes

### 13.1 Fixture de arquivos sintéticos

```typescript
// tests/fixtures/files.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const FIXTURES = join(__dirname, "fixtures");

export function ensureFixtures() {
  mkdirSync(FIXTURES, { recursive: true });

  // 1x1 PNG válido
  if (!existsSync(join(FIXTURES, "valid-tiny.png"))) {
    const png = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
      0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
      0x42, 0x60, 0x82,
    ]);
    writeFileSync(join(FIXTURES, "valid-tiny.png"), png);
  }

  // "Vírus" simulado (Eicar test string)
  if (!existsSync(join(FIXTURES, "eicar-test.txt"))) {
    const eicar = Buffer.from(
      "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
    );
    writeFileSync(join(FIXTURES, "eicar-test.txt"), eicar);
  }

  // Mismatch: nome .jpg mas conteúdo é texto
  if (!existsSync(join(FIXTURES, "fake.jpg"))) {
    writeFileSync(join(FIXTURES, "fake.jpg"), "this is not an image");
  }
}
```

### 13.2 Test E2E

```typescript
// tests/upload.test.ts
import { test, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureFixtures } from "./fixtures/files";
import { api } from "./helpers/api";

beforeAll(() => {
  ensureFixtures();
});

test("upload de imagem válida retorna 202 com jobId", async () => {
  const file = readFileSync(join(__dirname, "fixtures/valid-tiny.png"));

  const res = await api.post("/uploads", {
    file: new Blob([file], { type: "image/png" }),
    kind: "image",
  }, {
    headers: { Authorization: `Bearer ${testToken}` },
  });

  expect(res.status).toBe(202);
  expect(res.data.jobId).toMatch(/^[0-9a-f-]{36}$/);
  expect(res.data.status).toBe("PROCESSING");
  expect(res.data.statusUrl).toBe(`/api/v1/uploads/${res.data.jobId}`);
});

test("upload de EICAR é rejeitado com virus_detected", async () => {
  const file = readFileSync(join(__dirname, "fixtures/eicar-test.txt"));

  const res = await api.post("/uploads", {
    file: new Blob([file], { type: "text/plain" }),
    kind: "document",
  });

  // 202 imediato (job é processado async)
  expect(res.status).toBe(202);
  const { jobId } = res.data;

  // Aguarda processamento
  await waitFor(async () => {
    const r = await api.get(`/uploads/${jobId}`);
    return r.data.status === "REJECTED";
  }, { timeoutMs: 30_000 });

  const final = await api.get(`/uploads/${jobId}`);
  expect(final.data.status).toBe("REJECTED");
  expect(final.data.reason).toBe("virus_detected");
  expect(final.data.details.threat).toMatch(/eicar/i);
});

test("upload de fake.jpg (extensão falsa) é rejeitado com mime_mismatch", async () => {
  const file = readFileSync(join(__dirname, "fixtures/fake.jpg"));

  const res = await api.post("/uploads", {
    file: new Blob([file], { type: "image/jpeg" }),
    kind: "image",
  });

  const { jobId } = res.data;

  await waitFor(async () => {
    const r = await api.get(`/uploads/${jobId}`);
    return r.data.status === "REJECTED";
  });

  const final = await api.get(`/uploads/${jobId}`);
  expect(final.data.reason).toBe("mime_mismatch");
  expect(final.data.details.declared).toBe("image/jpeg");
  expect(final.data.details.detected).toBe("text/plain");
});

test("arquivo maior que o limite retorna 413", async () => {
  const bigFile = Buffer.alloc(25 * 1024 * 1024); // 25MB > 20MB limite de imagem
  const res = await api.post("/uploads", {
    file: new Blob([bigFile], { type: "image/png" }),
    kind: "image",
  });
  expect(res.status).toBe(413);
});
```

---

## 14. Monitoramento & Métricas

### 14.1 Métricas essenciais

| Métrica | Tipo | Alerta |
|---|---|---|
| `uploads.requests.total` | counter | — |
| `uploads.rejected.virus` | counter | spike = campanha em andamento |
| `uploads.rejected.mime_mismatch` | counter | spike = bug ou cliente malicioso |
| `uploads.processing.duration_seconds` | histogram | p95 > 60s = worker lento |
| `uploads.queue.depth` | gauge | > 100 = escalar worker |
| `uploads.storage.bytes_total` | gauge | — |
| `uploads.storage.cost_usd_daily` | gauge | variação > 50% = investigar |
| `clamav.signature_age_hours` | gauge | > 24h = freshclam quebrou |
| `s3.requests.errors_5xx` | counter | > 0 = problema com provider |

### 14.2 Logs estruturados

```typescript
logger.info("upload.requested", {
  uploadId,
  userId,
  kind,
  sizeBytes,
  declaredMime,
  ip: req.ip,  // hash pra LGPD
});

logger.info("upload.scanned", {
  uploadId,
  scanner: "clamav",
  infected: false,
  durationMs: 1234,
  signatureVersion: "2026-07-20",
});

logger.info("upload.transcoded", {
  uploadId,
  variants: ["lg", "md", "sm"],
  durationMs: 5678,
});

logger.info("upload.ready", {
  uploadId,
  bucket: "prod-images",
  keyPrefix: `${userId}/${uploadId}`,
  totalDurationMs: 7000,
});
```

---

## 15. Anti-patterns (revisão rápida)

- ❌ Scan/process dentro da request HTTP (use async)
- ❌ Auto-criar buckets em produção (use IaC)
- ❌ URLs públicas de bucket (use signed URLs)
- ❌ Confiar no Content-Type do client (valide magic bytes)
- ❌ Hash calculado após upload (faça streaming)
- ❌ Bucket único pra tudo (separe por tipo)
- ❌ Deletar staging antes de confirmar variants (race condition)
- ❌ Vírus scan só em alguns tipos (escanear TUDO)
- ❌ Escanear localmente em produção (use ClamAV daemon ou serviço)
- ❌ Hard delete sem soft delete (LGPD art. 18, VI)
- ❌ Logs com nome de arquivo do usuário (hashear)
- ❌ Assumir variant "sm" sempre existe (smaller than 320px = skip)
- ❌ Esquecer de gerar thumbnail de vídeo
- ❌ Streaming do buffer inteiro pra RAM (use multipart + streaming)
- ❌ Não ter DLQ (dead-letter queue) no worker

---

## 16. Checklist pré-merge (cole no PR template)

```markdown
## Object Storage Self-Audit

### Upload
- [ ] Endpoint aceita `multipart/form-data`
- [ ] Streaming (não bufferiza em memória)
- [ ] Validação de size antes de processar
- [ ] Validação de kind (image/video/audio/document)
- [ ] Salva em bucket staging antes de retornar
- [ ] Retorna 202 com jobId (async pattern)
- [ ] NÃO processa inline (vai pra queue/worker)

### Validação de MIME
- [ ] Detecta MIME via magic bytes (não confia no client)
- [ ] Whitelist de MIME permitido por kind
- [ ] Mismatch → REJECTED com mime_mismatch

### Vírus scan
- [ ] ClamAV daemon rodando e atualizado
- [ ] Fallback pra serviço gerenciado (se aplicável)
- [ ] Vírus detectado → REJECTED + quarentena (30d)
- [ ] Notifica Security team em detecção

### Variants
- [ ] Imagem: lg/md/sm em `${PROJECT}-images`
- [ ] Vídeo: lg/md/sm + thumb em `${PROJECT}-videos`
- [ ] Áudio: lg/md/sm em `${PROJECT}-audios`
- [ ] Documento: só original em `${PROJECT}-documents`
- [ ] Storage class correto (STANDARD vs IA)
- [ ] Thumb de vídeo gerado (.jpg do frame 0)

### URLs
- [ ] Signed URLs com expiração 5-15min
- [ ] Visualização = `inline` (preview)
- [ ] Download = `attachment` com filename original
- [ ] Download SEMPRE do bucket `lg` (original)
- [ ] Documento: visualização = download (mesma URL)
- [ ] Nenhuma URL pública de bucket

### Metadados
- [ ] Hash SHA-256 calculado durante upload
- [ ] Magic bytes detectados (não o declarado)
- [ ] Schema do banco com índices apropriados
- [ ] Audit log de acesso (LGPD)

### LGPD
- [ ] Soft delete implementado
- [ ] Hard delete agendado (retention_until)
- [ ] Untrain expression se envolve ML
- [ ] Sanitização de logs (sem filename real do user)
- [ ] IP do cliente hasheado nos logs

### Operação
- [ ] Auto-criação de bucket só em dev (NODE_ENV !== 'production')
- [ ] IaC (Terraform/Pulumi) pra prod
- [ ] Lifecycle policy: staging → delete 24h, quarentena → 30d
- [ ] DLQ configurada no worker
- [ ] Health check do worker exposto
- [ ] Métricas exportadas (Prometheus/OTel)
```

---

## 17. Recursos

- [AWS S3 Multipart Upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [MinIO + ClamAV integration](https://min.io/docs/minio/linux/operations/concepts.html)
- [Uploadcare Signed URLs](https://uploadcare.com/docs/security/secure-delivery/)
- [AWS GuardDuty Malware Protection for S3](https://aws.amazon.com/blogs/apn/integrating-amazon-s3-malware-scanning-into-your-application-workflow-with-cloud-storage-security/)
- [Harness `tools/object-storage-uploader.ts`](código de referência)
- [Harness `docs/object-storage-architecture.md`](referência arquitetural)
- [Harness `skills/lgpd-compliance/SKILL.md`](correlação LGPD)
