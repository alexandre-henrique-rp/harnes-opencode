/**
 * object-storage-uploader.ts — v6.6.0
 *
 * Implementação de referência do Object Storage Standard definido em
 * `training/object-storage-standard.md`.
 *
 * Aplicável a QUALQUER API desenvolvida no harness que receba arquivos.
 *
 * Compatível com: AWS S3, Cloudflare R2, Backblaze B2, MinIO, RustFS,
 * Garage, SeaweedFS, qualquer S3-compatible.
 *
 * Features:
 *   - Streaming upload (multipart) — não bufferiza em memória
 *   - Validação de MIME via magic bytes (NÃO confia no client)
 *   - Vírus scan via ClamAV daemon
 *   - Geração assíncrona de variants (lg/md/sm) em worker
 *   - Auto-criação de buckets (SÓ em dev — production usa IaC)
 *   - Signed URLs com expiração configurável
 *   - Audit log de cada operação
 *   - Suporte a LGPD (soft delete + retention_until)
 *
 * Uso:
 *   import { createUploadHandler, createWorker } from "./object-storage-uploader";
 *
 *   // API
 *   app.post("/uploads", requireAuth, createUploadHandler({ db, queue }));
 *
 *   // Worker (processo separado)
 *   createWorker({ db, queue }).start();
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import clamdjs from "clamdjs";

// ============================================================
// CONFIGURAÇÃO
// ============================================================

export type MediaKind = "image" | "video" | "audio" | "document";
export type Quality = "lg" | "md" | "sm" | "thumb";
export type UploadStatus = "PROCESSING" | "SCANNING" | "TRANSCODING" | "READY" | "REJECTED" | "FAILED";
export type StorageDriver = "s3" | "filesystem";
export type StorageProvider = "aws" | "r2" | "minio" | "rustfs" | "garage" | "seaweedfs" | "filesystem";

export type RejectionReason =
  | "virus_detected"
  | "mime_mismatch"
  | "file_too_large"
  | "empty_file"
  | "unsupported_kind"
  | "transcoding_failed"
  | "scan_error";

export interface FileSystemStorageConfig {
  /** Diretório raiz do sistema de arquivos onde a taxonomia será armazenada */
  basePath: string;
  /** Prefixo da rota da API no backend para servimento de arquivos (ex: "/api/v1/storage/files") */
  publicApiRoutePrefix: string;
}

export interface StorageConfig {
  driver?: StorageDriver;
  provider: StorageProvider;
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fileSystem?: FileSystemStorageConfig;
  buckets: {
    staging: string;
    images: string;
    videos: string;
    audios: string;
    documents: string;
    quarantine: string;
  };
  cdnBaseUrl?: string;
  upload: {
    maxSizeBytes: Record<MediaKind, number>;
    signedUrlExpirySec: number;
  };
  virusScan: {
    enabled: boolean;
    clamavHost: string;
    clamavPort: number;
    quarantineRetentionDays: number;
  };
  variants: {
    image: { lg: ImageVariantConfig; md: ImageVariantConfig; sm: ImageVariantConfig };
    video: {
      lg: VideoVariantConfig;
      md: VideoVariantConfig;
      sm: VideoVariantConfig;
      thumb: { width: number; height: number; at: string };
    };
    audio: {
      lg: { bitrate: string };
      md: { bitrate: string };
      sm: { bitrate: string };
    };
  };
}

export interface ImageVariantConfig {
  maxWidth: number;
  quality: number;
  format: "webp" | "jpeg" | "png" | "original";
}

export interface VideoVariantConfig {
  resolution: "240p" | "480p" | "720p" | "1080p" | "1440p" | "2160p";
  bitrate: string; // ex: "5000k"
  codec?: "h264" | "h265" | "vp9" | "av1";
}

export const ALLOWED_MIMES: Record<MediaKind, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
  video: ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"],
  audio: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/webm", "audio/aac"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
  ],
};

