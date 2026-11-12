// Capa de datos de proformas contra el almacén en memoria (semilla de pruebas, ver src/test/setupTarifas.ts).

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../data';
import {
  createProforma, getEmailConfig, getProformaDetail, groupedSettlementIds, listFlowPhases, listProformas,
  saveEmailConfig, saveFlowPhases, setItemIncluded, canEditItems,
  type FlowPhaseDraft, type GroupableSettlement,
} from '..';

const COUNTRY = 'VE';
const CARRIER = 'CARRIER_VE_1';
const TRIPS = ['TRIP_RT_VE_A1', 'TRIP_RT_VE_A2', 'TRIP_RT_VE_A3'];

const phase = (name: string, roleName: string): FlowPhaseDraft => ({
  name, approverType: 'role', roleName, userId: null, approverLabel: roleName, active: true,
});

async function seedSettlements(): Promise<GroupableSettlement[]> {
  const out: GroupableSettlement[] = [];
  for (const [i, tripId] of TRIPS.entries()) {
    const row = await db().insert('settlement', {
      id: `stl_${i}`, country_id: COUNTRY, trip_id: tripId, party_id: null, number: `LIQ-VE-00${i + 1}`,
      trip_number: `V${i}`, settlement_date: '2026-10-19', status: 'Borrador', currency: 'VES', total_amount: String(100 + i),
      notes: null, trip_info: { carrierId: CARRIER }, trip_edits: {}, trip: {}, trace: [], discarded: [], stage_subtotals: {},
      warnings: [], overrides: {}, adhoc_rules: [], rules_used: [], excluded_seqs: [], returns: [],
      created_at: '2026-10-19T10:00:00Z', updated_at: '2026-10-19T10:00:00Z',
    });
    out.push({ id: String(row.id), number: String(row.number), carrierId: CARRIER, carrierName: 'Transporte Andino', totalAmount: 100 + i, currency: 'VES', status: 'Borrador' });
  }
  return out;
}

const input = (settlements: GroupableSettlement[]) => ({
  countryId: COUNTRY, carrierId: CARRIER, carrierName: 'Transporte Andino', currency: 'VES', settlements,
});

describe('plantilla del flujo', () => {
  it('guarda y reemplaza las fases del país en orden', async () => {
    expect((await saveFlowPhases(COUNTRY, [phase('Revisión', 'Liquidador'), phase('Gerencia', 'Gerente')])).error).toBeNull();
    expect((await listFlowPhases(COUNTRY)).map((p) => [p.position, p.name])).toEqual([[1, 'Revisión'], [2, 'Gerencia']]);
    await saveFlowPhases(COUNTRY, [phase('Única', 'Jefe')]);
    expect((await listFlowPhases(COUNTRY)).map((p) => p.name)).toEqual(['Única']);
  });

  it('rechaza fases sin nombre o sin aprobador', async () => {
    expect((await saveFlowPhases(COUNTRY, [phase(' ', 'Jefe')])).error).toMatch(/nombre/);
    expect((await saveFlowPhases(COUNTRY, [{ ...phase('X', ''), roleName: null }])).error).toMatch(/rol/);
    expect((await saveFlowPhases(COUNTRY, [{ ...phase('X', ''), approverType: 'user', roleName: null }])).error).toMatch(/usuario/);
  });
});

