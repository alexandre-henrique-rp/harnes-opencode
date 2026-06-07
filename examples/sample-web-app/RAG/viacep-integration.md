---
id: viacep-integration
title: Integração com ViaCEP para autocomplete de endereço
description: Como integrar com a API pública do ViaCEP (gratuita, sem auth) com tratamento de erros e rate limit.
category: pattern
tags: [viacep, api-external, cep, address, debounce, error-handling]
scope: project
priority: high
status: approved
source: https://viacep.com.br/
appliesTo: [frontend, backend]
language: pt-BR
createdAt: 2026-06-06T00:00:00Z
updatedAt: 2026-06-06T00:00:00Z
version: 1
changelog:
  - version: 1
    date: 2026-06-06T00:00:00Z
    change: "Initial creation"
---

# Integração com ViaCEP

## 1. Contexto

Quando o cliente digita o CEP no formulário de cadastro, queremos **autopreencher** logradouro, bairro, cidade e UF automaticamente. Usamos a API pública e gratuita do **ViaCEP** (https://viacep.com.br). Esta integração é usada em **2 lugares**: (1) frontend, no `on-blur` do campo CEP; (2) backend, no momento de criar o user (validação secundária).

## 2. Regra

**Frontend** chama ViaCEP diretamente no `on-blur` do campo CEP, com debounce de 500ms. **Backend** re-valida via ViaCEP no momento de criar user (defense in depth — se frontend foi burlado, backend ainda valida). **Ambos** tratam erros: CEP não encontrado, timeout, rede offline.

- **Base URL:** `https://viacep.com.br/ws`
- **Endpoint:** `GET /{cep}/json/` (cep com ou sem hífen)
- **Response 200:** `{ cep, logradouro, complemento, bairro, localidade, uf, ibge, gia, ddd, siafi }`
- **Response 200 (CEP inválido):** `{ erro: true }` (não é 404!)
- **Rate limit:** ViaCEP não tem rate limit oficial, mas recomendamos 1 req/500ms (debounce)
- **Auth:** nenhuma (API pública)

## 3. Por quê

- **UX:** cliente digita só CEP, sistema preenche resto (< 60s de cadastro)
- **Defesa em profundidade:** backend re-valida porque frontend pode ser burlado
- **Custo zero:** ViaCEP é gratuito, mantido pelos Correios
- **Confiável:** API estável há 10+ anos, altíssima disponibilidade

## 4. Como aplicar

**Frontend (React):**

```typescript
// components/MaskedInput.tsx + lib/viacep.ts
import { useState } from "react";

export function CEPField({ onAddressFound }: { onAddressFound: (addr: Address) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBlur = useDebouncedCallback(async (cep: string) => {
    const cleanCEP = cep.replace(/\D/g, "");
    if (cleanCEP.length !== 8) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
      if (!res.ok) throw new Error("ViaCEP indisponível");
      const data = await res.json();
      if (data.erro) {
        setError("CEP não encontrado");
        return;
      }
      onAddressFound({
        logradouro: data.logradouro,
        bairro: data.bairro,
        cidade: data.localidade,
        uf: data.uf,
      });
    } catch (err) {
      setError("Não foi possível buscar o CEP. Preencha manualmente.");
    } finally {
      setLoading(false);
    }
  }, 500);

  return (
    <FormField
      label="CEP"
      mask="#####-###"
      onBlur={handleBlur}
      loading={loading}
      error={error}
    />
  );
}
```

**Backend (Next.js API Route):**

```typescript
// pages/api/users/index.ts
import { fetchViaCEP } from "@/lib/viacep";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const parsed = userCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ errors: parsed.error.flatten() });

  // Re-validar CEP via ViaCEP (defense in depth)
  const address = await fetchViaCEP(parsed.data.cep);
  if (!address) {
    return res.status(422).json({ error: "CEP inválido" });
  }

  const user = await createUser({ ...parsed.data, address });
  return res.status(201).json(user);
}

// lib/viacep.ts (server-side)
export async function fetchViaCEP(cep: string): Promise<Address | null> {
  const cleanCEP = cep.replace(/\D/g, "");
  if (cleanCEP.length !== 8) return null;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`, {
      signal: AbortSignal.timeout(5000),  // 5s timeout
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.erro) return null;
    return {
      logradouro: data.logradouro,
      bairro: data.bairro,
      cidade: data.localidade,
      uf: data.uf,
    };
  } catch {
    return null;  // timeout ou rede — trata como CEP inválido
  }
}
```

## 5. Como NÃO aplicar

```typescript
// NÃO FAÇA ISSO — sem debounce (vai estourar ViaCEP se usuário colar 10 CEPs)
async function handleChange(cep: string) {
  await fetch(`https://viacep.com.br/ws/${cep}/json/`);
}

// NÃO FAÇA ISSO — sem tratamento de erro
const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
const data = await res.json();  // data pode ser { erro: true }!

// NÃO FAÇA ISSO — confiar só no frontend
// Se frontend foi burlado (DevTools, cURL, etc), backend precisa re-validar
app.post("/api/users", (req, res) => {
  // sem re-validação de CEP no backend
  prisma.user.create({ data: req.body });
});
```

## 6. Cross-refs

- `cpf-encryption` — outra integração crítica (no DB)
- `error-handling` — padrão geral de error handling
- `api-security` — rate limit no backend

## 7. Última validação

- **Quando:** 2026-06-06
- **Por:** rag-curator agent
- **Evidência:** https://viacep.com.br/ (documentação oficial, acesso 2026-06-06)
- **Próxima revisão:** quando migrarem para API autenticada (se um dia)
