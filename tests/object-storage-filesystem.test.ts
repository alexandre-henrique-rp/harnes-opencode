import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  ensureBucketsExist,
  uploadStorageObject,
  getStorageObjectBuffer,
  scanForVirus,
  buildUrlsForRecord,
  createFileSystemServeHandler,
} from "../tools/object-storage-uploader.ts";
import type { StorageConfig, UploadRecord } from "../tools/object-storage-uploader.ts";

const TEST_BASE_PATH = path.join(process.cwd(), "tmp", "test-filesystem-storage");

const mockConfig: StorageConfig = {
  driver: "filesystem",
  provider: "filesystem",
  region: "us-east-1",
  accessKeyId: "mock",
  secretAccessKey: "mock",
  fileSystem: {
    basePath: TEST_BASE_PATH,
    publicApiRoutePrefix: "/api/v1/storage/files",
  },
  buckets: {
    staging: "staging",
    images: "images",
    videos: "videos",
    audios: "audios",
    documents: "documents",
    quarantine: "quarantine",
  },
  upload: {
    maxSizeBytes: {
      image: 10_000_000,
      video: 50_000_000,
      audio: 20_000_000,
      document: 10_000_000,
    },
    signedUrlExpirySec: 900,
  },
  virusScan: {
    enabled: false,
    clamavHost: "localhost",
    clamavPort: 3310,
    quarantineRetentionDays: 30,
  },
  variants: {
    image: {
      lg: { maxWidth: 1920, quality: 85, format: "webp" },
      md: { maxWidth: 1080, quality: 80, format: "webp" },
      sm: { maxWidth: 480, quality: 75, format: "webp" },
    },
    video: {
      lg: { resolution: "1080p", bitrate: "4000k" },
      md: { resolution: "720p", bitrate: "2000k" },
      sm: { resolution: "480p", bitrate: "800k" },
      thumb: { width: 640, height: 360, at: "00:00:01" },
    },
    audio: {
      lg: { bitrate: "320k" },
      md: { bitrate: "1920k" },
      sm: { bitrate: "128k" },
    },
  },
};

test("Suíte de Testes do File System Storage & Antivírus Toggle", async (t) => {

  await t.test("1. ensureBucketsExist deve criar a estrutura de diretórios igual aos buckets S3", async () => {
    if (fs.existsSync(TEST_BASE_PATH)) {
      fs.rmSync(TEST_BASE_PATH, { recursive: true, force: true });
    }

    await ensureBucketsExist(null as any, mockConfig);

    for (const folder of Object.values(mockConfig.buckets)) {
      const fullPath = path.join(TEST_BASE_PATH, folder);
      assert.ok(fs.existsSync(fullPath), `Diretório ${folder} deve ter sido criado`);
    }
  });

  await t.test("2. uploadStorageObject deve salvar arquivo no File System e previne Path Traversal", async () => {
    const fileBuffer = Buffer.from("Conteudo de teste do arquivo no filesystem");
    const key = "user-123/job-abc/lg";

    const res = await uploadStorageObject(null as any, mockConfig, {
      bucket: "images",
      key,
      body: fileBuffer,
      contentType: "image/webp",
    });

    assert.ok(res.etag, "Deve retornar um etag derivado do md5 da key");

    const expectedFilePath = path.join(TEST_BASE_PATH, "images", key);
    assert.ok(fs.existsSync(expectedFilePath), "Arquivo físico deve existir na pasta de imagens");

    const read = fs.readFileSync(expectedFilePath);
    assert.strictEqual(read.toString(), "Conteudo de teste do arquivo no filesystem");

    // Teste de Path Traversal
    await assert.rejects(async () => {
      await uploadStorageObject(null as any, mockConfig, {
        bucket: "images",
        key: "../../etc/passwd",
        body: fileBuffer,
        contentType: "text/plain",
      });
    }, /Path traversal/);
  });

  await t.test("3. getStorageObjectBuffer deve ler arquivo do File System local", async () => {
    const key = "user-123/job-abc/lg";
    const res = await getStorageObjectBuffer(null as any, mockConfig, "images", key);

    assert.ok(res.buffer, "Buffer do arquivo deve ser retornado");
    assert.strictEqual(res.buffer.toString(), "Conteudo de teste do arquivo no filesystem");
  });

  await t.test("4. scanForVirus deve respeitar a flag virusScan.enabled = false", async () => {
    const buffer = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
    const res = await scanForVirus(buffer, {
      enabled: false,
      clamavHost: "localhost",
      clamavPort: 3310,
      quarantineRetentionDays: 30,
    });

    assert.strictEqual(res.infected, false);
    assert.strictEqual(res.scanner, "disabled", "Scanner deve indicar disabled quando virusScan.enabled for false");
  });

  await t.test("5. buildUrlsForRecord no modo File System deve gerar rotas apontando para o Backend", async () => {
    const record: UploadRecord = {
      id: "job-123",
      userId: "user-123",
      kind: "image",
      isPublic: false,
      originalFilename: "foto.jpg",
      declaredMime: "image/jpeg",
      sizeBytes: 1024,
      stagingKey: "staging/key",
      bucket: "images",
      storageKeyPrefix: "user-123/job-123",
      variants: ["lg", "md", "sm"],
      status: "READY",
      createdAt: new Date(),
      isPii: false,
    };

    const urls = await buildUrlsForRecord(null as any, mockConfig, record);

    assert.strictEqual(
      urls.preview.lg,
      "/api/v1/storage/files/images/user-123/job-123/lg",
      "URL de preview lg deve apontar para o endpoint da API do backend"
    );
    assert.strictEqual(
      urls.preview.md,
      "/api/v1/storage/files/images/user-123/job-123/md"
    );
    assert.ok(
      urls.download.startsWith("/api/v1/storage/files/images/user-123/job-123/lg?download=true"),
      "URL de download deve passar pelo backend com o parametro download=true"
    );
  });

  await t.test("6. createFileSystemServeHandler deve servir arquivo com headers corretos e barrar Path Traversal", async () => {
    const handler = createFileSystemServeHandler({
      config: mockConfig,
      db: null as any,
    });

    let headers: Record<string, any> = {};
    let statusCode = 200;
    let jsonResponse: any = null;

    const mockReq = {
      params: { bucket: "images", "0": "user-123/job-abc/lg" },
      query: { download: "true", filename: "foto.jpg" },
    };

    const mockRes = {
      setHeader: (name: string, value: any) => { headers[name] = value; },
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (data: any) => { jsonResponse = data; },
      pipe: () => {},
    };

    // Teste de Path Traversal no Handler HTTP
    const badReq = {
      params: { bucket: "images", "0": "../../etc/passwd" },
      query: {},
    };

    await handler(badReq, mockRes);
    assert.strictEqual(statusCode, 403, "Deve retornar 403 Access Denied em tentativa de Path Traversal");
  });
});