export const MIME_MAGIC: Array<{ mime: string; signatures: number[][] }> = [
  { mime: "image/jpeg", signatures: [[0xff, 0xd8, 0xff]] },
  { mime: "image/png", signatures: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]] },
  { mime: "image/gif", signatures: [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]] },
  { mime: "image/webp", signatures: [[0x52, 0x49, 0x46, 0x46, 0x57, 0x45, 0x42, 0x50]] },
  { mime: "application/pdf", signatures: [[0x25, 0x50, 0x44, 0x46]] },
  { mime: "video/mp4", signatures: [[0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34], [0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]] },
  { mime: "video/webm", signatures: [[0x1a, 0x45, 0xdf, 0xa3]] },
  { mime: "audio/mpeg", signatures: [[0xff, 0xfb], [0xff, 0xf3], [0xff, 0xf2], [0x49, 0x44, 0x33]] },
  { mime: "audio/wav", signatures: [[0x52, 0x49, 0x46, 0x46, 0x57, 0x41, 0x56, 0x45]] },
  { mime: "audio/ogg", signatures: [[0x4f, 0x67, 0x67, 0x53]] },
];

// ============================================================
// CLIENT
// ============================================================

export function createStorageClient(config: StorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: !["aws", "r2"].includes(config.provider),
  });
}

// ============================================================
// MÁGICA: Detecção de MIME via magic bytes
// ============================================================

export function detectMimeFromBuffer(buffer: Buffer): string {
  for (const entry of MIME_MAGIC) {
    for (const sig of entry.signatures) {
      if (buffer.length < sig.length) continue;
      let match = true;
      for (let i = 0; i < sig.length; i++) {
        if (buffer[i] !== sig[i]) {
          match = false;
          break;
        }
      }
      if (match) return entry.mime;
    }
  }
  return "application/octet-stream";
}

// ============================================================
// HASH STREAMING
// ============================================================

export async function sha256Stream(stream: Readable): Promise<{ hash: string; buffer: Buffer }>;
export async function sha256Stream(buffer: Buffer): Promise<{ hash: string; buffer: Buffer }>;
export async function sha256Stream(
  input: Readable | Buffer,
): Promise<{ hash: string; buffer: Buffer }> {
  const hash = createHash("sha256");
  let buffer: Buffer;

  if (Buffer.isBuffer(input)) {
    hash.update(input);
    buffer = input;
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of input) {
      const c = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(c);
      hash.update(c);
    }
    buffer = Buffer.concat(chunks);
  }

  return { hash: hash.digest("hex"), buffer };
}

// ============================================================
// UPLOAD (multipart, streaming)
// ============================================================

export interface UploadOptions {
  bucket: string;
  key: string;
  body: Readable | Buffer;
  contentType: string;
  metadata?: Record<string, string>;
  storageClass?: "STANDARD" | "STANDARD_IA" | "GLACIER" | "DEEP_ARCHIVE";
}

export async function uploadObject(
  client: S3Client,
  opts: UploadOptions,
): Promise<{ etag: string; versionId?: string }> {
  const upload = new Upload({
    client,
    params: {
      Bucket: opts.bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
      Metadata: opts.metadata,
      StorageClass: opts.storageClass,
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024,
    leavePartsOnError: false,
  });
  const result = await upload.done();
  return { etag: result.ETag ?? "", versionId: result.VersionId };
}

/**
 * Operação unificada de Upload suportando S3 e File System local.
 */
export async function uploadStorageObject(
  client: S3Client,
  config: StorageConfig,
  opts: UploadOptions,
): Promise<{ etag: string; versionId?: string }> {
  if (config.driver === "filesystem" || config.provider === "filesystem") {
    const basePath = config.fileSystem?.basePath ?? "./uploads";
    const filePath = path.join(basePath, opts.bucket, opts.key);
    const dir = path.dirname(filePath);

    // Prevenção estrita contra Path Traversal
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(basePath);
    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new Error("Path traversal detected in storage key");
    }

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (Buffer.isBuffer(opts.body)) {
      fs.writeFileSync(filePath, opts.body);
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of opts.body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      fs.writeFileSync(filePath, Buffer.concat(chunks));
    }

    const hash = createHash("md5").update(opts.key).digest("hex");
    return { etag: `"${hash}"` };
  }

  return uploadObject(client, opts);
}

