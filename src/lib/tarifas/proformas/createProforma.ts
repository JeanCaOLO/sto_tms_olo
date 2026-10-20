// Crear una proforma: agrupa las liquidaciones elegidas de UN transportista y copia las fases del país.

import { db, findMany } from '../data';
import { usuarioActual } from '../settlements/audit';
import { buildPhases } from './buildPhases';
import type { GroupableSettlement } from './groupByCarrier';
import { itemToRow, phaseToRow, rowToFlowPhase, rowToProforma } from './mapRows';
import { nextProformaNumber } from './nextProformaNumber';
import { proformaAuditRow } from './proformaAudit';
import { proformaTotal } from './proformaTotals';
import type { ProformaItem, ProformaRecord } from './types';

export interface CreateProformaInput {
  countryId: string;
  carrierId: string;
  carrierName: string;
  currency: string;
  settlements: GroupableSettlement[];
}

export type CreateProformaResult = { error: string; proforma?: undefined } | { error: null; proforma: ProformaRecord };

const NUMBER_PAGE = 2000;

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function existingNumbers(countryId: string): Promise<string[]> {
  const numbers: string[] = [];
  let after: string | null = null;
  for (;;) {
    const page = await db().find('proforma', {
      where: [{ column: 'country_id', op: 'eq', value: countryId }],
      columns: ['id', 'number'],
      orderBy: [{ column: 'id', direction: 'asc' }],
      limit: NUMBER_PAGE,
      ...(after === null ? {} : { after: { id: after } }),
    });
    numbers.push(...page.map((r) => String(r.number)));
    if (page.length < NUMBER_PAGE) return numbers;
    after = String(page[page.length - 1]!.id);
  }
}

function validate(input: CreateProformaInput): string | null {
  if (input.settlements.length === 0) return 'Elige al menos una liquidación para la proforma.';
  if (input.settlements.some((s) => s.carrierId !== input.carrierId)) return 'Una proforma agrupa liquidaciones de un solo transportista.';
  return null;
}

export async function createProforma(input: CreateProformaInput): Promise<CreateProformaResult> {
  const invalid = validate(input);
  if (invalid) return { error: invalid };
  try {
    const [templates, countries, numbers] = await Promise.all([
      db().find('proformaFlowPhase', { where: [{ column: 'country_id', op: 'eq', value: input.countryId }] }),
      findMany(db(), [{ entity: 'country', options: { where: [{ column: 'id', op: 'eq', value: input.countryId }], limit: 1 } }]),
      existingNumbers(input.countryId),
    ]);
    const proformaId = newId('pro');
    const phases = buildPhases(proformaId, templates.map(rowToFlowPhase), () => newId('prp'));
    if (phases.length === 0) return { error: 'Este país no tiene fases de aprobación configuradas. Configúralas en Proformas → Configuración.' };

    const items: ProformaItem[] = input.settlements.map((s) => ({
      id: newId('pri'), proformaId, settlementId: s.id, included: true, exclusionReason: null, amount: s.totalAmount,
    }));
    const now = new Date().toISOString();
    const country = countries[0]?.[0];
    const row = {
      id: proformaId,
      country_id: input.countryId,
      number: nextProformaNumber(numbers, country ? String(country.code ?? '') : null),
      carrier_id: input.carrierId,
      carrier_name: input.carrierName,
      status: 'En Revisión',
      currency: input.currency,
      total_amount: proformaTotal(items).toFixed(2),
      created_by: usuarioActual(),
      email_sent_at: null,
      notes: null,
      created_at: now,
      updated_at: now,
    };
    await db().transaction(async (tx) => {
      await tx.insert('proforma', row);
      for (const item of items) await tx.insert('proformaItem', itemToRow(item));
      for (const phase of phases) await tx.insert('proformaPhase', phaseToRow(phase));
      // Las liquidaciones salen del Borrador: su estado ahora lo lleva la proforma.
      for (const s of input.settlements) await tx.update('settlement', s.id, { status: 'En Revisión', updated_at: now });
      await tx.insert('auditLog', proformaAuditRow('CREATE', proformaId, null, { number: row.number, settlements: items.length }));
    });
    return { error: null, proforma: rowToProforma(row) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
