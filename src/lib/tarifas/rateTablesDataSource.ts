// Tarifarios: alta, baja y carga de filas.
//
// El vacío que llenan: un tarifario real se indexa por combinaciones —zona, tipo de camión, tipo de
// servicio— y con una regla por combinación, 5 zonas × 4 camiones son 20 REGLAS para lo que en una
// planilla son 20 FILAS. La tabla declara qué variables forman su clave y guarda una fila por
// combinación; el motor ya sabía buscar en ella (`lookupRateTable`), pero no había de dónde
// crearla.
//
// Lo que se valida acá y no en el motor: el motor resuelve lo que le den, y ante dos filas igual de
// específicas avisa y elige una. Eso sirve como red al calcular, pero es tardísimo — el número ya
// salió mal en una liquidación. Las claves repetidas y los huecos se rechazan al GUARDAR.

import { db, type Row } from './data';
import { RATE_TABLE_WILDCARD, type RateTable, type RateTableRow, type VarKey } from './types';

/**
 * Variables que pueden formar la clave de un tarifario.
 *
 * Son las CATEGÓRICAS, y la omisión de las numéricas es deliberada: una fila casa por igualdad, así
 * que una clave por `km` solo cobraría cuando el viaje midiera exactamente los kilómetros tecleados
 * —181 no casaría con 180— y el tarifario quedaría mudo casi siempre. Para cobrar por tramos de una
 * magnitud está el operador de escalones, que es lo que ese caso necesita.
 */
export const RATE_TABLE_KEY_VARS = [
  'originZone', 'destZone', 'originZoneGroup', 'destZoneGroup',
  'truckTypeId', 'serviceType', 'fleetType', 'carrierId', 'customerId',
  'countryId', 'weekday',
] as const satisfies readonly VarKey[];

/**
 * Columnas de clave que nombran una ZONA, por su código.
 *
 * Existen para reponer una protección que se perdió al absorber las tarifas zona-a-zona: aquella
 * tabla guardaba el id de la zona y el esquema impedía borrar una zona en uso. Un tarifario guarda
 * el CÓDIGO —es lo que el motor compara— y un código no es una clave foránea, así que sin este
 * chequeo borrar una zona dejaría filas huérfanas que cobran a nadie.
 */
const ZONE_KEY_VARS: readonly VarKey[] = ['originZone', 'destZone'];

// ── Tablas ────────────────────────────────────────────────────────────────────────────────────

export interface RateTableInput {
  countryId: string;
  partyId: string | null;
  code: string;
  name: string;
  keyColumns: VarKey[];
  active: boolean;
}

export type RateTableErrors = Partial<Record<keyof RateTableInput, string>>;

export type SaveRateTableResult =
  | { status: 'saved'; table: RateTable }
  | { status: 'invalid'; errors: RateTableErrors }
  | { status: 'failed'; error: { message: string } };

function toTable(row: Row): RateTable {
  return {
    id: row.id,
    countryId: row.country_id,
    partyId: row.party_id ?? null,
    code: row.code,
    name: row.name,
    keyColumns: (row.key_columns ?? []) as VarKey[],
    active: !!row.active,
  };
}

export async function listRateTables(
  countryId: string,
  options?: { includeInactive?: boolean },
): Promise<RateTable[]> {
  const where: { column: string; op: 'eq'; value: unknown }[] = [
    { column: 'country_id', op: 'eq', value: countryId },
  ];
  if (!options?.includeInactive) where.push({ column: 'active', op: 'eq', value: true });

  const rows = await db().find('rateTable', {
    where,
    orderBy: [{ column: 'code', locale: true }],
  });
  return rows.map(toTable);
}

export async function getRateTable(id: string): Promise<RateTable | null> {
  const row = await db().findOne('rateTable', id);
  return row ? toTable(row) : null;
}

const CODE_SHAPE = /^[A-Z0-9_]+$/;

export function validateRateTable(
  input: RateTableInput,
  existing: Pick<RateTable, 'id' | 'code' | 'countryId' | 'partyId'>[],
  id?: string,
): RateTableErrors {
  const errors: RateTableErrors = {};
  const code = input.code.trim().toUpperCase();

  if (!code) {
    errors.code = 'El código es obligatorio.';
  } else if (!CODE_SHAPE.test(code)) {
    // Es el texto con el que una regla nombra la tabla: si admite espacios o acentos, la expresión
    // guardada y lo tecleado dejan de coincidir por un detalle invisible.
    errors.code = 'Usá solo letras, números y guión bajo (sin espacios ni acentos).';
  } else if (
    existing.some((t) => t.id !== id && t.countryId === input.countryId
      && (t.partyId ?? null) === (input.partyId ?? null)
      && t.code.toUpperCase() === code)
  ) {
    errors.code = 'Ya hay un tarifario con ese código en este ámbito.';
  }

  if (!input.name.trim()) errors.name = 'El nombre es obligatorio.';

  if (input.keyColumns.length === 0) {
    errors.keyColumns = 'Elegí al menos una variable para la clave.';
  } else if (new Set(input.keyColumns).size !== input.keyColumns.length) {
    // Una variable repetida en la clave haría que dos columnas pidan siempre lo mismo: no agrega
    // precisión y duplica lo que hay que teclear en cada fila.
    errors.keyColumns = 'Hay una variable repetida en la clave.';
  }

  return errors;
}