/**
 * Leitura unificada de objetos suportando S3 e File System local.
 */
export async function getStorageObjectBuffer(
  client: S3Client,
  config: StorageConfig,
  bucket: string,
  key: string,
): Promise<{ buffer: Buffer; contentType?: string }> {
  if (config.driver === "filesystem" || config.provider === "filesystem") {
    const basePath = config.fileSystem?.basePath ?? "./uploads";
    const filePath = path.join(basePath, bucket, key);

    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(basePath);
    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new Error("Path traversal detected in storage key");
    }

    const buffer = fs.readFileSync(filePath);
    return { buffer, contentType: undefined };
  }

  const obj = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = obj.Body as Readable;
  const { buffer } = await sha256Stream(body);
  return { buffer, contentType: obj.ContentType };
}

// ============================================================
// SIGNED URLS
// ============================================================

export async function getSignedPreviewUrl(
  client: S3Client,
  bucket: string,
  key: string,
  expiresIn: number,
): Promise<string> {
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: "inline",
    }),
    { expiresIn },
  );
}

export async function getSignedDownloadUrl(
  client: S3Client,
  bucket: string,
  key: string,
  filename: string,
  expiresIn: number,
): Promise<string> {
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
      ResponseContentType: "application/octet-stream",
    }),
    { expiresIn },
  );
}

// ============================================================
// ANTIVÍRUS (ClamAV)
// ============================================================

export interface ScanResult {
  infected: boolean;
  threat?: string;
  scanner: string;
  version?: string;
  error?: string;
}

export async function scanForVirus(
  buffer: Buffer,
  config: StorageConfig["virusScan"],
): Promise<ScanResult> {
  if (!config.enabled) {
    return { infected: false, scanner: "disabled" };
  }
  const scanner = clamdjs.createScanner(config.clamavHost, config.clamavPort);
  try {
    const result = await scanner.scanBuffer(buffer, 1024 * 1024);
    return {
      infected: !result.good,
      threat: result.reason || undefined,
      scanner: "clamav",
      version: await scanner.version().catch(() => undefined),
    };
  } catch (err: any) {
    return {
      infected: false,
      scanner: "clamav",
      error: err.message ?? String(err),
    };
  }
}

// ============================================================
// BUCKETS / FOLDERS BOOTSTRAP (só dev!)
// ============================================================

export async function ensureBucketsExist(
  client: S3Client,
  config: StorageConfig,
): Promise<void> {
  if (config.driver === "filesystem" || config.provider === "filesystem") {
    const basePath = config.fileSystem?.basePath ?? "./uploads";
    for (const bucketName of Object.values(config.buckets)) {
      const folderPath = path.join(basePath, bucketName);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        console.log(`[storage:fs] Created folder: ${folderPath}`);
      }
    }
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("ensureBucketsExist() must NOT run in production. Use IaC.");
  }
  for (const [name, bucket] of Object.entries(config.buckets)) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (err: any) {
      if (err.$metadata?.httpStatusCode === 404 || err.name === "NotFound") {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
        // eslint-disable-next-line no-console
        console.log(`[storage] Created bucket ${name}: ${bucket}`);
      } else {
        throw err;
      }
    }
  }
}

// ============================================================
// DATABASE (interface — implementação concreta fica no app)
// ============================================================

export interface UploadRecord {
  id: string;
  userId: string;
  kind: MediaKind;
  contextId?: string;
  contextType?: string;
  isPublic: boolean;
  originalFilename: string;
  declaredMime: string;
  detectedMime?: string;
  sizeBytes: number;
  sha256?: string;
  md5?: string;
  stagingKey: string;
  bucket: string;
  storageKeyPrefix: string;
  variants?: Quality[];
  status: UploadStatus;
  rejectionReason?: RejectionReason;
  rejectionDetails?: Record<string, unknown>;
  createdAt: Date;
  processedAt?: Date;
  failedAt?: Date;
  deletedAt?: Date;
  retentionUntil?: Date;
  isPii: boolean;
}

