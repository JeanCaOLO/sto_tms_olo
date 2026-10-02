import { q, assertColumn, HttpError } from "./tms-schema.mjs";
import { buildWhereClause } from "./tms-select.mjs";

// INSERT de una o varias filas (mismo shape que `.insert(obj | obj[])` de
// supabase-js). Las columnas se toman de la unión de llaves de todas las filas;
// una fila sin cierta columna inserta NULL en esa posición.
export function buildInsertQuery(table, rows) {
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) throw new HttpError(400, "insert requiere al menos una fila");

  const columns = [...new Set(list.flatMap((r) => Object.keys(r)))];
  columns.forEach((c) => assertColumn(table, c));

  const params = [];
  const valueRows = list.map((row) => {
    const placeholders = columns.map((col) => {
      params.push(col in row ? row[col] : null);
      return `$${params.length}`;
    });
    return `(${placeholders.join(",")})`;
  });

  const columnList = columns.map(q).join(", ");
  const sql = `INSERT INTO ${q(table)} (${columnList}) VALUES ${valueRows.join(", ")} RETURNING *`;
  return { sql, params };
}

export function buildUpdateQuery(table, values, filters) {
  const columns = Object.keys(values);
  if (columns.length === 0) throw new HttpError(400, "update requiere al menos un campo");
  columns.forEach((c) => assertColumn(table, c));

  const params = [];
  const setClauses = columns.map((col) => {
    params.push(values[col]);
    return `${q(col)} = $${params.length}`;
  });

  const { clause, params: whereParams } = buildWhereClause(table, null, filters, params.length + 1);
  params.push(...whereParams);

  let sql = `UPDATE ${q(table)} SET ${setClauses.join(", ")}`;
  if (clause) sql += ` WHERE ${clause}`;
  sql += " RETURNING *";
  return { sql, params };
}

export function buildDeleteQuery(table, filters) {
  const { clause, params } = buildWhereClause(table, null, filters, 1);
  let sql = `DELETE FROM ${q(table)}`;
  if (clause) sql += ` WHERE ${clause}`;
  sql += " RETURNING *";
  return { sql, params };
}
