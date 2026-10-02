// Driver HTTP: la misma interfaz `DataSource`, contra la API del tarifador sobre Aurora
// (`backend/tarifas/`, Lambda Python).
//
// Contrato (lo implementa `backend/tarifas/src/app.py`):
//
//   GET    {base}/tarifas/{table}?q={json}   -> Row[]      q = { where, orderBy, limit, offset }
//   GET    {base}/tarifas/{table}/{id}       -> Row | 404
//   POST   {base}/tarifas/{table}            -> Row        body = la fila
//   PATCH  {base}/tarifas/{table}/{id}       -> Row        body = campos a mezclar
//   DELETE {base}/tarifas/{table}/{id}       -> 204
//   POST   {base}/tarifas/tx                 -> unknown[]  body = { ops: [...] }, todo o nada
//
// Errores: 404 = no existe · 405 = escritura sobre una entidad externa (solo lectura) ·
// 409 = integridad, con `code` '23503' (FK) o '23505' (unicidad) en el cuerpo.
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
