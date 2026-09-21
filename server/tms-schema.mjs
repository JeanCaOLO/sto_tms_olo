import { tmsQuery } from "./tms-db.mjs";
import { isKnownTable, findForeignKey } from "./tms-relations.mjs";

// Cache de columnas reales por tabla, cargado una vez al iniciar el server.
// Toda referencia a nombre de tabla/columna que llegue desde el cliente se
// valida contra este cache antes de interpolarse en SQL (whitelist, no
// input directo del cliente entra nunca al texto de la query).
let COLUMNS = null;

export async function loadSchema() {
  const res = await tmsQuery(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `);
  const map = {};
  for (const row of res.rows) {
    (map[row.table_name] ??= new Set()).add(row.column_name);
  }
  COLUMNS = map;
  return map;
}

export function tableColumns(table) {
  if (!COLUMNS) throw new Error("Schema aún no cargado (loadSchema)");
  if (!isKnownTable(table) || !COLUMNS[table]) {
    throw new HttpError(400, `Tabla desconocida: "${table}"`);
  }
  return COLUMNS[table];
}

export function assertColumn(table, column) {
  const cols = tableColumns(table);
  if (!cols.has(column)) {
    throw new HttpError(400, `Columna desconocida "${column}" en "${table}"`);
  }
  return column;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Comillas dobles para identificadores; sólo se llama sobre valores ya
// validados por assertColumn/isKnownTable, nunca sobre texto crudo del cliente.
export function q(ident) {
  return `"${String(ident).replace(/"/g, '""')}"`;
}

export { findForeignKey, isKnownTable };
