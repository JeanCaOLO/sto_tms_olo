// Importación de lotes de filas de costo.

import { db, type Row } from '../data';
import { rowValues, rowPatch } from './rowMapper';
import type { CostRowInput, ImportOutcome } from './types';
import { listRows } from './queries';

/**
 * Importa un lote de filas. `mode`:
 *   - 'replace': borra las existentes y deja solo las nuevas
 *   - 'append' : las agrega al final, conservando las que había
 *
 * Todo dentro de una transacción: una importación a medias deja un costo que parece correcto y
 * está incompleto, que es peor que no importar nada.
 */
export async function importRows(
  structureId: string,
  inputs: CostRowInput[],
  mode: 'replace' | 'append',
): Promise<ImportOutcome> {
  try {
    return await db().transaction(async (tx) => {
      const existing = await tx.find('costStructureRow', {
        where: [{ column: 'structure_id', op: 'eq', value: structureId }],
      });

      if (mode === 'replace') {
        for (const row of existing) await tx.delete('costStructureRow', row.id);
      }

      const base = mode === 'append' && existing.length > 0
        ? Math.max(...existing.map((r) => Number(r.row_order ?? 0))) + 1
        : 0;

      // Los códigos tienen que ser únicos dentro de la estructura: dos filas con el mismo código
      // harían ambiguo el desglose.
      const used = new Set(
        mode === 'append' ? existing.map((r) => String(r.code)) : [],
      );

      let inserted = 0;
      for (const input of inputs) {
        let code = input.code;
        if (used.has(code)) {
          let n = 2;
          while (used.has(`${code}_${n}`)) n += 1;
          code = `${code}_${n}`;
        }
        used.add(code);
        await tx.insert('costStructureRow', rowValues(structureId, { ...input, code }, base + inserted));
        inserted += 1;
      }

      return { error: null, inserted };
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      inserted: 0,
    };
  }
}
