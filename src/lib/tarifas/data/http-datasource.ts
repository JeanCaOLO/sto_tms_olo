// Driver HTTP: la misma interfaz `DataSource`, contra una API que habla con Postgres.
//
// ESTADO: el contrato está definido y el cliente implementado, pero TODAVÍA NO SE EJERCITÓ contra
// un servidor real — no hay acceso a Postgres aún. El día que lo haya, este archivo es el que se
// prueba; ni la UI ni el kernel se tocan.
//
// Contrato que debe cumplir el backend (mismo estilo que `server/index.mjs`, que ya sirve EFLOW):
//
//   GET    {base}/tarifas/{table}?q={json}   -> Row[]      q = { where, orderBy, limit, offset }
//   GET    {base}/tarifas/{table}/{id}       -> Row | 404
//   POST   {base}/tarifas/{table}            -> Row        body = la fila
//   PATCH  {base}/tarifas/{table}/{id}       -> Row        body = campos a mezclar
//   DELETE {base}/tarifas/{table}/{id}       -> 204
//   POST   {base}/tarifas/tx                 -> unknown[]  body = { ops: [...] }, todo o nada
//
// `{table}` es `EntityDef.table` del registro de esquema, así que el backend puede validarlo
// contra el mismo DDL que genera `ddl.ts` — no hay dos listas de nombres que mantener.
//
// Las credenciales de Postgres viven SOLO en el servidor. El frontend únicamente conoce la URL
// base y, si aplica, un token de sesión.

import {
  ForeignKeyError,
  NotFoundError,
  type DataSource,
  type FindOptions,
  type Row,
} from './datasource';
import { entityDef, type EntityName } from './schema';

export interface HttpDataSourceOptions {
  /** URL base de la API, sin barra final. */
  baseUrl: string;
  /** Cabeceras extra (autorización, tenant). Se evalúa en cada request, no una sola vez. */
  headers?: () => Record<string, string>;
  fetchImpl?: typeof fetch;
}

interface TxOperation {
  op: 'insert' | 'update' | 'delete';
  table: string;
  id?: string;
  values?: Row;
}

export class HttpDataSource implements DataSource {
  readonly kind = 'http' as const;

  private readonly baseUrl: string;
  private readonly headers: () => Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  /** Cuando está presente, las escrituras se acumulan acá y se envían juntas al confirmar. */
  private readonly pending: TxOperation[] | null;

  constructor(options: HttpDataSourceOptions, pending: TxOperation[] | null = null) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.headers = options.headers ?? (() => ({}));
    this.fetchImpl = options.fetchImpl ?? fetch;
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
    const response = await this.fetchImpl(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...this.headers(), ...(init.headers ?? {}) },
    });

    if (response.status === 404 && id !== undefined) {
      throw new NotFoundError(entity, id, entityDef(entity).label);
    }
    if (response.status === 409) {
      throw new ForeignKeyError(await this.errorMessage(response, entity));
    }
    if (!response.ok) {
      throw new Error(await this.errorMessage(response, entity));
    }
    if (response.status === 204) return null;
    return response.json();
  }

  private async errorMessage(response: Response, entity: EntityName): Promise<string> {
    const fallback = `${entityDef(entity).label}: la API respondió ${response.status}.`;
    try {
      const body = (await response.json()) as { detail?: string; error?: string };
      return body.detail ?? body.error ?? fallback;
    } catch {
      return fallback;
    }
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
    if (this.pending) {
      this.pending.push({ op: 'insert', table: entityDef(entity).table, values });
      // Dentro de una transacción la fila definitiva la devuelve el servidor al confirmar; lo que
      // se devuelve acá es lo enviado, para que el llamador pueda seguir encadenando.
      return values;
    }
    return (await this.request(this.url(entity), { method: 'POST', body: JSON.stringify(values) }, entity)) as Row;
  }

  async update(entity: EntityName, id: string, values: Row): Promise<Row> {
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
        throw new Error(`La transacción falló: la API respondió ${response.status}. No se guardó nada.`);
      }
    }
    return result;
  }
}