export interface UploadDatabase {
  create(record: Omit<UploadRecord, "id" | "createdAt" | "status">): Promise<UploadRecord>;
  update(id: string, patch: Partial<UploadRecord>): Promise<UploadRecord>;
  findById(id: string): Promise<UploadRecord | null>;
  delete(id: string): Promise<void>;
}

// ============================================================
// QUEUE (interface — implementação concreta fica no app)
// ============================================================

export interface ProcessJob {
  jobId: string;
  stagingKey: string;
  userId: string;
  kind: MediaKind;
  isPublic: boolean;
}

export interface UploadQueue {
  publish(channel: string, payload: ProcessJob): Promise<void>;
  subscribe<T>(channel: string, handler: (payload: T) => Promise<void>): void;
}

// ============================================================
// HTTP HANDLER (multipart upload → 202 com jobId)
// ============================================================

export interface CreateUploadHandlerDeps {
  config: StorageConfig;
  db: UploadDatabase;
  queue: UploadQueue;
  /** Auth middleware — extrai userId do request */
  requireAuth: (req: any) => Promise<{ id: string; canUpload: boolean }>;
  /** Logger estruturado */
  logger?: (event: string, data: Record<string, unknown>) => void;
}

export function createUploadHandler(deps: CreateUploadHandlerDeps) {
  const client = createStorageClient(deps.config);
  const log = deps.logger ?? (() => {});

  return async function handleUpload(req: any, res: any) {
    try {
      // 1. Auth
      const user = await deps.requireAuth(req);
      if (!user.canUpload) {
        return res.status(403).json({ error: "quota_exceeded" });
      }

      // 2. Parse multipart
      const file = req.file;
      const { kind, contextId, contextType, isPublic, metadata } = req.body;

      // 3. Fail-fast validations
      if (!ALLOWED_MIMES[kind as MediaKind]) {
        return res.status(400).json({ error: "unsupported_kind" });
      }
      if (file.size === 0) {
        return res.status(400).json({ error: "empty_file" });
      }
      if (file.size > deps.config.upload.maxSizeBytes[kind as MediaKind]) {
        return res.status(413).json({ error: "file_too_large" });
      }

      // 4. Create job + upload to staging (streaming)
      const jobId = randomUUID();
      const stagingKey = `uploads/${user.id}/${jobId}/${sanitizeFilename(file.originalname ?? "file")}`;

      await uploadStorageObject(client, deps.config, {
        bucket: deps.config.buckets.staging,
        key: stagingKey,
        body: file.stream ?? file.buffer,
        contentType: file.mimetype,
        metadata: {
          "upload-id": jobId,
          "user-id": user.id,
        },
      });

      // 5. Persist
      const record = await deps.db.create({
        userId: user.id,
        kind: kind as MediaKind,
        contextId,
        contextType,
        isPublic: !!isPublic,
        originalFilename: file.originalname,
        declaredMime: file.mimetype,
        sizeBytes: file.size,
        stagingKey,
        bucket: bucketForKind(deps.config, kind as MediaKind),
        storageKeyPrefix: `${user.id}/${jobId}`,
        isPii: kind === "document" || isPublic === false,
        deletedAt: undefined,
        retentionUntil: computeRetention(kind as MediaKind),
      });

      // 6. Enqueue worker job
      await deps.queue.publish("media.process", {
        jobId: record.id,
        stagingKey,
        userId: user.id,
        kind: kind as MediaKind,
        isPublic: !!isPublic,
      });

      log("upload.requested", {
        uploadId: record.id,
        userId: user.id,
        kind,
        sizeBytes: file.size,
        declaredMime: file.mimetype,
      });

      // 7. 202 Accepted
      return res.status(202).json({
        jobId: record.id,
        status: "PROCESSING",
        statusUrl: `/api/v1/uploads/${record.id}`,
      });
    } catch (err: any) {
      log("upload.error", { error: err.message, stack: err.stack });
      return res.status(500).json({ error: "internal_error" });
    }
  };
}

// ============================================================
// WORKER (processa jobs da queue)
// ============================================================