describe('createProforma', () => {
  beforeEach(async () => {
    await saveFlowPhases(COUNTRY, [phase('Revisión', 'Liquidador'), phase('Gerencia', 'Gerente')]);
  });

  it('crea la proforma con número, total, items y copia de las fases', async () => {
    const settlements = await seedSettlements();
    const res = await createProforma(input(settlements));
    expect(res.error).toBeNull();
    const detail = await getProformaDetail(res.proforma!.id);
    expect(detail!.proforma).toMatchObject({ number: 'PRO-VE-001', status: 'En Revisión', totalAmount: 303 });
    expect(detail!.items).toHaveLength(3);
    expect(detail!.phases.map((p) => p.state)).toEqual(['pendiente', 'pendiente']);
    expect(detail!.settlements.size).toBe(3);
    expect((await listProformas(COUNTRY))).toHaveLength(1);
    expect((await db().findOne('settlement', 'stl_0'))!.status).toBe('En Revisión');
  });

  it('no deja agrupar dos veces la misma liquidación', async () => {
    const settlements = await seedSettlements();
    await createProforma(input(settlements));
    expect([...(await groupedSettlementIds())].sort()).toEqual(['stl_0', 'stl_1', 'stl_2']);
    const again = await createProforma(input([settlements[0]!]));
    expect(again.error).toMatch(/otra proforma/);
  });

  it('numera la siguiente proforma', async () => {
    const [a, b, c] = await seedSettlements();
    await createProforma(input([a!]));
    const second = await createProforma(input([b!, c!]));
    expect(second.proforma!.number).toBe('PRO-VE-002');
  });

  it('exige liquidaciones de un solo transportista y fases configuradas', async () => {
    const [a] = await seedSettlements();
    expect((await createProforma(input([]))).error).toMatch(/al menos una/);
    expect((await createProforma(input([{ ...a!, carrierId: 'OTRO' }]))).error).toMatch(/un solo transportista/);
    await saveFlowPhases(COUNTRY, []);
    expect((await createProforma(input([a!]))).error).toMatch(/fases de aprobación/);
  });
});

describe('excluir liquidaciones', () => {
  it('recalcula el total, libera la liquidación y exige motivo', async () => {
    await saveFlowPhases(COUNTRY, [phase('Revisión', 'Liquidador')]);
    const res = await createProforma(input(await seedSettlements()));
    const detail = (await getProformaDetail(res.proforma!.id))!;

    expect((await setItemIncluded(detail.proforma, detail.phases, detail.items, 'stl_2', false, ' ')).error).toMatch(/motivo/);
    const done = await setItemIncluded(detail.proforma, detail.phases, detail.items, 'stl_2', false, 'monto no cuadra');
    expect(done.error).toBeNull();

    const after = (await getProformaDetail(res.proforma!.id))!;
    expect(after.proforma.totalAmount).toBe(201);
    expect(after.items.find((i) => i.settlementId === 'stl_2')).toMatchObject({ included: false, exclusionReason: 'monto no cuadra' });
    expect((await groupedSettlementIds()).has('stl_2')).toBe(false);
    expect((await db().findOne('settlement', 'stl_2'))!.status).toBe('Borrador');
    expect((await db().findOne('settlement', 'stl_1'))!.status).toBe('En Revisión');
  });

  it('no deja quitar todas ni editar con fases ya decididas', async () => {
    await saveFlowPhases(COUNTRY, [phase('Revisión', 'Liquidador')]);
    const [a] = await seedSettlements();
    const res = await createProforma(input([a!]));
    const detail = (await getProformaDetail(res.proforma!.id))!;
    expect((await setItemIncluded(detail.proforma, detail.phases, detail.items, 'stl_0', false, 'x')).error).toMatch(/al menos una/);
    const decided = detail.phases.map((p) => ({ ...p, state: 'aprobada' as const }));
    expect(canEditItems(detail.proforma, decided)).toBe(false);
    expect((await setItemIncluded(detail.proforma, decided, detail.items, 'stl_0', false, 'x')).error).toMatch(/fases decididas/);
  });
});

describe('correo de proformas', () => {
  it('devuelve valores por defecto, valida y guarda por país', async () => {
    const initial = await getEmailConfig(COUNTRY);
    expect(initial).toMatchObject({ id: null, includeCarrierEmail: true });
    expect((await saveEmailConfig({ ...initial, recipients: ['malo'] })).error).toMatch(/no válido/);
    expect((await saveEmailConfig({ ...initial, recipients: ['a@x.com', 'b@y.com'] })).error).toBeNull();
    const saved = await getEmailConfig(COUNTRY);
    expect(saved).toMatchObject({ recipients: ['a@x.com', 'b@y.com'] });
    await saveEmailConfig({ ...saved, includeCarrierEmail: false });
    expect((await getEmailConfig(COUNTRY)).includeCarrierEmail).toBe(false);
  });
});
