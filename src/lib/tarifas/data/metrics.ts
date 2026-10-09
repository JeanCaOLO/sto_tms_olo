// Métricas de la capa de datos del tarifador, en memoria y por sesión del navegador.
//
// Responden las preguntas que importan al optimizar: ¿cuántas llamadas a la API hace un cálculo?,
// ¿cuánto tardan?, ¿cuántas se reintentaron o vencieron?, ¿el caché del catálogo está acertando?
// Del lado del servidor, `backend/tarifas/src/tarifas_metrics.py` publica las suyas en CloudWatch.
//
// Uso desde la consola del navegador o un test:
//   const antes = getTarifasMetrics(); …hacer algo…; diffMetrics(antes, getTarifasMetrics())

export interface TarifasMetrics {
  /** Llamadas a la API (cada intento cuenta, los reintentos incluidos). */
  requests: number;
  /** Intentos que terminaron en error de red, timeout o un estado de error. */
  failures: number;
  /** Reintentos automáticos de lecturas. */
  retries: number;
  /** Intentos cancelados por superar el tiempo máximo. */
  timeouts: number;
  /** Llamadas `/batch` (varias lecturas en una). */
  batches: number;
  /** Lecturas que la agrupación en `/batch` evitó como llamadas sueltas. */
  savedByBatch: number;
  totalMs: number;
  maxMs: number;
  catalogHits: number;
  catalogMisses: number;
}

const empty = (): TarifasMetrics => ({
  requests: 0, failures: 0, retries: 0, timeouts: 0, batches: 0, savedByBatch: 0,
  totalMs: 0, maxMs: 0, catalogHits: 0, catalogMisses: 0,
});

let current = empty();

export function getTarifasMetrics(): Readonly<TarifasMetrics> {
  return { ...current };
}

export function resetTarifasMetrics(): void {
  current = empty();
}

/** Lo que cambió entre dos fotos (`maxMs` queda con el valor más reciente). */
export function diffMetrics(before: TarifasMetrics, after: TarifasMetrics): TarifasMetrics {
  return {
    requests: after.requests - before.requests,
    failures: after.failures - before.failures,
    retries: after.retries - before.retries,
    timeouts: after.timeouts - before.timeouts,
    batches: after.batches - before.batches,
    savedByBatch: after.savedByBatch - before.savedByBatch,
    totalMs: after.totalMs - before.totalMs,
    maxMs: after.maxMs,
    catalogHits: after.catalogHits - before.catalogHits,
    catalogMisses: after.catalogMisses - before.catalogMisses,
  };
}

export function recordRequest(ms: number, ok: boolean): void {
  current.requests += 1;
  current.totalMs += ms;
  current.maxMs = Math.max(current.maxMs, ms);
  if (!ok) current.failures += 1;
}

export const recordRetry = () => { current.retries += 1; };
export const recordTimeout = () => { current.timeouts += 1; };
export const recordBatch = (reads: number) => { current.batches += 1; current.savedByBatch += Math.max(0, reads - 1); };
export const recordCatalog = (hit: boolean) => { if (hit) current.catalogHits += 1; else current.catalogMisses += 1; };