export interface CreateWorkerDeps {
  config: StorageConfig;
  db: UploadDatabase;
  queue: UploadQueue;
  logger?: (event: string, data: Record<string, unknown>) => void;
  transcodeImage?: (
    buffer: Buffer,
    config: ImageVariantConfig,
  ) => Promise<{ buffer: Buffer; mime: string }>;
  transcodeVideo?: (
    buffer: Buffer,
    config: VideoVariantConfig,
  ) => Promise<{ buffer: Buffer; mime: string }>;
  extractVideoFrame?: (
    buffer: Buffer,
    at: string,
  ) => Promise<{ buffer: Buffer; mime: string }>;
  transcodeAudio?: (
    buffer: Buffer,
    bitrate: string,
  ) => Promise<{ buffer: Buffer; mime: string }>;
}

export function createWorker(deps: CreateWorkerDeps) {
  const client = createStorageClient(deps.config);
  const log = deps.logger ?? (() => {});

  async function processJob(job: ProcessJob): Promise<void> {
    const { jobId, stagingKey, kind } = job;
    log("worker.job.started", { jobId, kind });

    try {
      // 1. Download do staging
      const { buffer, contentType } = await getStorageObjectBuffer(
        client,
        deps.config,
        deps.config.buckets.staging,
        stagingKey,
      );
      const { hash } = await sha256Stream(buffer);

      // 2. Magic bytes
      const detectedMime = detectMimeFromBuffer(buffer);
      if (!ALLOWED_MIMES[kind].includes(detectedMime)) {
        await deps.db.update(jobId, {
          status: "REJECTED",
          rejectionReason: "mime_mismatch",
          rejectionDetails: { declared: contentType, detected: detectedMime },
          detectedMime,
          sha256: hash,
        });
        await moveToQuarantine(client, deps.config, stagingKey, "mime_mismatch");
        log("worker.job.rejected", { jobId, reason: "mime_mismatch" });
        return;
      }

      // 3. Vírus scan
      await deps.db.update(jobId, { status: "SCANNING", detectedMime, sha256: hash });
      const scan = await scanForVirus(buffer, deps.config.virusScan);
      if (scan.infected) {
        await deps.db.update(jobId, {
          status: "REJECTED",
          rejectionReason: "virus_detected",
          rejectionDetails: { scanner: scan.scanner, threat: scan.threat },
        });
        await moveToQuarantine(client, deps.config, stagingKey, "virus_detected");
        log("worker.job.rejected", { jobId, reason: "virus_detected", threat: scan.threat });
        return;
      }

      // 4. Geração de variants
      await deps.db.update(jobId, { status: "TRANSCODING" });
      const variants: Record<Quality, { buffer: Buffer; mime: string }> = {} as any;
      const variantKeys: Quality[] = [];

      if (kind === "image" && deps.transcodeImage) {
        for (const q of ["lg", "md", "sm"] as const) {
          variants[q] = await deps.transcodeImage(buffer, deps.config.variants.image[q]);
          variantKeys.push(q);
        }
      } else if (kind === "video" && deps.transcodeVideo && deps.extractVideoFrame) {
        for (const q of ["lg", "md", "sm"] as const) {
          variants[q] = await deps.transcodeVideo(buffer, deps.config.variants.video[q]);
          variantKeys.push(q);
        }
        const thumbCfg = deps.config.variants.video.thumb;
        variants.thumb = await deps.extractVideoFrame(buffer, thumbCfg.at);
        variantKeys.push("thumb");
      } else if (kind === "audio" && deps.transcodeAudio) {
        for (const q of ["lg", "md", "sm"] as const) {
          variants[q] = await deps.transcodeAudio(buffer, deps.config.variants.audio[q].bitrate);
          variantKeys.push(q);
        }
      } else if (kind === "document") {
        const record = await deps.db.findById(jobId);
        if (!record) throw new Error("Record not found");
        const finalKey = `${record.storageKeyPrefix}/lg`;
        await uploadStorageObject(client, deps.config, {
          bucket: deps.config.buckets.documents,
          key: finalKey,
          body: buffer,
          contentType: detectedMime,
          metadata: {
            "upload-id": jobId,
            "user-id": job.userId,
            "quality": "lg",
            "original-hash": hash,
          },
        });
        await deps.db.update(jobId, {
          status: "READY",
          variants: ["lg"],
          processedAt: new Date(),
        });
        // Cleanup staging
        await safeDeleteStorageObject(client, deps.config, deps.config.buckets.staging, stagingKey);
        log("worker.job.ready", { jobId, kind, variants: ["lg"] });
        return;
      } else {
        throw new Error(`Transcoding not implemented for kind ${kind}`);
      }

      // 5. Upload paralelo das variants
      const record = await deps.db.findById(jobId);
      if (!record) throw new Error("Record not found");
      const targetBucket = bucketForKind(deps.config, kind);

      await Promise.all(
        variantKeys.map((q) =>
          uploadStorageObject(client, deps.config, {
            bucket: targetBucket,
            key: `${record.storageKeyPrefix}/${q}`,
            body: variants[q].buffer,
            contentType: variants[q].mime,
            metadata: {
              "upload-id": jobId,
              "user-id": job.userId,
              "quality": q,
              "original-hash": hash,
            },
          }),
        ),
      );

      // 6. Mark ready
      await deps.db.update(jobId, {
        status: "READY",
        variants: variantKeys,
        processedAt: new Date(),
      });

      // 7. Cleanup staging
      await safeDeleteStorageObject(client, deps.config, deps.config.buckets.staging, stagingKey);

      log("worker.job.ready", { jobId, kind, variants: variantKeys });
    } catch (err: any) {
      log("worker.job.error", { jobId, error: err.message, stack: err.stack });
      await deps.db.update(jobId, {
        status: "FAILED",
        rejectionDetails: { error: err.message, stack: err.stack },
        failedAt: new Date(),
      });
    }
  }

  return {
    start: () => deps.queue.subscribe<ProcessJob>("media.process", processJob),
    processJob,
  };
}

