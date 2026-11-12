// Generación automática de proformas contra el almacén en memoria.

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../data';
import {
  assignPendingSettlements, assignSettlements, listProformas, pickOpenProforma, saveFlowPhases,
  type FlowPhaseDraft, type GroupableSettlement,
} from '..';
import { listSettlementSummaries } from '../../settlements/queryHelpers';

const COUNTRY = 'VE';
const CARRIER = 'CARRIER_VE_1';
const TRIPS = ['TRIP_RT_VE_A1', 'TRIP_RT_VE_A2', 'TRIP_RT_VE_A3'];

const phase = (name: string, roleName: string): FlowPhaseDraft => ({
  name, approverType: 'role', roleName, userId: null, approverLabel: roleName, active: true,
});

async function seed(count: number): Promise<GroupableSettlement[]> {
  const out: GroupableSettlement[] = [];
  for (const [i, tripId] of TRIPS.slice(0, count).entries()) {
    const row = await db().insert('settlement', {
      id: `stl_${i}`, country_id: COUNTRY, trip_id: tripId, party_id: null, number: `LIQ-VE-00${i + 1}`,
      trip_number: `V${i}`, settlement_date: '2026-10-19', status: 'Borrador', currency: 'VES', total_amount: String(100 + i),
      notes: null, trip_info: { carrierId: CARRIER, carrierName: 'Transporte Andino' }, trip_edits: {}, trip: {}, trace: [],
      discarded: [], stage_subtotals: {}, warnings: [], overrides: {}, adhoc_rules: [], rules_used: [], excluded_seqs: [],
      returns: [], created_at: '2026-10-19T10:00:00Z', updated_at: '2026-10-19T10:00:00Z',
    });
    out.push({ id: String(row.id), number: String(row.number), carrierId: CARRIER, carrierName: 'Transporte Andino', totalAmount: 100 + i, currency: 'VES', status: 'Borrador' });
  }
  return out;
}

const status = async (id: string) => (await db().findOne('settlement', id))!.status;

describe('con fases configuradas', () => {
  beforeEach(async () => {
    await saveFlowPhases(COUNTRY, [phase('Revisión', 'Liquidador'), phase('Gerencia', 'Gerente')]);
  });

  it('la primera liquidación crea la proforma y queda En Revisión', async () => {
    const [a] = await seed(1);
    const result = await assignSettlements(COUNTRY, [a!]);
    expect(result).toEqual({ created: 1, added: 0, skipped: null, error: null });
    const [row] = await listProformas(COUNTRY);
    expect(row!.proforma).toMatchObject({ number: 'PRO-VE-001', status: 'En Revisión', totalAmount: 100 });
    expect(await status('stl_0')).toBe('En Revisión');
  });

  it('las siguientes del mismo transportista se suman a la proforma abierta', async () => {
    const [a, b, c] = await seed(3);
    await assignSettlements(COUNTRY, [a!]);
    const second = await assignSettlements(COUNTRY, [b!]);
    const third = await assignSettlements(COUNTRY, [c!]);
    expect(second).toMatchObject({ created: 0, added: 1 });
    expect(third).toMatchObject({ created: 0, added: 1 });
    const rows = await listProformas(COUNTRY);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.proforma.totalAmount).toBe(303);
    expect(await status('stl_2')).toBe('En Revisión');
  });

  it('tras la primera decisión la proforma se cierra y la siguiente liquidación abre otra', async () => {
    const [a, b] = await seed(2);
    await assignSettlements(COUNTRY, [a!]);
    const [first] = await listProformas(COUNTRY);
    await db().update('proformaPhase', first!.phases[0]!.id, { state: 'aprobada', decided_by: 'x', decided_at: '2026-10-20T10:00:00Z' });
    const result = await assignSettlements(COUNTRY, [b!]);
    expect(result).toMatchObject({ created: 1, added: 0 });
    expect((await listProformas(COUNTRY)).map((r) => r.proforma.number).sort()).toEqual(['PRO-VE-001', 'PRO-VE-002']);
  });

  it('una liquidación ya agrupada o que no está en Borrador no se vuelve a asignar', async () => {
    const [a] = await seed(1);
    await assignSettlements(COUNTRY, [a!]);
    expect(await assignSettlements(COUNTRY, [a!])).toMatchObject({ created: 0, added: 0 });
    expect(await assignSettlements(COUNTRY, [{ ...a!, status: 'Aprobado' }])).toMatchObject({ created: 0, added: 0 });
    expect(await listProformas(COUNTRY)).toHaveLength(1);
  });

  it('el barrido agrupa las que quedaron en Borrador sin proforma', async () => {
    await seed(3);
    expect((await assignPendingSettlements(COUNTRY)).created).toBe(1);
    const [row] = await listProformas(COUNTRY);
    expect(row!.proforma.totalAmount).toBe(303);
    expect((await listSettlementSummaries({ countryId: COUNTRY })).every((s) => s.status === 'En Revisión')).toBe(true);
  });

  it('una liquidación liberada (proforma anulada o excluida) NO se reagrupa sola con el barrido', async () => {
    const [a, b] = await seed(2);
    await assignSettlements(COUNTRY, [a!, b!]);
    const [row] = await listProformas(COUNTRY);
    // anular: items excluidos y liquidaciones de vuelta a Borrador (lo que hace el servidor)
    for (const s of ['stl_0', 'stl_1']) await db().update('settlement', s, { status: 'Borrador' });
    for (const item of await db().find('proformaItem', {})) await db().update('proformaItem', String(item.id), { state: 'excluded', exclusion_reason: 'Proforma anulada' });
    await db().update('proforma', row!.proforma.id, { status: 'Anulado' });

    expect(await assignPendingSettlements(COUNTRY)).toMatchObject({ created: 0, added: 0, error: null });
    expect(await status('stl_0')).toBe('Borrador');
    // en cambio una liquidación NUEVA (p. ej. la re-liquidación) sí entra sola
    const fresh = { ...a!, id: 'stl_new', number: 'LIQ-VE-009' };
    await db().insert('settlement', { ...(await db().findOne('settlement', 'stl_0'))!, id: 'stl_new', number: 'LIQ-VE-009', trip_id: 'TRIP_RT_VE_A3' });
    expect((await assignSettlements(COUNTRY, [fresh])).created).toBe(1);
  });

  it('pickOpenProforma ignora las que ya tienen una fase decidida o no están en revisión', async () => {
    const [a] = await seed(1);
    await assignSettlements(COUNTRY, [a!]);
    const [open] = await listProformas(COUNTRY);
    expect(pickOpenProforma([open!])).toBe(open);
    const decided = { ...open!, phases: open!.phases.map((p, i) => (i === 0 ? { ...p, state: 'aprobada' as const } : p)) };
    expect(pickOpenProforma([decided])).toBeNull();
    expect(pickOpenProforma([{ ...open!, proforma: { ...open!.proforma, status: 'Aprobado' } }])).toBeNull();
  });
});

describe('sin fases configuradas', () => {
  it('no crea nada, no falla y la liquidación sigue en Borrador; se agrupa al configurar fases', async () => {
    const [a] = await seed(1);
    expect(await assignSettlements(COUNTRY, [a!])).toEqual({ created: 0, added: 0, skipped: 'no-phases', error: null });
    expect(await listProformas(COUNTRY)).toHaveLength(0);
    expect(await status('stl_0')).toBe('Borrador');

    await saveFlowPhases(COUNTRY, [phase('Revisión', 'Liquidador')]);
    expect((await assignPendingSettlements(COUNTRY)).created).toBe(1);
    expect(await status('stl_0')).toBe('En Revisión');
  });
});
