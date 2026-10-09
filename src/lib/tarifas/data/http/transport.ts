// Transporte del driver HTTP: tiempo máximo, reintentos de lecturas y métricas.

import type { Row } from '../datasource';
import { recordRequest, recordRetry, recordTimeout } from '../metrics';

export type RequestInit = NonNullable<Parameters<typeof fetch>[1]>;

export interface HttpDataSourceOptions {
  /** URL base de la API, sin barra final. */
  baseUrl: string;
  /** Cabeceras extra (autorización, tenant). Se evalúa en cada request, no una sola vez. */
  headers?: () => Record<string, string>;
  fetchImpl?: typeof fetch;
  /** Tiempo máximo de una llamada, en ms. Por defecto 20 s (el Lambda corta a los 15 s). */
  timeoutMs?: number;
  /** Reintentos de una LECTURA que falló por red, timeout o 502/503/504. Por defecto 2. */
  retries?: number;
  /** Espera base entre reintentos, en ms (se multiplica por el número de reintento). Por defecto 300. */
  retryDelayMs?: number;
}

/** Una escritura acumulada dentro de una transacción. */
export interface TxOperation {
  op: 'insert' | 'update' | 'delete';
  table: string;
  id?: string;
  values?: Row;
}

export interface TransportConfig {
  fetchImpl: typeof fetch;
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
}

export const DEFAULT_TIMEOUT_MS = 20_000;
export const DEFAULT_RETRIES = 2;
export const DEFAULT_RETRY_DELAY_MS = 300;
/** Una consulta cuya URL supera esto viaja por POST (los gateways cortan alrededor de 8 KB). */
export const MAX_QUERY_URL_CHARS = 6_000;
const RETRY_STATUSES = new Set([502, 503, 504]);

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

/**
 * Una llamada con tiempo máximo y métricas. Si `retryable`, repite ante red/timeout/502-504; si no,
 * un solo intento. Devuelve la respuesta (buena o mala): interpretarla es de quien llama.
 */
export async function fetchWithRetry(
  config: TransportConfig,
  url: string,
  init: RequestInit,
  retryable: boolean,
): Promise<Response> {
  const maxRetries = retryable ? config.retries : 0;
  for (let attempt = 0; ; attempt += 1) {
    const last = attempt >= maxRetries;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    const startedAt = performance.now();
    try {
      const response = await config.fetchImpl(url, { ...init, signal: controller.signal });
      recordRequest(performance.now() - startedAt, response.ok || response.status < 500);
      if (last || !RETRY_STATUSES.has(response.status)) return response;
    } catch (error) {
      const timedOut = controller.signal.aborted;
      recordRequest(performance.now() - startedAt, false);
      if (timedOut) recordTimeout();
      if (last) {
        throw timedOut
          ? new Error(`La API no respondió en ${Math.round(config.timeoutMs / 1000)} s. Probá de nuevo en un momento.`)
          : error;
      }
    } finally {
      clearTimeout(timer);
    }
    recordRetry();
    await sleep(config.retryDelayMs * (attempt + 1));
  }
}