// ============================================================
// FILE SYSTEM SERVE HANDLER (Backend HTTP Router)
// ============================================================

export interface CreateFileSystemServeHandlerDeps {
  config: StorageConfig;
  db: UploadDatabase;
  /** Autorização opcional para validação de acesso pelo backend */
  canView?: (user: { id: string }, upload: UploadRecord) => boolean;
}

/**
 * Handler HTTP para ser registrado nas rotas do Backend ao usar driver File System.
 * Garante servimento seguro com validação de Path Traversal e headers de download/stream.
 */
export function createFileSystemServeHandler(deps: CreateFileSystemServeHandlerDeps) {
  return async function handleFileSystemServe(req: any, res: any) {
    try {
      const basePath = deps.config.fileSystem?.basePath ?? "./uploads";
      const bucket = req.params.bucket;
      const key = req.params[0] ?? req.params.key;

      if (!bucket || !key) {
        return res.status(400).json({ error: "invalid_params" });
      }

      const filePath = path.join(basePath, bucket, key);

      // Prevenção estrita contra Path Traversal
      const resolvedPath = path.resolve(filePath);
      const resolvedBase = path.resolve(basePath);
      if (!resolvedPath.startsWith(resolvedBase)) {
        return res.status(403).json({ error: "access_denied" });
      }

      if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: "file_not_found" });
      }

      const stat = fs.statSync(resolvedPath);
      const isDownload = req.query.download === "true";
      const filename = req.query.filename ? String(req.query.filename) : path.basename(resolvedPath);

      res.setHeader("Content-Length", stat.size);
      res.setHeader("Cache-Control", "private, max-age=3600");

      if (isDownload) {
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
        res.setHeader("Content-Type", "application/octet-stream");
      } else {
        res.setHeader("Content-Disposition", "inline");
      }

      const readStream = fs.createReadStream(resolvedPath);
      readStream.pipe(res);
    } catch (err: any) {
      return res.status(500).json({ error: "internal_error" });
    }
  };
}

// ============================================================
// HELPERS
// ============================================================

