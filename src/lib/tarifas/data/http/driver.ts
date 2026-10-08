// Driver HTTP: la clase HttpDataSource.

import {
  ForeignKeyError,
  NotFoundError,
  ReadOnlyEntityError,
  UniqueViolationError,
  type DataSource,
  type FindOptions,
  type Row,
} from '../datasource';
import { entityDef, type EntityName } from '../schema';
import { readError } from './errors';

interface TxOperation {
  op: 'insert' | 'update' | 'delete';
  table: string;
  id?: string;
  values?: Row;
}

export interface HttpDataSourceOptions {
  /** URL base de la API, sin barra final. */
  baseUrl: string;
  /** Cabeceras extra (autorización, tenant). Se evalúa en cada request, no una sola vez. */
  headers?: () => Record<string, string>;
  fetchImpl?: typeof fetch;
}

export class HttpDataSource implements DataSource {
  readonly kind = 'http' as const;

  private readonly baseUrl: string;
  private readonly headers: () => Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  /** Cuando está presente, las escrituras se acumulan acá y se envían juntas al confirmar. */
  private readonly pending: TxOperation[] | null;

  /** Lecturas idénticas en vuelo: varios componentes piden lo mismo (países, zonas…) a la vez. */
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(options: HttpDataSourceOptions, pending: TxOperation[] | null = null) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.headers = options.headers ?? (() => ({}));
    // `fetch` suelto y llamado como `this.fetchImpl(...)` se invoca con `this` = el datasource y el
    // navegador lo rechaza ("Illegal invocation"): se envuelve para llamarlo siempre sobre `window`.
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.pending = pending;
  }

  private url(entity: EntityName, suffix = ''): string {
    return `${this.baseUrl}/tarifas/${entityDef(entity).table}${suffix}`;
  }

  private async request(
    url: string,
    init: NonNullable<Parameters<typeof fetch>[1]>,
    entity: EntityName,
    id?: string,
  ): Promise<unknown> {
    if (init.method !== 'GET') return this.send(url, init, entity, id);
    // Una sola petición por URL mientras esté en vuelo; cada llamador recibe su propia copia, para
    // que mutar las filas de un componente no altere las de otro. No hay caché: al terminar, la
    // siguiente lectura va a la API.
    let shared = this.inflight.get(url);
    if (!shared) {
      shared = this.send(url, init, entity, id).finally(() => this.inflight.delete(url));
      this.inflight.set(url, shared);
    }
    return structuredClone(await shared);
  }

  private async send(
    url: string,
    init: NonNullable<Parameters<typeof fetch>[1]>,
    entity: EntityName,
    id?: string,
  ): Promise<unknown> {
    const response = await this.fetchImpl(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...this.headers(), ...(init.headers ?? {}) },
    });

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
      throw new Error((await this.errorBody(response, entity)).message);
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

  async find(entity: EntityName, options?: FindOptions): Promise<Row[]> {
    const query = options ? `?q=${encodeURIComponent(JSON.stringify(options))}` : '';
    return (await this.request(this.url(entity, query), { method: 'GET' }, entity)) as Row[];
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
      // Dentro de una transacción la fila definitiva la devuelve el servidor al confirmar; lo que
      // se devuelve acá es lo enviado, para que el llamador pueda seguir encadenando.
      return values;
    }
    return (await this.request(this.url(entity), { method: 'POST', body: JSON.stringify(values) }, entity)) as Row;
  }

  async update(entity: EntityName, id: string, values: Row): Promise<Row> {
    this.assertWritable(entity, 'update');
    if (this.pending) {
      this.pending.push({ op: 'update', table: entityDef(entity).table, id, values });
      return { ...values, id };
    }
    return (await this.request(
      this.url(entity, `/${encodeURIComponent(id)}`),
      { method: 'PATCH', body: JSON.stringify(values) },
      entity,
      id,
    )) as Row;
  }

  async delete(entity: EntityName, id: string): Promise<void> {
    this.assertWritable(entity, 'delete');
    if (this.pending) {
      this.pending.push({ op: 'delete', table: entityDef(entity).table, id });
      return;
    }
    await this.request(this.url(entity, `/${encodeURIComponent(id)}`), { method: 'DELETE' }, entity, id);
  }

  async transaction<T>(fn: (tx: DataSource) => Promise<T>): Promise<T> {
    if (this.pending) return fn(this);

    const operations: TxOperation[] = [];
    const result = await fn(
      new HttpDataSource(
        { baseUrl: this.baseUrl, headers: this.headers, fetchImpl: this.fetchImpl },
        operations,
      ),
    );

    if (operations.length > 0) {
      const response = await this.fetchImpl(`${this.baseUrl}/tarifas/tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.headers() },
        body: JSON.stringify({ ops: operations }),
      });
      if (!response.ok) {
        // Mismo mapeo de errores que una escritura suelta: la UI distingue "en uso" de "duplicado".
        const { message: detalle, code } = await readError(response, `La API respondió ${response.status}`);
        const message = `${detalle} No se guardó nada.`;
        if (response.status === 409) {
          throw code === '23505' ? new UniqueViolationError(message) : new ForeignKeyError(message);
        }
        throw new Error(`La transacción falló: ${message}`);
      }
    }
    return result;
  }
}
