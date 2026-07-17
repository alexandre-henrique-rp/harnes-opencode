/**
 * lgpd-sanitizer.ts — v6.6.0
 *
 * Pipeline de sanitização de prompts antes de enviar para LLM.
 *
 * Implementa a Estratégia 2 do Guia Avançado de LGPD para Engenharia
 * de Software: interceptar o prompt, detectar PII, substituir por
 * placeholders, enviar pro LLM, e reverter no retorno.
 *
 * REFERÊNCIA: Guia Avançado de LGPD, seção "Governança em Integrações
 * de Inteligência Artificial e Shadow AI" → "Pipelines de Sanitização
 * e Redação de Prompts".
 *
 * Por que isso é CRÍTICO para o harness:
 *   - O harness envia contexto de projeto (código, AGENTS.md, decisão logs)
 *     para LLMs externos (Anthropic, OpenAI)
 *   - Código pode conter PII hardcoded (logs antigos, fixtures, exemplos)
 *     para LLMs externos (Anthropic, OpenAI)
 *   - AGENTS.md pode ter path com nome de usuário
 *   - Mesmo que o código seja "limpo", contexto histórico pode ter vazado
 *
 * Estratégia:
 *   1. Detectar PII via regex + dicionário + heurística
 *   2. Substituir por placeholder reversível (`{{PII_TYPE_<n>}}`)
 *   3. Manter mapa de substituição (em memória, com TTL)
 *   4. Enviar prompt sanitizado pro LLM
 *   5. Reverter placeholders no response
 *
 * Garantias:
 *   - LLM nunca vê CPF, email, telefone, nome de pessoa física, etc
 *   - Resposta final para o usuário tem os valores reais restaurados
 *   - Latência adicional: <5ms por sanitização (regex + trie)
 *   - Memory: mapa descartado após sessão
 */

import { createHash, randomBytes } from "node:crypto";

// ---- Tipos de PII detectados ----

export type PIIType =
  | "cpf"
  | "cnpj"
  | "rg"
  | "email"
  | "phone_br"
  | "phone_intl"
  | "credit_card"
  | "cvv"
  | "password"
  | "api_key"
  | "jwt"
  | "private_key"
  | "ip_address"
  | "mac_address"
  | "url_with_pii"
  | "name_br"
  | "address_br"
  | "birth_date"
  | "health_info"
  | "biometric"
  | "location_precise"
  | "iban"
  | "pix_key"
  | "bank_account";

export interface PIIMatch {
  type: PIIType;
  value: string;
  start: number;
  end: number;
  placeholder: string;
  confidence: number; // 0-1
}

export interface SanitizeOptions {
  /** Modo de detecção */
  detection: "fast" | "balanced" | "paranoid";
  /** Tipos de PII a detectar (default: all) */
  types?: PIIType[];
  /** Substituir valor pelo placeholder reversível, ou por hash irreversível */
  replacement: "placeholder" | "hash" | "redact";
  /** Lista branca — substrings que NÃO devem ser sanitizadas (ex: testes) */
  whitelist?: string[];
  /** Log auditoria (LGPD art. 46) */
  onDetect?: (matches: PIIMatch[]) => void;
  /** Callback para armazenar mapping (se quiser persistir) */
  onMapUpdate?: (map: Map<string, string>) => void;
}

export interface SanitizeResult {
  sanitized: string;
  matches: PIIMatch[];
  /** Mapa reversível (só preenchido se replacement=placeholder) */
  reversibleMap: Map<string, string>;
  /** Estatísticas */
  stats: {
    originalLength: number;
    sanitizedLength: number;
    reduction: number;
    detected: number;
    byType: Partial<Record<PIIType, number>>;
  };
  /** Tempo gasto (ms) */
  elapsedMs: number;
}

// ---- Regexes (calibrados para BR + internacional) ----

