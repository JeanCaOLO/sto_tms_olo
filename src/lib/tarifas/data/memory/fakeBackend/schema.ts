// Lista blanca, tipos y validación de lo que llega al backend simulado (`tarifas_schema.py` + `tarifas_sql.py`).

import { generateManifest, type ManifestTable } from '../../manifest';
import type { Condition, FindOptions, Row } from '../../datasource';
import { HttpFail, newId } from './errors';

export type Table = ManifestTable & { name: string };

const MAX_ROWS = 5000;
const OPERATORS = new Set(['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'isNull', 'notNull']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Columnas NOT NULL que la base completa sola (DEFAULT de las migraciones sql/20 y sql/21).
const DB_DEFAULTS: Record<string, Record<string, unknown>> = {
  tarifas_settlements: { rules_used: [] },
  tarifas_cost_structures: { params: { kmPerYear: null, fuelPrice: null, fuelEfficiency: {} } },
};

const manifest = generateManifest().tables;

export const table = (name: string): Table => {
  const found = manifest[name];
  if (!found) throw new HttpFail(404, `Tabla desconocida para el tarifador: "${name}"`);
  return { ...found, name };
};

export const columnType = (t: Table, column: string) => {
  const spec = t.columns[column];
  if (!spec) throw new HttpFail(400, `Columna desconocida "${column}" en "${t.name}"`);
  return spec.type;
};

// ── Tipos (lo que Postgres rechazaría al castear el parámetro) ───────────────────────────────
export const castProblem = (type: string, column: string, value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const bad = (kind: string) => `invalid input syntax for type ${kind}: "${String(value)}" (columna "${column}")`;
  switch (type) {
    case 'uuid': return typeof value === 'string' && UUID.test(value) ? null : bad('uuid');
    case 'int': return (typeof value === 'number' && Number.isInteger(value)) || (typeof value === 'string' && /^-?\d+$/.test(value)) ? null : bad('integer');
    case 'numeric': return (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) ? null : bad('numeric');
    case 'boolean': return typeof value === 'boolean' ? null : bad('boolean');
    case 'timestamptz': case 'date': return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? null : bad(type);
    default: return null;
  }
};

export const checkValues = (t: Table, values: unknown, isInsert: boolean): Row => {
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length === 0) {
    throw new HttpFail(400, 'Se esperaba un objeto con los valores de la fila');
  }
  const row = { ...(values as Row) };
  for (const column of Object.keys(row)) columnType(t, column);
  for (const [column, value] of Object.entries(row)) {
    const problem = castProblem(columnType(t, column), column, value);
    if (problem) throw new HttpFail(500, problem);
  }
  if (isInsert) {
    const pk = t.primaryKey;
    if (row[pk] === undefined || row[pk] === null || row[pk] === '') {
      if (columnType(t, pk) !== 'text') throw new HttpFail(400, `"${t.name}" requiere el id`);
      row[pk] = newId(t.idPrefix);
    }
    for (const [column, spec] of Object.entries(t.columns)) {
      if (column === pk || spec.nullable || column in row) continue;
      if (column in (DB_DEFAULTS[t.name] ?? {})) {
        row[column] = (DB_DEFAULTS[t.name] ?? {})[column];
        continue;
      }
      throw new HttpFail(409, `null value in column "${column}" of relation "${t.name}" violates not-null constraint`, '23502');
    }
    for (const [column, value] of Object.entries(row)) {
      if (value === null && !t.columns[column].nullable && column !== pk) {
        throw new HttpFail(409, `null value in column "${column}" of relation "${t.name}" violates not-null constraint`, '23502');
      }
    }
  }
  return row;
};

// ── Respuestas: como las entrega Postgres vía `tms_common.responses` ─────────────────────────
export const outbound = (t: Table, row: Row): Row => {
  const out: Row = {};
  for (const [column, value] of Object.entries(row)) {
    const type = t.columns[column]?.type;
    if (value === null || value === undefined) out[column] = value ?? null;
    else if (type === 'numeric') out[column] = String(value);
    else if (type === 'int' && typeof value === 'string') out[column] = Number(value);
    else if (type === 'timestamptz') out[column] = new Date(value as string).toISOString();
    else if (type === 'date') out[column] = `${String(value).slice(0, 10)}T00:00:00.000Z`;
    else out[column] = value;
  }
  return out;
};


// ── Lecturas ─────────────────────────────────────────────────────────────────────────────────
export const validateQuery = (t: Table, q: unknown): FindOptions => {
  if (q === undefined || q === null) return {};
  if (typeof q !== 'object' || Array.isArray(q)) throw new HttpFail(400, '"q" debe ser un objeto { where, orderBy, limit, offset }');
  const query = q as FindOptions & { where?: Condition[] };
  if (query.where !== undefined && !Array.isArray(query.where)) throw new HttpFail(400, '"where" debe ser una lista de condiciones');
  for (const condition of query.where ?? []) {
    if (!condition || typeof condition !== 'object') throw new HttpFail(400, 'Cada condición debe ser un objeto { column, op, value }');
    if (!OPERATORS.has(condition.op)) throw new HttpFail(400, `Operador no soportado: "${condition.op}"`);
    columnType(t, String(condition.column));
    if (condition.op === 'in' && !Array.isArray(condition.value)) {
      throw new HttpFail(400, `"in" sobre "${condition.column}" requiere una lista`);
    }
  }
  for (const order of query.orderBy ?? []) columnType(t, String(order.column));
  if (query.columns !== undefined) {
    if (!Array.isArray(query.columns) || query.columns.length === 0 || !query.columns.every((c) => typeof c === 'string')) {
      throw new HttpFail(400, '"columns" debe ser una lista no vacía de nombres de columna');
    }
    for (const column of query.columns) columnType(t, column);
  }
  for (const key of ['limit', 'offset'] as const) {
    const value = query[key];
    if (value !== undefined && (!Number.isInteger(value) || (value as number) < 0)) throw new HttpFail(400, `"${key}" debe ser un entero >= 0`);
  }
  if (query.after !== undefined) {
    const columns = (query.orderBy ?? []).map((o) => o.column);
    if (columns.length === 0) throw new HttpFail(400, '"after" requiere "orderBy"');
    if (new Set((query.orderBy ?? []).map((o) => o.direction === 'desc' ? 'desc' : 'asc')).size !== 1) {
      throw new HttpFail(400, '"after" exige la misma dirección en todas las columnas de "orderBy"');
    }
    if (Object.keys(query.after).join() !== columns.join()) {
      throw new HttpFail(400, '"after" debe tener exactamente las columnas de "orderBy", en el mismo orden');
    }
    if (Object.values(query.after).some((v) => v === null)) throw new HttpFail(400, '"after" no admite NULL');
  }
  return { ...query, limit: Math.min(query.limit ?? MAX_ROWS, MAX_ROWS) };
};