export async function saveRateTable(
  input: RateTableInput,
  id?: string,
): Promise<SaveRateTableResult> {
  const existing = (await db().find('rateTable')).map(toTable);
  const errors = validateRateTable(input, existing, id);
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  // Cambiar la clave de una tabla que ya tiene filas dejaría cada fila con una cantidad de valores
  // que no corresponde a sus columnas. En vez de romper en silencio, las filas se REACOMODAN: se
  // conserva el valor de las columnas que siguen estando y las nuevas entran como comodín.
  const anterior = id ? existing.find((t) => t.id === id) : undefined;
  const reacomodar = anterior && !mismaClave(anterior.keyColumns, input.keyColumns);

  const values: Row = {
    country_id: input.countryId,
    party_id: input.partyId,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    key_columns: input.keyColumns,
    active: input.active,
  };

  try {
    const saved = id
      ? await db().update('rateTable', id, values)
      : await db().insert('rateTable', values);

    if (reacomodar && anterior) await remapRows(anterior, input.keyColumns);

    return { status: 'saved', table: toTable(saved) };
  } catch (error) {
    return {
      status: 'failed',
      error: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

function mismaClave(a: VarKey[], b: VarKey[]): boolean {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}

/** Traslada los valores de cada fila a la nueva clave, emparejando por NOMBRE de columna. */
async function remapRows(anterior: RateTable, nuevaClave: VarKey[]): Promise<void> {
  const rows = await db().find('rateTableRow', {
    where: [{ column: 'table_id', op: 'eq', value: anterior.id }],
  });

  for (const row of rows) {
    const previo = (row.key ?? []) as string[];
    const nueva = nuevaClave.map((columna) => {
      const i = anterior.keyColumns.indexOf(columna);
      return i >= 0 ? (previo[i] ?? RATE_TABLE_WILDCARD) : RATE_TABLE_WILDCARD;
    });
    await db().update('rateTableRow', row.id, { key: nueva });
  }
}

export async function setRateTableActive(id: string, active: boolean): Promise<{ error: string | null }> {
  try {
    await db().update('rateTable', id, { active });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** Borra la tabla y sus filas (cascada declarada en el esquema). */
export async function deleteRateTable(id: string): Promise<{ error: string | null }> {
  try {
    await db().delete('rateTable', id);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

// ── Filas ─────────────────────────────────────────────────────────────────────────────────────

export interface RateTableRowInput {
  tableId: string;
  key: string[];
  amount: string;
  active: boolean;
}

export type RateRowErrors = { key?: string; amount?: string };

export type SaveRateRowResult =
  | { status: 'saved'; row: RateTableRow }
  | { status: 'invalid'; errors: RateRowErrors }
  | { status: 'failed'; error: { message: string } };

function toRow(row: Row): RateTableRow {
  return {
    id: row.id,
    tableId: row.table_id,
    key: (row.key ?? []) as string[],
    amount: String(row.amount),
    order: Number(row.row_order ?? 0),
    active: !!row.active,
  };
}

export async function listRateTableRows(tableId: string): Promise<RateTableRow[]> {
  const rows = await db().find('rateTableRow', {
    where: [{ column: 'table_id', op: 'eq', value: tableId }],
    orderBy: [{ column: 'row_order' }],
  });
  return rows.map(toRow);
}

const AMOUNT_SHAPE = /^-?\d+(\.\d+)?$/;

/** Clave normalizada, para comparar dos filas: vacío es comodín y las mayúsculas no distinguen. */
export function normalizeKey(key: string[], columnCount: number): string[] {
  return Array.from({ length: columnCount }, (_, i) => {
    const raw = (key[i] ?? '').trim();
    return raw === '' ? RATE_TABLE_WILDCARD : raw;
  });
}

function keyFingerprint(key: string[]): string {
  return key.map((v) => v.toUpperCase()).join(' ');
}

export function validateRateRow(
  input: RateTableRowInput,
  table: RateTable,
  existing: RateTableRow[],
  id?: string,
): RateRowErrors {
  const errors: RateRowErrors = {};
  const key = normalizeKey(input.key, table.keyColumns.length);

  // Dos filas con la MISMA clave son igual de específicas: el motor avisaría y elegiría una por
  // orden. Que elija bien de casualidad no es una tarifa, es una moneda al aire.
  const repetida = existing.some(
    (r) => r.id !== id && keyFingerprint(normalizeKey(r.key, table.keyColumns.length)) === keyFingerprint(key),
  );
  if (repetida) {
    errors.key = 'Ya hay una fila con esta misma combinación.';
  }

  const amount = input.amount.trim();
  if (!amount) {
    errors.amount = 'El importe es obligatorio.';
  } else if (!AMOUNT_SHAPE.test(amount)) {
    errors.amount = 'Escribí un número, por ejemplo 1250.50';
  }

  return errors;
}

export async function saveRateRow(
  input: RateTableRowInput,
  id?: string,
): Promise<SaveRateRowResult> {
  const table = await getRateTable(input.tableId);
  if (!table) {
    return { status: 'failed', error: { message: 'El tarifario ya no existe.' } };
  }

  const existing = await listRateTableRows(input.tableId);
  const errors = validateRateRow(input, table, existing, id);
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  const values: Row = {
    table_id: input.tableId,
    key: normalizeKey(input.key, table.keyColumns.length),
    amount: input.amount.trim(),
    row_order: id
      ? (existing.find((r) => r.id === id)?.order ?? 0)
      : existing.reduce((max, r) => Math.max(max, r.order), 0) + 1,
    active: input.active,
  };

  try {
    const saved = id
      ? await db().update('rateTableRow', id, values)
      : await db().insert('rateTableRow', values);
    return { status: 'saved', row: toRow(saved) };
  } catch (error) {
    return {
      status: 'failed',
      error: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

export async function deleteRateRow(id: string): Promise<{ error: string | null }> {
  try {
    await db().delete('rateTableRow', id);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export interface BulkRow {
  key: string[];
  amount: string;
}

export interface BulkResult {
  inserted: number;
  replaced: number;
  error: string | null;
}

/**
 * Carga masiva, para la importación desde planilla.
 *
 * `mode: 'replace'` vacía la tabla antes de cargar; `'merge'` conserva lo que había y pisa la fila
 * cuya clave coincide. Merge es lo que se quiere al recibir una lista de correcciones; replace, al
 * recibir el tarifario nuevo completo. Adivinar cuál de los dos quiso el usuario sería la peor
 * forma de perder datos, así que lo elige él.
 */
export async function bulkUpsertRows(
  tableId: string,
  rows: BulkRow[],
  mode: 'replace' | 'merge',
): Promise<BulkResult> {
  const table = await getRateTable(tableId);
  if (!table) return { inserted: 0, replaced: 0, error: 'El tarifario ya no existe.' };

  try {
    const existing = await listRateTableRows(tableId);

    if (mode === 'replace') {
      for (const row of existing) await db().delete('rateTableRow', row.id);
    }

    const vigentes = mode === 'replace' ? [] : existing;
    const porClave = new Map(
      vigentes.map((r) => [keyFingerprint(normalizeKey(r.key, table.keyColumns.length)), r]),
    );
    let order = vigentes.reduce((max, r) => Math.max(max, r.order), 0);
    let inserted = 0;
    let replaced = 0;

    for (const row of rows) {
      const key = normalizeKey(row.key, table.keyColumns.length);
      const previa = porClave.get(keyFingerprint(key));

      if (previa) {
        await db().update('rateTableRow', previa.id, { amount: row.amount, active: true });
        replaced += 1;
      } else {
        order += 1;
        const saved = await db().insert('rateTableRow', {
          table_id: tableId, key, amount: row.amount, row_order: order, active: true,
        });
        // Una clave repetida DENTRO del mismo archivo tiene que pisar, no duplicar: si no, la
        // importación mete justo la ambigüedad que el alta manual rechaza.
        porClave.set(keyFingerprint(key), toRow(saved));
        inserted += 1;
      }
    }

    return { inserted, replaced, error: null };
  } catch (error) {
    return {
      inserted: 0,
      replaced: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ── Integridad con las zonas ──────────────────────────────────────────────────────────────────

export interface RateTableZoneUse {
  tableCode: string;
  rowKey: string[];
}

/** Filas de tarifario que nombran esta zona. PURA, para poder probarla sin la capa de datos. */
export function rowsUsingZone(
  zoneCode: string,
  tables: Pick<RateTable, 'id' | 'code' | 'keyColumns'>[],
  rows: Pick<RateTableRow, 'tableId' | 'key'>[],
): RateTableZoneUse[] {
  const buscado = zoneCode.trim().toUpperCase();
  if (!buscado) return [];

  const usos: RateTableZoneUse[] = [];
  for (const table of tables) {
    const posiciones = table.keyColumns
      .map((column, i) => (ZONE_KEY_VARS.includes(column) ? i : -1))
      .filter((i) => i >= 0);
    if (posiciones.length === 0) continue;

    for (const row of rows.filter((r) => r.tableId === table.id)) {
      if (posiciones.some((i) => (row.key[i] ?? '').trim().toUpperCase() === buscado)) {
        usos.push({ tableCode: table.code, rowKey: row.key });
      }
    }
  }
  return usos;
}

/** Igual que `rowsUsingZone`, pero leyendo de la base. */
export async function zoneUsedByRateTables(zoneCode: string): Promise<RateTableZoneUse[]> {
  const [tables, rows] = await Promise.all([
    db().find('rateTable'),
    db().find('rateTableRow'),
  ]);
  return rowsUsingZone(
    zoneCode,
    tables.map(toTable),
    rows.map(toRow),
  );
}
