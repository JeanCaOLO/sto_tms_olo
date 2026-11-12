// Búsqueda en tablas de tarifas: resolución de la fila más específica.

import type { RateTable, RateTableMatch, RateTableRow, VarBag } from '../types';
import { RATE_TABLE_WILDCARD } from '../types';
import { inRange, parseRange } from '../rateRange';
import { tryDecimal } from '../money';
import { looseEq } from './predicates';

export interface RateTableLookup {
  row: RateTableRow;
  match: RateTableMatch;
  /** Otras filas que empataron en especificidad: la tabla es ambigua para este viaje. */
  tiedWith: RateTableRow[];
}


/**
 * Qué fila de la tabla corresponde a este viaje.
 *
 * Gana la MÁS ESPECÍFICA: la que resuelve más columnas con un valor exacto en vez de un comodín.
 * Es la convención de cualquier tabla de decisión y es lo que la gente espera ("la regla más
 * puntual manda sobre la general").
 *
 * El orden es TOTAL —especificidad, luego `order`, luego id— para que el resultado nunca dependa
 * del orden en que la base devolvió las filas. Cuando dos filas empatan en especificidad, el
 * desempate existe pero es arbitrario desde el punto de vista del negocio, así que se informa.
 */
export function lookupRateTable(
  table: RateTable,
  rows: RateTableRow[],
  vars: VarBag,
): RateTableLookup | null {
  const candidatas = rows
    .filter((row) => row.active && row.tableId === table.id)
    .filter((row) => table.keyColumns.every((column, i) => {
      const expected = row.key[i];
      if (expected === undefined || expected === RATE_TABLE_WILDCARD) return true;
      // Una celda con rango ("101..300") cubre todos los valores de ese tramo.
      const range = parseRange(expected);
      if (range) {
        // Un valor vacío o no numérico NO cae en el rango (Number('') valía 0 y casaba con "0..100").
        const value = tryDecimal(vars[column]);
        return value !== null && inRange(value.toNumber(), range);
      }
      return looseEq(vars[column] ?? '', expected);
    }));

  if (candidatas.length === 0) return null;

  const especificidad = (row: RateTableRow): number =>
    table.keyColumns.reduce(
      (acc, _column, i) => acc + (row.key[i] && row.key[i] !== RATE_TABLE_WILDCARD ? 1 : 0),
      0,
    );

  const ordenadas = [...candidatas].sort((a, b) => {
    const porEspecificidad = especificidad(b) - especificidad(a);
    if (porEspecificidad !== 0) return porEspecificidad;
    const porOrden = a.order - b.order;
    if (porOrden !== 0) return porOrden;
    return a.id.localeCompare(b.id);
  });

  const ganadora = ordenadas[0]!;
  const maxEspecificidad = especificidad(ganadora);
  const tiedWith = ordenadas.slice(1).filter((row) => especificidad(row) === maxEspecificidad);

  return {
    row: ganadora,
    match: {
      tableId: table.id,
      tableCode: table.code,
      tablePartyId: table.partyId ?? null,
      rowId: ganadora.id,
      matchedKey: table.keyColumns.map((_c, i) => ganadora.key[i] ?? RATE_TABLE_WILDCARD).join(' | '),
      specificity: maxEspecificidad,
    },
    tiedWith,
  };
}
