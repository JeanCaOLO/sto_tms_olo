// Cliente delgado del API SIMULADO de eFlow (EXPEDICIONESCABECERA/DETALLE),
// stand-in del API de ePrac (spec ET-MS-OC26007). Rutas públicas (sin token):
// en dev Vite proxya /api/* -> http://localhost:4000 (`npm run api:local:base`);
// en build se apunta VITE_API_BASE al API desplegado. Swap transparente cuando
// ePrac entregue el API real: mismo contrato de params + shapes.
//
// Mismo patrón que eflow-api.ts: fetch con AbortController/timeout, VITE_API_BASE
// sin barra final, query string solo con los filtros no vacíos. A diferencia de
// eflow-api.ts, NO lleva ?pais= (el seed del sim es único, no enruta por país).

// 12s: el modo live consulta EFLOW real por túnel (SQL Server), bastante más
// lento que el seed; con 4s el GET caía al fallback antes de responder.
const TIMEOUT_MS = 12000;

// Base del API. Vacío en dev (Vite proxya /api/*); en build = URL del API
// Gateway (p. ej. https://<id>.execute-api.<region>.amazonaws.com/<env>). Sin
// barra final.
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

const RUTA_CABECERA = '/api/eflow-sim/expediciones-cabecera';
const RUTA_DETALLE = '/api/eflow-sim/expediciones-detalle';

// --- Tipos de dominio (columnas del seed EXPEDICIONESCABECERA/DETALLE) -------
// Reflejan backend/eflow-sim/src/expediciones_seed.json. Numéricos nullables
// (PRIORIDAD) llegan como number|null; los códigos van como string.

export interface ExpedicionCabecera {
  IDEXPEDICION: string;
  IDCOMPANIA: string;
  IDALMACEN: string;
  IDSUCURSAL: string;
  TPEXES: string | null;
  TPEXSI: string | null;
  PRIORIDAD: number | null;
  BAJADA: string | null;
  IDCLIENTE: string | null;
  NOMBRECLIENTE: string | null;
  RUTA: string | null;
  FECHAENTREGA: string | null;
  FECHACIERRE: string | null;
  NUMEROVIAJEWMH: string | null;
  DIRECCIONENTREGA: string | null;
  LATITUD: string | null;
  LONGITUD: string | null;
}

export interface ExpedicionDetalle {
  IDEXPEDICION: string;
  IDCOMPANIA: string;
  IDALMACEN: string;
  IDSUCURSAL: string;
  IDLINEA: number;
  IDARTICULO: string | null;
  DESCRIPCION: string | null;
  CANTIDAD: number | null;
  PESO: number | null;
  VOLUMEN: number | null;
  GUIAFISCAL: string | null;
  TPEXES: string | null;
  TPEXSI: string | null;
  PRIORIDAD: number | null;
}

// Filtros GET (todos opcionales; sin filtros = toda la tabla). BAJADA solo
// aplica a cabecera (el backend lo ignora en detalle).
export interface FiltrosCabecera {
  IDEXPEDICION?: string;
  IDCOMPANIA?: string;
  IDALMACEN?: string;
  IDSUCURSAL?: string;
  TPEXES?: string;
  TPEXSI?: string;
  PRIORIDAD?: string | number;
  BAJADA?: string;
}

export type FiltrosDetalle = Omit<FiltrosCabecera, 'BAJADA'>;

// Clave que identifica un registro (cabecera y sus líneas) + los campos que el
// POST actualiza. BAJADA solo en cabecera.
export interface UpdateCabecera {
  IDEXPEDICION: string;
  IDCOMPANIA: string;
  IDALMACEN: string;
  IDSUCURSAL: string;
  TPEXES?: string;
  TPEXSI?: string;
  PRIORIDAD?: number | null;
  BAJADA?: string | null;
}

export type UpdateDetalle = Omit<UpdateCabecera, 'BAJADA'>;

// Respuesta de los POST, con el shape del PDF.
export interface RespuestaUpdate {
  status: 'success' | 'error';
  message: string;
  IDEXPEDICION?: string;
  IDCOMPANIA?: string;
  IDALMACEN?: string;
  IDSUCURSAL?: string;
}

// --- Helpers de transporte ---------------------------------------------------

// Query string con solo los filtros no vacíos (ignora undefined/null/'').
// FiltrosCabecera es el superconjunto (FiltrosDetalle lo omite solo BAJADA).
function construirQuery(filtros: FiltrosCabecera): string {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== '') params.set(clave, String(valor));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function getJson<T>(path: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_BASE + path, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function postJson<T>(path: string, payload: object): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// --- Fetchers ----------------------------------------------------------------

export function fetchExpedicionesCabecera(filtros: FiltrosCabecera = {}): Promise<ExpedicionCabecera[]> {
  return getJson<ExpedicionCabecera[]>(RUTA_CABECERA + construirQuery(filtros));
}

export function fetchExpedicionesDetalle(filtros: FiltrosDetalle = {}): Promise<ExpedicionDetalle[]> {
  return getJson<ExpedicionDetalle[]>(RUTA_DETALLE + construirQuery(filtros));
}

export function actualizarCabecera(payload: UpdateCabecera): Promise<RespuestaUpdate> {
  return postJson<RespuestaUpdate>(RUTA_CABECERA, payload);
}

export function actualizarDetalle(payload: UpdateDetalle): Promise<RespuestaUpdate> {
  return postJson<RespuestaUpdate>(RUTA_DETALLE, payload);
}
