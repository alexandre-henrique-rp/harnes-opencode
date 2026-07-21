/**
 * safe-logger.ts
 *
 * Utilitário para log seguro nos plugins e ferramentas do OpenCode SDK / Runtime.
 * Evita exceções não tratadas (como "client.session.log is not a function") quando o
 * cliente do runtime não disponibiliza o método `session.log`.
 */

export interface LogPayload {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Tenta registrar logs no cliente do runtime do OpenCode sem estourar exceções.
 *
 * @param client Objeto client injetado pelo contexto do runtime.
 * @param payload Dados da mensagem de log.
 */
export function safeLog(client: any, payload: LogPayload): void {
  if (!client) return;

  try {
    if (client.session && typeof client.session.log === "function") {
      client.session.log(payload)?.catch?.(() => {});
    } else if (typeof client.log === "function") {
      client.log(payload)?.catch?.(() => {});
    } else if (typeof client.app?.log === "function") {
      client.app.log(payload)?.catch?.(() => {});
    }
  } catch {
    // Fail-silent para garantir resiliência de execução
  }
}
