// @vitest-environment jsdom
//
// Los flujos reales de la app (emitir, re-liquidar, configurar costos) contra la semilla demo, pasando por el
// cliente HTTP verdadero y el backend simulado. Es lo más parecido a Aurora que se puede correr sin túnel:
// si un flujo funciona con el almacén en memoria pero devuelve algo distinto por HTTP, falla acá.

import { beforeEach, describe, expect, it } from 'vitest';
import demoSeed from '../data/memory/seed.demo.json';
import { createFakeBackend } from '../data/memory/fakeBackend';
import { MOCK_COUNTRY_IDS } from '../data/memory/mockIds';
import { setSeed } from '../data/memory/store';
import { HttpDataSource } from '../data/http-datasource';
import { setDataSource } from '../data';
import { invalidateCatalogCache } from '../catalogLoader';
import { calculateTrip } from '../tripSettlement';
import { getTrip, listLiquidableTrips } from '../tripsDataSource';
import { emitSettlement, reliquidateSettlement, updateSettlementStatus, type SettlementInput } from '../settlementsDataSource';
import { addRow, listRows, saveStructure } from '../costStructureDataSource';
import { snapshotOrders } from '../tripOrders';

beforeEach(() => {
  setSeed(demoSeed);
  setDataSource(new HttpDataSource({
    baseUrl: 'http://mock.local/api', fetchImpl: createFakeBackend(), retries: 0,
  }));
  invalidateCatalogCache();
});

type Calculation = Extract<Awaited<ReturnType<typeof calculateTrip>>, { status: 'ok' }>['calculation'];
const toInput = (c: Calculation, notes: string | null = null): SettlementInput => ({
  trip: c.trip, partyId: c.partyId, edits: { customVars: {} }, status: 'Borrador', notes, marginReason: null, context: c.context,
  calc: c.result, totalAmount: c.result.totalLiquidado,
  rulesUsed: c.input.rules.filter((r) => c.result.trace.some((l) => l.ruleId === r.id)),
  orders: c.orders.length > 0 ? snapshotOrders(c.orders) : null,
});

describe('flujos de liquidación por el cliente HTTP', () => {
  it('emite una liquidación, el viaje sale de «por liquidar» y se puede re-liquidar y anular', async () => {
    const [trip] = (await listLiquidableTrips({ countryId: MOCK_COUNTRY_IDS.CR })).filter((t) => t.carrierId && t.destZoneId);
    const calc = await calculateTrip(trip.id, { customVars: {} });
    expect(calc.status).toBe('ok');
    if (calc.status !== 'ok') return;

    const emitted = await emitSettlement(toInput(calc.calculation));
    expect(emitted.status).toBe('saved');
    if (emitted.status !== 'saved') return;

    expect((await listLiquidableTrips({ countryId: MOCK_COUNTRY_IDS.CR })).some((t) => t.id === trip.id)).toBe(false);
    expect((await getTrip(trip.id))?.settlementId).toBe(emitted.settlement.id);

    const again = await calculateTrip(trip.id, { customVars: {} }, { allowSettled: true });
    expect(again.status).toBe('ok');
    if (again.status !== 'ok') return;
    const re = await reliquidateSettlement(emitted.settlement.id, toInput(again.calculation, 'Recálculo'), 'Prueba de re-liquidación');
    expect(re.status).toBe('saved');
    if (re.status !== 'saved') return;
    expect((await getTrip(trip.id))?.settlementId).toBe(re.settlement.id);

    expect((await updateSettlementStatus(re.settlement.id, 'Anulado')).error).toBeNull();
    expect((await listLiquidableTrips({ countryId: MOCK_COUNTRY_IDS.CR })).some((t) => t.id === trip.id)).toBe(true);
  });

  it('un viaje sin zona de destino queda bloqueado y no se emite', async () => {
    const sinZona = (await listLiquidableTrips({ countryId: MOCK_COUNTRY_IDS.CR })).find((t) => t.carrierId && !t.destZoneId);
    expect(sinZona).toBeDefined();
    const calc = await calculateTrip(sinZona!.id, { customVars: {} });
    expect(calc.status).toBe('ok');
    if (calc.status !== 'ok') return;
    const emitted = await emitSettlement(toInput(calc.calculation));
    expect(emitted.status).toBe('blocked');
  });
});

describe('costos por el cliente HTTP', () => {
  it('H9: la primera estructura de una compañía y su primer componente se guardan (el id se genera en el cliente)', async () => {
    const countryId = MOCK_COUNTRY_IDS.CR;
    const saved = await saveStructure({
      partyId: null, countryId, name: 'Estructura nueva', operatingDaysPerMonth: 30, effectiveFrom: null, active: true, notes: null,
    });
    expect(saved.status).toBe('saved');
    if (saved.status !== 'saved') return;
    expect(saved.structure.id).toMatch(/^cstr_/);
    const added = await addRow(saved.structure.id, {
      code: 'CONDUCTOR', label: 'Conductor', driver: 'FIXED', amount: '1000', sign: 'ADD', appliesWhen: null, unit: null, active: true,
    } as never);
    expect(added.error).toBeNull();
    expect(await listRows(saved.structure.id)).toHaveLength(1);
  });
});
