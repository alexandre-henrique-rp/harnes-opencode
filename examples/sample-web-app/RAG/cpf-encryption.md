---
id: cpf-encryption
title: Criptografia de CPF em repouso (AES-256)
description: Como armazenar CPF criptografado com AES-256-GCM, incluindo rotação de chaves.
category: security
tags: [cpf, encryption, aes-256, lgpd, security, crypto]
scope: project
priority: critical
status: approved
source: OWASP A02 Cryptographic Failures + LGPD Art. 46
appliesTo: [backend, database]
language: pt-BR
createdAt: 2026-06-06T00:00:00Z
updatedAt: 2026-06-06T00:00:00Z
version: 1
changelog:
  - version: 1
    date: 2026-06-06T00:00:00Z
    change: "Initial creation"
---

# Criptografia de CPF em repouso (AES-256-GCM)

## 1. Contexto

O CPF é um **dado pessoal sensível** (LGPD Art. 5º, II). Se o banco vazar (acesso não autorizado, backup exposto, SQL injection), o impacto é devastador: **todos os clientes ficam expostos a fraude, golpe e roubo de identidade**. Mesmo com TLS 1.3 em trânsito, dados em repouso no banco precisam estar criptografados.

## 2. Regra

**Todo CPF armazenado no banco DEVE estar criptografado com AES-256-GCM.** A chave mestra fica em variável de ambiente (ou KMS em produção). Cada registro tem um **IV único** (12 bytes) e um **auth tag** (16 bytes) que validam integridade.

- **Algoritmo:** AES-256-GCM
- **Tamanho da chave:** 256 bits (32 bytes)
- **IV:** 96 bits (12 bytes) — gerado randomicamente por registro
- **Auth tag:** 128 bits (16 bytes) — validado na leitura
- **Encoding do ciphertext:** base64 (com IV e tag concatenados)
- **Formato no DB:** `STRING` (255 chars) — não precisa coluna separada

## 3. Por quê

- **LGPD Art. 46:** "Os agentes de tratamento devem adotar medidas de segurança, técnicas e administrativas, aptas a proteger os dados pessoais de acessos não autorizados e de situações acidentais ou ilícitas de destruição, perda, alteração, comunicação ou qualquer forma de tratamento inadequado ou excessivo."
- **OWASP A02:** Cryptographic Failures (Top 10 2021)
- **Princípio do menor privilégio:** mesmo DBA com acesso ao banco não consegue ler CPFs sem a chave

## 4. Como aplicar

```typescript
// lib/crypto.ts
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY = Buffer.from(process.env.CPF_ENCRYPTION_KEY!, "hex");  // 32 bytes

export function encryptCPF(plainCPF: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainCPF, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // formato: base64(iv || tag || ciphertext)
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptCPF(encryptedCPF: string): string {
  const data = Buffer.from(encryptedCPF, "base64");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

// lib/cpfValidator.ts
import { cpf } from "cpf-cnpj-validator";  // lib externa, verificar licença

export function isValidCPF(cpfStr: string): boolean {
  return cpf.isValid(cpfStr.replace(/\D/g, ""));
}
```

```typescript
// services/userCreator.ts
import { encryptCPF, isValidCPF } from "@/lib/crypto";

export async function createUser(input: UserInput) {
  if (!isValidCPF(input.cpf)) {
    throw new ValidationError("CPF inválido");
  }

  const cpfEncrypted = encryptCPF(input.cpf);
  // IMPORTANTE: nunca log o CPF plain
  return prisma.user.create({
    data: {
      cpfEncrypted,  // armazenado cifrado
      name: input.name,
      email: input.email,
      cep: input.cep,
      createdAt: new Date(),
    },
  });
}
```

## 5. Como NÃO aplicar

```typescript
// NÃO FAÇA ISSO
const userSchema = z.object({
  cpf: z.string(),  // plain text
});

await prisma.user.create({
  data: { cpf: req.body.cpf },  // plain no banco
});

// NÃO FAÇA ISSO
const KEY = "minha-chave-secreta";  // hardcoded, não hex de 32 bytes
const cipher = crypto.createCipher("aes-256-cbc", KEY);  // CBC sem auth tag

// NÃO FAÇA ISSO
console.log("User created:", user.cpf);  // log de CPF plain
```

## 6. Cross-refs

- `lgpd-consentimento` — base legal
- `api-security` — TLS 1.3 em trânsito, complementar à criptografia em repouso
- `hardcoded-secrets` — chave de criptografia NUNCA hardcoded

## 7. Última validação

- **Quando:** 2026-06-06
- **Por:** rag-curator agent
- **Evidência:** OWASP Top 10 2021, NIST SP 800-38D (GCM), LGPD Art. 46
- **Próxima revisão:** quando rotação de chaves for implementada (próxima sprint)
