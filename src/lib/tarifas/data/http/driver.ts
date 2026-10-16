// Driver HTTP: la clase HttpDataSource.

import {
  ForeignKeyError,
  NotFoundError,
  ReadOnlyEntityError,
  UniqueViolationError,
  type DataSource,
  type FindOptions,
  type FindRequest,
  type Row,
} from '../datasource';
import { entityDef, type EntityName } from '../schema';
import { notifyWrite } from '../writeEvents';
import { ApiError, isUnsupported, markUnsupported, readError, throwTransactionError } from './errors';
import { postBatches } from './batch';
import {
  DEFAULT_RETRIES, DEFAULT_RETRY_DELAY_MS, DEFAULT_TIMEOUT_MS, MAX_QUERY_URL_CHARS, fetchWithRetry,
  type HttpDataSourceOptions, type RequestInit, type TransportConfig, type TxOperation,
} from './transport';

export class HttpDataSource implements DataSource {
  readonly kind = 'http' as const;

  private readonly options: HttpDataSourceOptions;
  private readonly baseUrl: string;
  private readonly headers: () => Record<string, string>;
  private readonly transport: TransportConfig;

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
    this.transport = {
      // `fetch` suelto y llamado como método se invoca con `this` = el datasource y el navegador lo
      // rechaza ("Illegal invocation"): se envuelve para llamarlo siempre sobre `window`.
      fetchImpl: options.fetchImpl ?? ((input, init) => fetch(input, init)),
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      retries: options.retries ?? DEFAULT_RETRIES,
      retryDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    };
    this.pending = pending;
    this.touched = touched;
  }

  private url(entity: EntityName, suffix = ''): string {
    return `${this.baseUrl}/tarifas/${entityDef(entity).table}${suffix}`;
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
    const response = await fetchWithRetry(
      this.transport,
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
    if (query.length > MAX_QUERY_URL_CHARS && !isUnsupported(this.flag('find'))) {
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
        markUnsupported(this.flag('find'));
      }
    }
    return (await this.request(this.url(entity, query), { method: 'GET' }, entity)) as Row[];
  }

  /** Varias lecturas en una llamada (`/batch`). Con una sola, o sin `/batch` en el backend, lecturas sueltas. */
  async findMany(requests: FindRequest[]): Promise<Row[][]> {
    const singly = () => Promise.all(requests.map((r) => this.find(r.entity, r.options)));
    if (requests.length < 2 || isUnsupported(this.flag('batch'))) return singly();

    try {
      return await postBatches(requests, (body, first) => this.request(
        `${this.baseUrl}/tarifas/batch`, { method: 'POST', body }, first.entity, undefined, true,
      ) as Promise<Row[][]>);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
      markUnsupported(this.flag('batch'));
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
      const response = await fetchWithRetry(
        this.transport,
        `${this.baseUrl}/tarifas/tx`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.headers() },
          body: JSON.stringify({ ops: operations }),
        },
        false,
      );
      if (!response.ok) await throwTransactionError(response);
      notifyWrite(touched);
    }
    return result;
  }
}
