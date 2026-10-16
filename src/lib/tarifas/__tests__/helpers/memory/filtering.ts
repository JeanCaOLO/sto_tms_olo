// Filtrado y orden para MemoryDataSource.

import type { Condition, FindOptions, OrderBy, Row } from '../../../data/datasource';

function matches(row: Row, condition: Condition): boolean {
  const actual = row[condition.column];
  switch (condition.op) {
    case 'eq':
      return actual === condition.value;
    case 'neq':
      return actual !== condition.value;
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(actual);
    case 'gt':
      return actual > (condition.value as never);
    case 'gte':
      return actual >= (condition.value as never);
    case 'lt':
      return actual < (condition.value as never);
    case 'lte':
      return actual <= (condition.value as never);
    case 'isNull':
      return actual === null || actual === undefined;
    case 'notNull':
      return actual !== null && actual !== undefined;
  }
}

function compare(a: Row, b: Row, order: OrderBy): number {
  const left = a[order.column];
  const right = b[order.column];
  const sign = order.direction === 'desc' ? -1 : 1;

  if (left === right) return 0;
  if (left === null || left === undefined) return 1; // nulos al final, como NULLS LAST
  if (right === null || right === undefined) return -1;

  if (order.locale) {
    return sign * String(left).localeCompare(String(right));
  }
  return sign * (left < right ? -1 : 1);
}

/** ¿La fila viene después del cursor, en el orden pedido? (Tupla lexicográfica, como `(a, b) < (x, y)` en SQL.) */
function isAfter(row: Row, after: Record<string, unknown>, orderBy: OrderBy[]): boolean {
  for (const order of orderBy) {
    const outcome = compare(row, { [order.column]: after[order.column] }, { ...order, direction: 'asc' });
    if (outcome !== 0) return order.direction === 'desc' ? outcome < 0 : outcome > 0;
  }
  return false; // igual al cursor: ya se entregó
}

export function applyOptions(rows: Row[], options: FindOptions | undefined): Row[] {
  if (!options) return rows.slice();

  let result = options.where?.length
    ? rows.filter((row) => options.where!.every((condition) => matches(row, condition)))
    : rows.slice();

  if (options.orderBy?.length) {
    result.sort((a, b) => {
      for (const order of options.orderBy!) {
        const outcome = compare(a, b, order);
        if (outcome !== 0) return outcome;
      }
      return 0;
    });
  }

  if (options.after) {
    const after = options.after;
    const orderBy = options.orderBy ?? [];
    if (orderBy.length === 0 || Object.keys(after).join() !== orderBy.map((o) => o.column).join()) {
      throw new Error('"after" debe tener exactamente las columnas de "orderBy", en el mismo orden.');
    }
    result = result.filter((row) => isAfter(row, after, orderBy));
  }

  const offset = options.offset ?? 0;
  if (offset > 0 || options.limit !== undefined) {
    result = result.slice(offset, options.limit === undefined ? undefined : offset + options.limit);
  }
  const columns = options.columns;
  if (columns?.length) {
    result = result.map((row) => Object.fromEntries(columns.filter((c) => c in row).map((c) => [c, row[c]])));
  }
  return result;
}

export { matches };