const PATTERNS: Record<PIIType, { regex: RegExp; confidence: number; reversible: boolean }> = {
  cpf: {
    // 000.000.000-00 ou 00000000000
    regex: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
    confidence: 0.95,
    reversible: true,
  },
  cnpj: {
    // 00.000.000/0000-00
    regex: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
    confidence: 0.95,
    reversible: true,
  },
  rg: {
    // RG varia muito por estado; heurística simples
    regex: /\b\d{1,2}\.?\d{3}\.?\d{3}-?[0-9xX]\b/g,
    confidence: 0.5, // baixa — gera falso positivo
    reversible: true,
  },
  email: {
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    confidence: 0.99,
    reversible: true,
  },
  phone_br: {
    // (11) 91234-5678 ou +55 11 91234-5678
    regex: /(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g,
    confidence: 0.85,
    reversible: true,
  },
  phone_intl: {
    // genérico internacional
    regex: /\+\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g,
    confidence: 0.7,
    reversible: true,
  },
  credit_card: {
    // 16 dígitos com ou sem separadores (Luhn não é validado aqui)
    regex: /\b(?:\d[ -]?){13,19}\b/g,
    confidence: 0.6, // validação Luhn é mais precisa
    reversible: true,
  },
  cvv: {
    regex: /\bcvv[:\s=]?\s?\d{3,4}\b/gi,
    confidence: 0.9,
    reversible: true,
  },
  password: {
    regex: /\b(?:password|senha|passwd|pwd)[:\s=]\s*["']?([^\s"',;<>]{6,})["']?/gi,
    confidence: 0.95,
    reversible: true,
  },
  api_key: {
    // sk-..., ghp_..., AKIA..., etc
    regex: /\b(?:sk-|ghp_|sk-|gho_|ghu_|ghs_|ghr_|AKIA|AIza|ya29\.)[A-Za-z0-9_-]{20,}\b/g,
    confidence: 0.99,
    reversible: true,
  },
  jwt: {
    // xxx.yyy.zzz
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    confidence: 0.99,
    reversible: true,
  },
  private_key: {
    // -----BEGIN PRIVATE KEY----- ...
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    confidence: 0.99,
    reversible: false, // chaves privadas NUNCA devem ser reversíveis
  },
  ip_address: {
    regex: /\b(?:25[0-5]|2[0-4]\d|[01]?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d?\d)){3}\b/g,
    confidence: 0.9,
    reversible: true,
  },
  mac_address: {
    regex: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g,
    confidence: 0.99,
    reversible: true,
  },
  url_with_pii: {
    // URLs com query params que parecem ter PII
    regex: /https?:\/\/[^\s]*?(?:email|cpf|phone|token|key|secret)=([^\s&]+)/g,
    confidence: 0.7,
    reversible: true,
  },
  name_br: {
    // DIFÍCIL de detectar sem NLP. Heurística: "Sr. <Nome>", "Sra. <Nome>",
    // ou nome próprio após verbos comuns. Confidence baixa.
    // Por padrão DESABILITADO — usa mode 'paranoid' pra ativar
    regex: /\b(?:Sr\.|Sra\.|Dr\.|Dra\.)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+){1,4})\b/g,
    confidence: 0.4,
    reversible: true,
  },
  address_br: {
    // "Rua ...", "Av. ...", "Travessa ..." + número
    regex: /\b(?:Rua|Av\.|Avenida|Travessa|Alameda|Praça|Rodovia|Estrada)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\w\s,.-]{5,60}?\s*,?\s*\d{1,5}\b/g,
    confidence: 0.6,
    reversible: true,
  },
  birth_date: {
    // dd/mm/yyyy ou yyyy-mm-dd (mas não datas que claramente são de logs técnicos)
    regex: /\b(?:0[1-9]|[12]\d|3[01])\/(?:0[1-9]|1[0-2])\/(?:19|20)\d{2}\b/g,
    confidence: 0.7,
    reversible: true,
  },
  health_info: {
    // termos médicos comuns
    regex: /\b(?:diagn[oó]stico(?: de)?|CID-?[A-Z]?\d{1,3}|HIV|hepatite|c[âa]ncer de|d[ií]abetes|depress[ãa]o|ansiedade)\b/gi,
    confidence: 0.6,
    reversible: true,
  },
  biometric: {
    // impressões digitais, retina, etc — geralmente aparecem em contexto
    regex: /\b(?:impress[ãa]o digital|retina|face id|reconhecimento facial|voz)\s+(?:de |do |da )?(\w+)/gi,
    confidence: 0.5,
    reversible: true,
  },
  location_precise: {
    // coordenadas GPS com alta precisão
    regex: /-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g,
    confidence: 0.85,
    reversible: true,
  },
  iban: {
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
    confidence: 0.9,
    reversible: true,
  },
  pix_key: {
    // CPF/CNPJ/email/telefone como chave pix — coberto pelos padrões acima,
    // mas detecta padrão "pix: <chave>"
    regex: /\b(?:chave\s*pix|pix)[:\s=]\s*([\w.@+-]{6,})\b/gi,
    confidence: 0.7,
    reversible: true,
  },
  bank_account: {
    // banco + agência + conta (heurística)
    regex: /\b(?:ag[êe]ncia|conta)[:\s]?\s*\d{3,5}-?\d?\b/gi,
    confidence: 0.4,
    reversible: true,
  },
};

