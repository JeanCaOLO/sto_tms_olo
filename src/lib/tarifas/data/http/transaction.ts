// Envío de una transacción (`POST /tarifas/tx`): inserciones agrupadas, vuelta atrás y tiempo máximo propio.

import { isUnsupported, markUnsupported, throwTransactionError } from './errors';
import { coalesceInserts } from './coalesce';
import {
  DEFAULT_TX_TIMEOUT_MS, fetchWithRetry, type HttpDataSourceOptions, type TransportConfig, type TxOperation,
} from './transport';

/**
 * Las inserciones seguidas de una tabla viajan juntas (`insert_many`); si el backend todavía no conoce esa
 * operación (400 antes de tocar la BD) se repite como operaciones sueltas y se recuerda. Sin reintentos de
 * red: una transacción repetida a ciegas podría aplicarse dos veces.
 */
export async function sendTransaction(
  transport: TransportConfig,
  options: HttpDataSourceOptions,
  url: string,
  headers: Record<string, string>,
  operations: TxOperation[],
  flag: string,
): Promise<void> {
  const config = { ...transport, timeoutMs: options.txTimeoutMs ?? DEFAULT_TX_TIMEOUT_MS };
  const post = (ops: TxOperation[]) => fetchWithRetry(
    config,
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ ops }) },
    false,
  );

  const grouped = isUnsupported(flag) ? operations : coalesceInserts(operations);
  let response = await post(grouped);
  if (response.status === 400 && grouped.length !== operations.length) {
    const plain = await post(operations);
    if (plain.ok) markUnsupported(flag);
    response = plain;
  }
  if (!response.ok) await throwTransactionError(response);
}
