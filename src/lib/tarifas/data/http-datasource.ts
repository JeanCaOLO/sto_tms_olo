// Driver HTTP: la misma interfaz `DataSource`, contra la API del tarifador sobre Aurora
// (`backend/tarifas/`, Lambda Python).
//
// Contrato (lo implementa `backend/tarifas/src/app.py`):
//
//   GET    {base}/tarifas/{table}?q={json}   -> Row[]      q = { where, orderBy, limit, offset, columns, after }
//   POST   {base}/tarifas/{table}/find       -> Row[]      body = q (consultas largas que no caben en la URL)
//   POST   {base}/tarifas/batch              -> Row[][]    body = { queries: [{ table, q }] }, varias lecturas en una
//   GET    {base}/tarifas/{table}/{id}       -> Row | 404
//   POST   {base}/tarifas/{table}            -> Row        body = la fila
//   PATCH  {base}/tarifas/{table}/{id}       -> Row        body = campos a mezclar
//   DELETE {base}/tarifas/{table}/{id}       -> 204
//   POST   {base}/tarifas/tx                 -> unknown[]  body = { ops: [...] }, todo o nada
//
// Errores: 404 = no existe · 405 = escritura sobre una entidad externa (solo lectura) ·
// 409 = integridad, con `code` '23503' (FK) o '23505' (unicidad) en el cuerpo.
//
// Robustez del cliente: cada llamada tiene un tiempo máximo (`timeoutMs`) y las LECTURAS se reintentan
// ante un corte de red, un timeout o un 502/503/504 (el arranque en frío de un Lambda o un cluster que
// recién despierta lo provocan). Las escrituras NO se reintentan: repetirlas podría duplicarlas.
//
// `/batch` y `/find` los agregó esta versión; si el backend desplegado todavía no los tiene (404), el
// cliente lo recuerda y vuelve a las lecturas sueltas, así el frontend puede salir antes que la API.
//
// `{table}` es `EntityDef.table` del registro de esquema, y el backend lo valida contra el
// manifiesto generado desde ese mismo registro (`npm run tarifas:manifest`) — no hay dos listas de
// nombres que mantener. Las entidades externas se leen igual que las propias (pasan por esta capa);
// las escrituras sobre ellas se rechazan acá mismo, antes de llegar a la red.
//
// Las credenciales de Postgres viven SOLO en el servidor. El frontend únicamente conoce la URL
// base y el token de sesión.

import {
  ForeignKeyError,
  NotFoundError,
  ReadOnlyEntityError,
  UniqueViolationError,
  type DataSource,
  type FindOptions,
  type FindRequest,
  type Row,
} from './datasource';
import { recordBatch, recordRequest, recordRetry, recordTimeout } from './metrics';
import { entityDef, type EntityName } from './schema';
import { notifyWrite } from './writeEvents';

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

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 300;
const RETRY_STATUSES = new Set([502, 503, 504]);
/** Una consulta cuya URL supera esto viaja por POST (los gateways cortan alrededor de 8 KB). */
const MAX_QUERY_URL_CHARS = 6_000;
/** Lecturas por llamada de `/batch`; el backend rechaza más. */
const MAX_BATCH = 25;

/** Falla de la API con su estado HTTP, para que el llamador pueda decidir (p. ej. 404 de una ruta nueva). */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Funciones nuevas del backend que quizá todavía no estén desplegadas, por API. Una vez que responde
 * 404, no se vuelve a intentar en esta sesión.
 */
const unsupported = new Set<string>();

/** Solo para tests. */
export function resetHttpFeatureFlags(): void {
  unsupported.clear();
}

/**
 * Lee el error de la API. El backend (`tms_handler`) responde `{ data: null, error: { message, code? } }`;
 * se aceptan también `{ error: "texto", code }` y `{ detail }` por compatibilidad.
 */
async function readError(response: Response, fallback: string): Promise<{ message: string; code?: string }> {
  try {
    const body = (await response.json()) as {
      detail?: string;
      code?: string;
      error?: string | { message?: string; code?: string } | null;
    };
    const error = body.error;
    const message = typeof error === 'string' ? error : error?.message ?? body.detail ?? fallback;
    const code = (typeof error === 'object' && error ? error.code : undefined) ?? body.code;
    return { message, ...(code ? { code } : {}) };
  } catch {
    return { message: fallback };
  }
}

interface TxOperation {
  op: 'insert' | 'update' | 'delete';
  table: string;
  id?: string;
  values?: Row;
}

type RequestInit = NonNullable<Parameters<typeof fetch>[1]>;

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

export class HttpDataSource implements DataSource {
  readonly kind = 'http' as const;

  private readonly options: HttpDataSourceOptions;
  private readonly baseUrl: string;
  private readonly headers: () => Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;