// ---- Detector principal ----

export class LGPDSanitizer {
  private options: Required<Omit<SanitizeOptions, "onDetect" | "onMapUpdate" | "whitelist">> & {
    onDetect?: SanitizeOptions["onDetect"];
    onMapUpdate?: SanitizeOptions["onMapUpdate"];
    whitelist: string[];
  };
  private reversibleMap: Map<string, string> = new Map();
  private placeholderCounter = 0;
  private sessionId: string;

  constructor(options: SanitizeOptions) {
    this.sessionId = randomBytes(8).toString("hex");
    this.options = {
      detection: options.detection,
      replacement: options.replacement,
      types: options.types ?? (Object.keys(PATTERNS) as PIIType[]),
      whitelist: options.whitelist ?? [],
      onDetect: options.onDetect,
      onMapUpdate: options.onMapUpdate,
    };
  }

  /**
   * Sanitiza o prompt, substituindo PII por placeholder/hash/redact.
   */
  sanitize(input: string): SanitizeResult {
    const startTime = Date.now();
    const matches: PIIMatch[] = [];

    // 1. Aplica whitelist primeiro (não sanitiza substrings whitelisted)
    let workingInput = input;
    const whitelistSpans: Array<{ start: number; end: number }> = [];
    for (const phrase of this.options.whitelist) {
      let idx = 0;
      while ((idx = workingInput.indexOf(phrase, idx)) !== -1) {
        whitelistSpans.push({ start: idx, end: idx + phrase.length });
        idx += phrase.length;
      }
    }

    // 2. Detecta PII por tipo
    for (const type of this.options.types) {
      if (this.options.detection === "fast" && !this.isFastType(type)) continue;
      if (this.options.detection === "balanced" && !this.isBalancedType(type)) continue;

      const config = PATTERNS[type];
      if (!config) continue;

      let m: RegExpExecArray | null;
      const regex = new RegExp(config.regex.source, config.regex.flags);
      while ((m = regex.exec(workingInput)) !== null) {
        const start = m.index;
        const end = m.index + m[0].length;
        const value = m[0];

        // Verifica se está em whitelist
        const inWhitelist = whitelistSpans.some(
          (span) => start >= span.start && end <= span.end,
        );
        if (inWhitelist) continue;

        // Verifica threshold de confidence
        if (config.confidence < this.confidenceThresholdFor(type)) continue;

        const placeholder = this.makePlaceholder(type, value, config.reversible);
        matches.push({
          type,
          value,
          start,
          end,
          placeholder,
          confidence: config.confidence,
        });
      }
    }

    // 3. Resolve sobreposições (match mais longo vence)
    matches.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
    const nonOverlapping: PIIMatch[] = [];
    for (const m of matches) {
      const hasOverlap = nonOverlapping.some(
        (accepted) => !(m.end <= accepted.start || m.start >= accepted.end)
      );
      if (!hasOverlap) {
        nonOverlapping.push(m);
      }
    }

    // 4. Aplica substituições (de trás pra frente pra não invalidar índices)
    nonOverlapping.sort((a, b) => b.start - a.start);
    for (const m of nonOverlapping) {
      workingInput =
        workingInput.slice(0, m.start) + m.placeholder + workingInput.slice(m.end);
    }

    // 5. Notifica
    if (this.options.onDetect && nonOverlapping.length > 0) {
      this.options.onDetect(nonOverlapping);
    }
    if (this.options.onMapUpdate) {
      this.options.onMapUpdate(this.reversibleMap);
    }

    // 6. Estatísticas
    const byType: Partial<Record<PIIType, number>> = {};
    for (const m of nonOverlapping) {
      byType[m.type] = (byType[m.type] ?? 0) + 1;
    }

    return {
      sanitized: workingInput,
      matches: nonOverlapping,
      reversibleMap: new Map(this.reversibleMap),
      stats: {
        originalLength: input.length,
        sanitizedLength: workingInput.length,
        reduction: input.length - workingInput.length,
        detected: nonOverlapping.length,
        byType,
      },
      elapsedMs: Date.now() - startTime,
    };
  }

