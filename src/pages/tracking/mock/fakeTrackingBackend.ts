// Backend simulado de /api/v1/tracking/* para el modo mock: mismo contrato (sobre `{ data }` / `{ error }`, códigos
// HTTP) que backend/tracking/src/app.py, sobre la simulación en memoria de sim.ts. Así el cliente real (api.ts)
// se ejercita igual que contra Aurora y un error de contrato aparece antes de conectar el túnel.
import type { TrackingTransport } from '../api';
import { SimError, simDetail, simList, simPlanned, simRecorrido, simStart } from './sim';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 30;
const PAIS = /^[A-Z]{2}$/;

type Result = Awaited<ReturnType<TrackingTransport>>;

const ok = (data: unknown, status = 200): Result => ({ ok: true, status, body: { data } });
const fail = (status: number, message: string): Result => ({ ok: false, status, body: { error: { message } } });

function route(method: string, path: string, query: URLSearchParams): Result {
  const parts = path.replace(/^\/v1\/tracking\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const rawPais = (query.get('pais') ?? '').trim().toUpperCase();
  if (rawPais && !PAIS.test(rawPais)) return fail(400, 'pais inválido');
  const pais = rawPais || null;
  if (method === 'GET' && parts.length === 1 && parts[0] === 'viajes') {
    const raw = query.get('limit');
    const limit = raw == null ? DEFAULT_LIMIT : Number(raw);
    if (!Number.isInteger(limit) || limit < 1) return fail(400, 'limit inválido');
    return ok(simList({
      mode: query.get('activos') === '1' ? 'active' : 'all', q: query.get('q') ?? '', limit: Math.min(limit, MAX_LIMIT),
      // Como el backend: los KPIs solo con la primera página (sin cursor).
      cursor: query.get('cursor'), country: pais, summary: !query.get('cursor') && (query.get('include') ?? '').split(',').includes('summary'),
    }));
  }
  if (method === 'GET' && parts.length === 2 && parts[0] === 'viajes') return ok(simDetail(parts[1]));
  if (method === 'GET' && parts.length === 3 && parts[0] === 'viajes' && parts[2] === 'recorrido') return ok(simRecorrido(parts[1]));
  if (method === 'GET' && parts.length === 1 && parts[0] === 'planificados') return ok(simPlanned(pais));
  if (method === 'POST' && parts.length === 3 && parts[0] === 'viajes' && parts[2] === 'iniciar') {
    const result = simStart(parts[1]);
    return ok(result, result.created ? 201 : 200);
  }
  return fail(404, 'Ruta no encontrada');
}

/** Transporte para `setTrackingTransport`: responde en memoria, con una latencia corta para notar cargas. */
export function createFakeTrackingBackend({ latencyMs = 40 }: { latencyMs?: number } = {}): TrackingTransport {
  return async (path, init) => {
    if (latencyMs) await new Promise((resolve) => setTimeout(resolve, latencyMs));
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const url = new URL(path, 'http://mock.local');
    try {
      return route((init?.method ?? 'GET').toUpperCase(), url.pathname, url.searchParams);
    } catch (err) {
      if (err instanceof SimError) return fail(err.status, err.message);
      return fail(500, err instanceof Error ? err.message : 'Error interno');
    }
  };
}