function bucketForKind(config: StorageConfig, kind: MediaKind): string {
  switch (kind) {
    case "image":
      return config.buckets.images;
    case "video":
      return config.buckets.videos;
    case "audio":
      return config.buckets.audios;
    case "document":
      return config.buckets.documents;
  }
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\/\\]/g, "_")
    .replace(/\.\./g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 200);
}

function computeRetention(kind: MediaKind): Date {
  const now = new Date();
  switch (kind) {
    case "image":
      return new Date(now.setFullYear(now.getFullYear() + 2));
    case "video":
      return new Date(now.setFullYear(now.getFullYear() + 1));
    case "audio":
      return new Date(now.setMonth(now.getMonth() + 6));
    case "document":
      return new Date(now.setFullYear(now.getFullYear() + 5));
  }
}

async function moveToQuarantine(
  client: S3Client,
  config: StorageConfig,
  sourceKey: string,
  reason: string,
): Promise<void> {
  const destKey = `${reason}/${Date.now()}-${sourceKey.split("/").pop()}`;
  try {
    if (config.driver === "filesystem" || config.provider === "filesystem") {
      const basePath = config.fileSystem?.basePath ?? "./uploads";
      const srcPath = path.join(basePath, config.buckets.staging, sourceKey);
      const destPath = path.join(basePath, config.buckets.quarantine, destKey);
      const destDir = path.dirname(destPath);

      if (fs.existsSync(srcPath)) {
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(srcPath, destPath);
        fs.unlinkSync(srcPath);
      }
      return;
    }

    await client.send(
      new CopyObjectCommand({
        Bucket: config.buckets.quarantine,
        Key: destKey,
        CopySource: `${config.buckets.staging}/${sourceKey}`,
        Metadata: {
          "quarantine-reason": reason,
          "quarantined-at": new Date().toISOString(),
        },
        MetadataDirective: "REPLACE",
      }),
    );
    await safeDeleteStorageObject(client, config, config.buckets.staging, sourceKey);
  } catch {
    // fail open — não bloqueia o fluxo principal
  }
}

async function safeDeleteStorageObject(
  client: S3Client,
  config: StorageConfig,
  bucket: string,
  key: string,
): Promise<void> {
  try {
    if (config.driver === "filesystem" || config.provider === "filesystem") {
      const basePath = config.fileSystem?.basePath ?? "./uploads";
      const filePath = path.join(basePath, bucket, key);
      const resolvedPath = path.resolve(filePath);
      const resolvedBase = path.resolve(basePath);
      if (resolvedPath.startsWith(resolvedBase) && fs.existsSync(resolvedPath)) {
        fs.unlinkSync(resolvedPath);
      }
      return;
    }
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    // best-effort
  }
}

// Helper async para gerar URLs em runtime
export async function buildUrlsForRecord(
  client: S3Client,
  config: StorageConfig,
  record: UploadRecord,
): Promise<{ preview: Partial<Record<Quality, string>>; download: string }> {
  const bucket = bucketForKind(config, record.kind);
  const expiry = config.upload.signedUrlExpirySec;
  const preview: Partial<Record<Quality, string>> = {};

  if (!record.variants) {
    throw new Error("Record has no variants");
  }

  const isFileSystem = config.driver === "filesystem" || config.provider === "filesystem";

  if (isFileSystem) {
    const routePrefix = config.fileSystem?.publicApiRoutePrefix ?? "/api/v1/storage/files";
    for (const q of record.variants) {
      preview[q] = `${routePrefix}/${bucket}/${record.storageKeyPrefix}/${q}`;
    }
    const download = `${routePrefix}/${bucket}/${record.storageKeyPrefix}/lg?download=true&filename=${encodeURIComponent(record.originalFilename)}`;
    return { preview, download };
  }

  for (const q of record.variants) {
    preview[q] = await getSignedPreviewUrl(
      client,
      bucket,
      `${record.storageKeyPrefix}/${q}`,
      expiry,
    );
  }

  // Download SEMPRE do lg (original)
  const download = await getSignedDownloadUrl(
    client,
    bucket,
    `${record.storageKeyPrefix}/lg`,
    record.originalFilename,
    expiry,
  );

  return { preview, download };
}