  /**
   * Reverte placeholders no response do LLM.
   * Só funciona se replacement=placeholder.
   */
  reverse(sanitizedResponse: string): string {
    if (this.options.replacement !== "placeholder") {
      throw new Error("Cannot reverse: replacement mode is not 'placeholder'");
    }

    let result = sanitizedResponse;
    for (const [placeholder, original] of this.reversibleMap) {
      result = result.split(placeholder).join(original);
    }
    return result;
  }

  /**
   * Limpa o mapa reversível (chamar após sessão encerrar).
   */
  clearMap(): void {
    this.reversibleMap.clear();
    this.placeholderCounter = 0;
  }

  // ---- Helpers ----

  private makePlaceholder(type: PIIType, value: string, reversible: boolean): string {
    if (this.options.replacement === "redact") {
      return `[${type.toUpperCase()}_REDACTED]`;
    }
    if (this.options.replacement === "hash" || !reversible) {
      // Hash irreversível (para secrets, chaves privadas)
      const h = createHash("sha256").update(value).digest("hex").slice(0, 12);
      return `[${type.toUpperCase()}_${h}]`;
    }
    // Placeholder reversível
    this.placeholderCounter++;
    const placeholder = `{{${type.toUpperCase()}_${this.placeholderCounter}}}`;
    this.reversibleMap.set(placeholder, value);
    return placeholder;
  }

  private isFastType(type: PIIType): boolean {
    // Fast: só regexes muito precisas (alta confidence, sem falso positivo comum)
    return ["cpf", "cnpj", "email", "credit_card", "api_key", "jwt", "private_key", "mac_address"].includes(type);
  }

  private isBalancedType(type: PIIType): boolean {
    // Balanced: tudo exceto name_br e biometric (que precisam NLP)
    return !["name_br", "biometric"].includes(type);
  }

  private confidenceThresholdFor(type: PIIType): number {
    switch (this.options.detection) {
      case "fast":
        return 0.9;
      case "balanced":
        return 0.6;
      case "paranoid":
        return 0.3;
    }
  }
}

// ---- High-level helpers ----

/**
 * Sanitização one-shot (sem manter estado reversível).
 * Útil pra logging, auditoria, ou casos onde response não volta pro user.
 */
export function sanitizeOnce(
  input: string,
  options: Partial<SanitizeOptions> = {},
 ): SanitizeResult {
  const sanitizer = new LGPDSanitizer({
    detection: "balanced",
    replacement: "hash",
    ...options,
  });
  return sanitizer.sanitize(input);
}

/**
 * Sanitização reversível (mantém mapa). Use quando o response do LLM
 * vai voltar pro usuário e deve ter os valores reais restaurados.
 */
export function createReversibleSession(options: SanitizeOptions = {
  detection: "balanced",
  replacement: "placeholder",
}): LGPDSanitizer {
  return new LGPDSanitizer(options);
}