  /** Cuando está presente, las escrituras se acumulan acá y se envían juntas al confirmar. */
  private readonly pending: TxOperation[] | null;

  /** Lecturas idénticas en vuelo: varios componentes piden lo mismo (países, zonas…) a la vez. */
  private readonly inflight = new Map<string, Promise<unknown>>();

  /** Entidades tocadas dentro de la transacción: al confirmar se avisa a quien tenga copias. */
  private readonly touched: Set<EntityName> | null;

  constructor(
    options: HttpDataSourceOptions,
    pending: TxOperation[] | null = null,
    touched: Set<EntityName> | null = null,
  ) {
    this.options = options;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.headers = options.headers ?? (() => ({}));
    // `fetch` suelto y llamado como `this.fetchImpl(...)` se invoca con `this` = el datasource y el
    // navegador lo rechaza ("Illegal invocation"): se envuelve para llamarlo siempre sobre `window`.
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = options.retries ?? DEFAULT_RETRIES;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.pending = pending;
    this.touched = touched;
  }

  private url(entity: EntityName, suffix = ''): string {
    return `${this.baseUrl}/tarifas/${entityDef(entity).table}${suffix}`;
  }

  /**
   * Una llamada con tiempo máximo y métricas. Si `retryable`, repite ante red/timeout/502-504; si no,
   * un solo intento. Devuelve la respuesta (buena o mala): interpretarla es de `send`.
   */
  private async fetchWithRetry(url: string, init: RequestInit, retryable: boolean): Promise<Response> {
    const maxRetries = retryable ? this.retries : 0;
    for (let attempt = 0; ; attempt += 1) {
      const last = attempt >= maxRetries;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const startedAt = performance.now();
      try {
        const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
        recordRequest(performance.now() - startedAt, response.ok || response.status < 500);
        if (last || !RETRY_STATUSES.has(response.status)) return response;
      } catch (error) {
        const timedOut = controller.signal.aborted;
        recordRequest(performance.now() - startedAt, false);
        if (timedOut) recordTimeout();
        if (last) {
          throw timedOut
            ? new Error(`La API no respondió en ${Math.round(this.timeoutMs / 1000)} s. Probá de nuevo en un momento.`)
            : error;
        }
      } finally {
        clearTimeout(timer);
      }
      recordRetry();
      await sleep(this.retryDelayMs * (attempt + 1));
    }
  }

  /**
   * `shared`: lecturas. Una sola petición por clave mientras esté en vuelo; cada llamador recibe su
   * propia copia, para que mutar las filas de un componente no altere las de otro. No hay caché: al
   * terminar, la siguiente lectura va a la API.
   */
  private async request(
    url: string,
    init: RequestInit,
    entity: EntityName,
    id?: string,
    read = init.method === 'GET',
  ): Promise<unknown> {
    if (!read) return this.send(url, init, entity, id, false);
    const key = `${init.method ?? 'GET'} ${url} ${typeof init.body === 'string' ? init.body : ''}`;
    let shared = this.inflight.get(key);
    if (!shared) {
      shared = this.send(url, init, entity, id, true).finally(() => this.inflight.delete(key));
      this.inflight.set(key, shared);
    }
    return structuredClone(await shared);
  }

