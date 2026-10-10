// Aplicación de plantillas de estructura de costos.

import { db, type Row } from '../data';
import type { CostStructureParams } from '../types';
import { toCostStructure } from './schema';
import { newId } from './ids';
import { validateStructure } from './validation';
import type { CostRowInput, ApplyTemplateInput, ApplyTemplateResult } from './types';

function rowValues(structureId: string, input: CostRowInput, order: number): Row {
  return {
    structure_id: structureId,
    code: input.code,
    label: input.label,
    driver: input.driver,
    amount: input.amount,
    sign: input.sign,
    applies_when: input.appliesWhen,
    unit: input.unit,
    row_order: order,
    active: input.active,
    cost_group: input.group ?? null,
    frequency: input.frequency ?? null,
    frequency_qty: input.frequencyQty ?? null,
    unit_qty: input.unitQty ?? null,
    cost_per_km: input.costPerKm ?? null,
    truck_type: input.truckType ?? null,
  };
}

/**
 * Deja la estructura de ese ámbito (compañía o país) con EXACTAMENTE las filas de la plantilla:
 * reemplaza las que había. Todo en una transacción — una carga a medias dejaría un costo que parece
 * válido y está incompleto. El id de una estructura nueva se genera acá porque dentro de una
 * transacción por HTTP el servidor no devuelve la fila hasta confirmar.
 */
export async function applyCostTemplate(input: ApplyTemplateInput): Promise<ApplyTemplateResult> {
  const errors = validateStructure({
    partyId: input.partyId, countryId: input.countryId, name: input.name,
    operatingDaysPerMonth: input.operatingDaysPerMonth, effectiveFrom: null, active: true, notes: null,
  });
  if (Object.keys(errors).length > 0) {
    return { status: 'failed', error: { message: Object.values(errors).join(' ') } };
  }

  try {
    return await db().transaction(async (tx) => {
      const existing = await tx.find('costStructure', {
        where: [
          { column: 'party_id', op: 'eq', value: input.partyId },
          ...(input.partyId === null ? [{ column: 'country_id', op: 'eq' as const, value: input.countryId }] : []),
          { column: 'active', op: 'eq', value: true },
        ],
        limit: 1,
      });

      const values: Row = {
        party_id: input.partyId,
        country_id: input.countryId,
        name: input.name.trim(),
        operating_days_per_month: input.operatingDaysPerMonth,
        params: input.params,
        active: true,
      };

      let structureId: string;
      if (existing[0]) {
        structureId = existing[0].id;
        await tx.update('costStructure', structureId, values);
        const old = await tx.find('costStructureRow', {
          where: [{ column: 'structure_id', op: 'eq', value: structureId }],
        });
        for (const row of old) await tx.delete('costStructureRow', row.id);
      } else {
        structureId = newId('cstr');
        await tx.insert('costStructure', { id: structureId, effective_from: null, notes: null, ...values });
      }

      let order = 0;
      for (const row of input.rows) {
        await tx.insert('costStructureRow', rowValues(structureId, row, order));
        order += 1;
      }
      return { status: 'saved' as const, structureId, inserted: order };
    });
  } catch (error) {
    return { status: 'failed', error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