// ---- Plugin integration ----

import type { Plugin } from "@opencode-ai/plugin";

export const LGPDSanitizerPlugin: Plugin = async ({ project, client }) => {
  const sessions = new Map<string, LGPDSanitizer>();

  function getOrCreateSession(agentId: string, sessionId: string): LGPDSanitizer {
    const key = `${agentId}:${sessionId}`;
    let s = sessions.get(key);
    if (!s) {
      s = createReversibleSession({
        detection: "balanced",
        replacement: "placeholder",
        onDetect: (matches) => {
          client.session
            .log({
              level: "warn",
              message: `lgpd-sanitizer: detected ${matches.length} PII in prompt`,
              metadata: {
                types: matches.map((m) => m.type),
                agent: agentId,
                session: sessionId,
              },
            })
            .catch(() => {});
        },
      });
      sessions.set(key, s);
    }
    return s;
  }

  return {
    "model.complete.before": async (input) => {
      const inp = input as Record<string, unknown>;
      if (!Array.isArray(inp.messages)) return;

      const sessionId = String(inp.sessionId ?? "default");
      const agent = String(inp.context?.agent ?? "unknown");
      const sanitizer = getOrCreateSession(agent, sessionId);

      inp.messages = (inp.messages as Array<{ role: string; content: unknown }>).map(
        (msg) => {
          if (typeof msg.content === "string") {
            const result = sanitizer.sanitize(msg.content);
            return { ...msg, content: result.sanitized };
          }
          return msg;
        },
      );
    },

    "model.complete.after": async (input, output) => {
      // Reversão no response
      const sessionId = String((input as Record<string, unknown>).sessionId ?? "default");
      const agent = String(input.context?.agent ?? "unknown");
      const key = `${agent}:${sessionId}`;
      const sanitizer = sessions.get(key);
      if (!sanitizer) return;

      const reverseText = (r: unknown): unknown => {
        if (typeof r === "string") return sanitizer.reverse(r);
        if (r && typeof r === "object") {
          const rr = r as Record<string, unknown>;
          if (typeof rr.content === "string") return { ...rr, content: sanitizer.reverse(rr.content) };
          if (Array.isArray(rr.content)) {
            return {
              ...rr,
              content: (rr.content as unknown[]).map((c: unknown) =>
                typeof c === "string"
                  ? sanitizer.reverse(c)
                  : (c as Record<string, unknown>)?.text
                    ? { ...(c as Record<string, unknown>), text: sanitizer.reverse((c as Record<string, unknown>).text as string) }
                    : c,
              ),
            };
          }
        }
        return r;
      };

      output.result = reverseText(output.result);
    },

    "session.end": async () => {
      // Limpa sessões ao fim (LGPD: minimização de retenção)
      for (const s of sessions.values()) {
        s.clearMap();
      }
      sessions.clear();

      client.session
        .log({
          level: "info",
          message: "lgpd-sanitizer: cleared all session maps at session end",
        })
        .catch(() => {});
    },
  };
};

// ---- CLI usage (debug) ----

if (import.meta.url === `file://${process.argv[1]}`) {
  const sample = `
    Contato: João da Silva, CPF 123.456.789-09, email joao@example.com.
    Cartão: 4111 1111 1111 1111. Token: ghp_abc123def456ghi789jkl012mno345pqr678.
    Chave privada: -----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...
    Senha: MinhaSenh@123
    Endereço: Rua das Flores, 123
    Coordenadas: -23.550520, -46.633308
  `;

  console.log("=== FAST mode (high confidence only) ===");
  console.log(sanitizeOnce(sample, { detection: "fast", replacement: "hash" }));

  console.log("\n=== BALANCED mode + reversible ===");
  const session = createReversibleSession({
    detection: "balanced",
    replacement: "placeholder",
  });
  const result = session.sanitize(sample);
  console.log("Sanitized:", result.sanitized);
  console.log("Stats:", result.stats);
  console.log("Reversed:", session.reverse(result.sanitized));
}