  private async send(
    url: string,
    init: RequestInit,
    entity: EntityName,
    id: string | undefined,
    retryable: boolean,
  ): Promise<unknown> {
    const response = await this.fetchWithRetry(
      url,
      { ...init, headers: { 'Content-Type': 'application/json', ...this.headers(), ...(init.headers ?? {}) } },
      retryable,
    );

    if (response.status === 404 && id !== undefined) {
      throw new NotFoundError(entity, id, entityDef(entity).label);
    }
    if (response.status === 405) {
      throw new ReadOnlyEntityError(entity, entityDef(entity).label, init.method ?? 'write');
    }
    if (response.status === 409) {
      const { message, code } = await this.errorBody(response, entity);
      throw code === '23505' ? new UniqueViolationError(message) : new ForeignKeyError(message);
    }
    if (!response.ok) {
      throw new ApiError((await this.errorBody(response, entity)).message, response.status);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  private async errorBody(response: Response, entity: EntityName): Promise<{ message: string; code?: string }> {
    return readError(response, `${entityDef(entity).label}: la API respondió ${response.status}.`);
  }

  private assertWritable(entity: EntityName, operation: string): void {
    const def = entityDef(entity);
    if (def.external) throw new ReadOnlyEntityError(entity, def.label, operation);
  }

  private flag(feature: string): string {
    return `${this.baseUrl}|${feature}`;
  }

  async find(entity: EntityName, options?: FindOptions): Promise<Row[]> {
    const query = options ? `?q=${encodeURIComponent(JSON.stringify(options))}` : '';
    // Una consulta enorme (p. ej. `in` con miles de ids) no cabe en la URL: va por POST.
    if (query.length > MAX_QUERY_URL_CHARS && !unsupported.has(this.flag('find'))) {
      try {
        return (await this.request(
          this.url(entity, '/find'),
          { method: 'POST', body: JSON.stringify(options) },
          entity,
          undefined,
          true,
        )) as Row[];
      } catch (error) {
        // El backend desplegado todavía no tiene `/find`: se recuerda y se sigue por GET.
        if (!(error instanceof ApiError && error.status === 404)) throw error;
        unsupported.add(this.flag('find'));
      }
    }
    return (await this.request(this.url(entity, query), { method: 'GET' }, entity)) as Row[];
  }

  /** Varias lecturas en una llamada (`/batch`). Con una sola, o sin `/batch` en el backend, lecturas sueltas. */
  async findMany(requests: FindRequest[]): Promise<Row[][]> {
    const singly = () => Promise.all(requests.map((r) => this.find(r.entity, r.options)));
    if (requests.length < 2 || unsupported.has(this.flag('batch'))) return singly();

    const groups: FindRequest[][] = [];
    for (let i = 0; i < requests.length; i += MAX_BATCH) groups.push(requests.slice(i, i + MAX_BATCH));
    try {
      const results = await Promise.all(
        groups.map(async (group) => {
          const body = JSON.stringify({
            queries: group.map((r) => ({ table: entityDef(r.entity).table, q: r.options ?? {} })),
          });
          const rows = (await this.request(
            `${this.baseUrl}/tarifas/batch`,
            { method: 'POST', body },
            group[0].entity,
            undefined,
            true,
          )) as Row[][];
          recordBatch(group.length);
          return rows;
        }),
      );
      return results.flat();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
      unsupported.add(this.flag('batch'));
      return singly();
    }
  }

  async findOne(entity: EntityName, id: string): Promise<Row | null> {
    try {
      return (await this.request(this.url(entity, `/${encodeURIComponent(id)}`), { method: 'GET' }, entity, id)) as Row;
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  async insert(entity: EntityName, values: Row): Promise<Row> {
    this.assertWritable(entity, 'insert');
    if (this.pending) {
      this.pending.push({ op: 'insert', table: entityDef(entity).table, values });
      this.touched?.add(entity);
      // Dentro de una transacción la fila definitiva la devuelve el servidor al confirmar; lo que
      // se devuelve acá es lo enviado, para que el llamador pueda seguir encadenando.
      return values;
    }
    const row = (await this.request(this.url(entity), { method: 'POST', body: JSON.stringify(values) }, entity)) as Row;
    notifyWrite([entity]);
    return row;
  }

  async update(entity: EntityName, id: string, values: Row): Promise<Row> {
    this.assertWritable(entity, 'update');
    if (this.pending) {
      this.pending.push({ op: 'update', table: entityDef(entity).table, id, values });
      this.touched?.add(entity);
      return { ...values, id };
    }
    const row = (await this.request(
      this.url(entity, `/${encodeURIComponent(id)}`),
      { method: 'PATCH', body: JSON.stringify(values) },
      entity,
      id,
    )) as Row;
    notifyWrite([entity]);
    return row;
  }

  async delete(entity: EntityName, id: string): Promise<void> {
    this.assertWritable(entity, 'delete');
    if (this.pending) {
      this.pending.push({ op: 'delete', table: entityDef(entity).table, id });
      this.touched?.add(entity);
      return;
    }
    await this.request(this.url(entity, `/${encodeURIComponent(id)}`), { method: 'DELETE' }, entity, id);
    notifyWrite([entity]);
  }

  async transaction<T>(fn: (tx: DataSource) => Promise<T>): Promise<T> {
    if (this.pending) return fn(this);

    const operations: TxOperation[] = [];
    const touched = new Set<EntityName>();
    const result = await fn(new HttpDataSource(this.options, operations, touched));

    if (operations.length > 0) {
      // Sin reintentos: una transacción repetida a ciegas podría aplicarse dos veces.
      const response = await this.fetchWithRetry(
        `${this.baseUrl}/tarifas/tx`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.headers() },
          body: JSON.stringify({ ops: operations }),
        },
        false,
      );
      if (!response.ok) {
        // Mismo mapeo de errores que una escritura suelta: la UI distingue "en uso" de "duplicado".
        const { message: detalle, code } = await readError(response, `La API respondió ${response.status}`);
        const message = `${detalle} No se guardó nada.`;
        if (response.status === 409) {
          throw code === '23505' ? new UniqueViolationError(message) : new ForeignKeyError(message);
        }
        throw new Error(`La transacción falló: ${message}`);
      }
      notifyWrite(touched);
    }
    return result;
  }
}
