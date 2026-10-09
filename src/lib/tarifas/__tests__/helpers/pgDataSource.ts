// DataSource de PRUEBA sobre una conexión `pg` directa, para correr el ORM del tarifador contra
// Aurora real dentro de una transacción que se revierte (ver `aurora.e2e.test.ts`).
//
// No es el driver de producción (ese es `HttpDataSource` + `backend/tarifas`): replica su
// semántica de lectura/escritura sobre el mismo esquema, con un SAVEPOINT por operación para que un
// error de Postgres (unicidad, FK) no deje abortada la transacción exterior del test.

import { randomBytes } from 'node:crypto';
import { types, type Client } from 'pg';
import {
  AppendOnlyError, ForeignKeyError, NotFoundError, ReadOnlyEntityError, UniqueViolationError,
  type DataSource, type FindOptions, type Row,
} from '../../data/datasource';
import { columnNames, entityDef, primaryKeyOf, type ColumnType, type EntityName } from '../../data/schema';

// Igual que la API real (tms_common): una columna `date` llega como medianoche UTC, sin correrla por zona horaria.
types.setTypeParser(1082, (value: string) => `${value}T00:00:00.000Z`);

const CAST: Record<ColumnType, string> = {
  text: 'text', int: 'integer', numeric: 'numeric', boolean: 'boolean',
  jsonb: 'jsonb', timestamptz: 'timestamptz', date: 'date', uuid: 'uuid',
};

const q = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
const COMPARISON = { gt: '>', gte: '>=', lt: '<', lte: '<=' } as const;

/** Mismo formato que `genId` del driver JSON: `<prefijo>_<ms base36>_<6 hex>`. */
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;

function normalize(row: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) out[key] = value instanceof Date ? value.toISOString() : value;
  return out;
}

export class PgDataSource implements DataSource {
  readonly kind = 'http' as const;
  private savepoints = 0;
  /** Una sola conexión: las consultas en paralelo (Promise.all) se encolan para no cruzar savepoints. */
  private queue: Promise<unknown> = Promise.resolve();

  private readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  private column(entity: EntityName, name: string): ColumnType {
    const def = entityDef(entity).columns[name];
    if (!def) throw new Error(`Columna desconocida "${name}" en ${entity}`);
    return def.type;
  }

  private param(entity: EntityName, name: string, value: unknown): unknown {
    if (value === null || value === undefined) return null;
    return this.column(entity, name) === 'jsonb' ? JSON.stringify(value) : value;
  }

