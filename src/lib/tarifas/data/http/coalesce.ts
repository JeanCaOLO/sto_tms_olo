// Inserciones seguidas de la misma tabla → una sola operación `insert_many`.
//
// Importar un tarifario de 350 filas mandaba 350 operaciones en un `/tx`, y el backend corría una
// sentencia por cada una. Con `insert_many` son unas pocas. El orden y la atomicidad no cambian:
// solo se juntan las inserciones que ya eran consecutivas.

import type { TxOperation } from './transport';

export function coalesceInserts(operations: TxOperation[]): TxOperation[] {
  const out: TxOperation[] = [];
  let run: TxOperation[] = [];

  const flush = () => {
    if (run.length === 1) out.push(run[0]);
    else if (run.length > 1) out.push({ op: 'insert_many', table: run[0].table, rows: run.map((o) => o.values as NonNullable<TxOperation['values']>) });
    run = [];
  };

  for (const operation of operations) {
    if (operation.op === 'insert' && (run.length === 0 || run[0].table === operation.table)) {
      run.push(operation);
      continue;
    }
    flush();
    if (operation.op === 'insert') run.push(operation);
    else out.push(operation);
  }
  flush();
  return out;
}