  private where(entity: EntityName, conditions: FindOptions['where'] = []): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    const parts = conditions.map((c) => {
      const type = this.column(entity, c.column);
      const col = q(c.column);
      const ph = (value: unknown) => { params.push(this.param(entity, c.column, value)); return `$${params.length}::${CAST[type]}`; };
      switch (c.op) {
        case 'isNull': return `${col} IS NULL`;
        case 'notNull': return `${col} IS NOT NULL`;
        case 'eq': return c.value === null ? `${col} IS NULL` : `${col} = ${ph(c.value)}`;
        case 'neq': return c.value === null ? `${col} IS NOT NULL` : `${col} IS DISTINCT FROM ${ph(c.value)}`;
        case 'in': {
          const list = c.value as unknown[];
          if (list.length === 0) return 'FALSE';
          params.push(list);
          return `${col} = ANY($${params.length}::${CAST[type]}[])`;
        }
        default: return `${col} ${COMPARISON[c.op]} ${ph(c.value)}`;
      }
    });
    return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
  }

  private guarded<T>(entity: EntityName, fn: () => Promise<T>, id?: string): Promise<T> {
    const run = this.queue.then(() => this.withSavepoint(fn));
    this.queue = run.catch(() => undefined);
    return run.catch((error) => { throw this.translate(error, entity, id); });
  }

  private async withSavepoint<T>(fn: () => Promise<T>): Promise<T> {
    const name = `sp_${++this.savepoints}`;
    await this.client.query(`SAVEPOINT ${name}`);
    try {
      const result = await fn();
      await this.client.query(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (error) {
      await this.client.query(`ROLLBACK TO SAVEPOINT ${name}`);
      throw error;
    }
  }

  private translate(error: unknown, _entity: EntityName, _id?: string): unknown {
    const code = (error as { code?: string }).code;
    const message = (error as Error).message;
    if (code === '23505') return new UniqueViolationError(message);
    if (code === '23503') return new ForeignKeyError(message);
    return error;
  }

  private assertWritable(entity: EntityName, operation: string): void {
    const def = entityDef(entity);
    if (def.external) throw new ReadOnlyEntityError(entity, def.label, operation);
  }

  async find(entity: EntityName, options: FindOptions = {}): Promise<Row[]> {
    const { sql, params } = this.where(entity, options.where);
    const order = (options.orderBy ?? [])
      .map((o) => `${q(o.column)} ${o.direction === 'desc' ? 'DESC' : 'ASC'} NULLS LAST`).join(', ');
    const limit = options.limit ? ` LIMIT ${Number(options.limit)}` : '';
    const offset = options.offset ? ` OFFSET ${Number(options.offset)}` : '';
    const text = `SELECT * FROM ${q(entityDef(entity).table)} ${sql}${order ? ` ORDER BY ${order}` : ''}${limit}${offset}`;
    return this.guarded(entity, async () => (await this.client.query(text, params)).rows.map(normalize));
  }

  async findOne(entity: EntityName, id: string): Promise<Row | null> {
    const rows = await this.find(entity, { where: [{ column: primaryKeyOf(entity), op: 'eq', value: id }], limit: 1 });
    return rows[0] ?? null;
  }

  async insert(entity: EntityName, values: Row): Promise<Row> {
    this.assertWritable(entity, 'insert');
    const def = entityDef(entity);
    const pk = primaryKeyOf(entity);
    const row: Row = { ...values };
    if ((row[pk] === undefined || row[pk] === null || row[pk] === '') && def.columns[pk].type === 'text') {
      row[pk] = newId(def.idPrefix);
    }
    const columns = Object.keys(row).filter((c) => columnNames(entity).includes(c));
    const placeholders = columns.map((c, i) => `$${i + 1}::${CAST[this.column(entity, c)]}`);
    const params = columns.map((c) => this.param(entity, c, row[c]));
    const text = `INSERT INTO ${q(def.table)} (${columns.map(q).join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    return this.guarded(entity, async () => normalize((await this.client.query(text, params)).rows[0]));
  }

  async update(entity: EntityName, id: string, values: Row): Promise<Row> {
    this.assertWritable(entity, 'update');
    if (entityDef(entity).appendOnly) throw new AppendOnlyError(entity, 'update');
    const pk = primaryKeyOf(entity);
    const fields = Object.keys(values).filter((c) => c !== pk && columnNames(entity).includes(c));
    const sets = fields.map((c, i) => `${q(c)} = $${i + 1}::${CAST[this.column(entity, c)]}`);
    const params = [...fields.map((c) => this.param(entity, c, values[c])), id];
    const text = `UPDATE ${q(entityDef(entity).table)} SET ${sets.join(', ')} WHERE ${q(pk)} = $${fields.length + 1}::${CAST[this.column(entity, pk)]} RETURNING *`;
    return this.guarded(entity, async () => {
      const result = await this.client.query(text, params);
      if (result.rows.length === 0) throw new NotFoundError(entity, id, entityDef(entity).label);
      return normalize(result.rows[0]);
    }, id);
  }

  async delete(entity: EntityName, id: string): Promise<void> {
    this.assertWritable(entity, 'delete');
    if (entityDef(entity).appendOnly) throw new AppendOnlyError(entity, 'delete');
    const pk = primaryKeyOf(entity);
    const text = `DELETE FROM ${q(entityDef(entity).table)} WHERE ${q(pk)} = $1::${CAST[this.column(entity, pk)]}`;
    await this.guarded(entity, async () => {
      const result = await this.client.query(text, [id]);
      if (result.rowCount === 0) throw new NotFoundError(entity, id, entityDef(entity).label);
    }, id);
  }

  async transaction<T>(fn: (tx: DataSource) => Promise<T>): Promise<T> {
    const name = `tx_${++this.savepoints}`;
    await this.client.query(`SAVEPOINT ${name}`);
    try {
      const result = await fn(this);
      await this.client.query(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (error) {
      await this.client.query(`ROLLBACK TO SAVEPOINT ${name}`);
      throw error;
    }
  }
}
