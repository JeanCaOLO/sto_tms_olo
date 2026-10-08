// @vitest-environment jsdom
//
// Los pedidos de un viaje: avance (para auditar los incompletos), mercancía que se mide y se
// reparte, y las marcas de anular / liquidar después.

import { beforeEach, describe, expect, it } from 'vitest';
import { allocateTotal, allocationAddsUp } from '../allocation';
import { calculateTrip } from '../tripSettlement';
import { listPendingTrips, listTripOrders, setOrderMark } from '../tripsDataSource';
import { emitSettlement, getSettlement } from '../settlementsDataSource';
import { cargoFromOrders, snapshotOrders, toTripOrder, tripProgress } from '../tripOrders';
import { makeCountryVE } from './fixtures';
import type { TripOrder } from '../types';

beforeEach(() => { localStorage.clear(); });

const order = (id: string, customer: string, value: string, extra: Partial<TripOrder> = {}): TripOrder => ({
  guideId: `g-${id}`, guideNumber: `GD-${id}`, sequence: Number(id), deliveryStatus: 'delivered',
  orderId: `o-${id}`, orderNumber: `PED-${id}`, customerId: customer, customerCode: customer, customerName: customer,
  value, weightKg: 10, volumeM3: 1, items: 2, mark: null, markReason: null, ...extra,
});

describe('tripProgress', () => {
  const base = { status: 'completed', guideCount: 4, deliveredGuides: 4, totalStops: 4, completedStops: 4 } as const;

  it('completado y todo entregado = completo', () => {
    expect(tripProgress(base)).toMatchObject({ complete: true, label: 'Completo' });
  });
  it('completado con pedidos sin entregar = incompleto y lo dice', () => {
    expect(tripProgress({ ...base, deliveredGuides: 3 })).toMatchObject({
      complete: false, delivered: 3, total: 4, label: '3 de 4 pedidos entregados',
    });
  });
  it('un viaje no completado nunca es completo', () => {
    expect(tripProgress({ ...base, status: 'in_progress' })).toMatchObject({ complete: false, label: 'Viaje no completado' });
  });
  it('paradas sin completar también cuentan', () => {
    expect(tripProgress({ ...base, completedStops: 3 }).complete).toBe(false);
  });
});

describe('cargoFromOrders', () => {
  it('agrupa por casa comercial y suma valor, peso y pedidos', () => {
    const c = cargoFromOrders([order('1', 'EPA', '3000'), order('2', 'EPA', '500'), order('3', 'COF', '1500')])!;
    expect(c.value).toBe('5000.00');
    expect(c.orders).toBe(3);
    expect(c.parts.map((p) => [p.name, p.value, p.orders])).toEqual([['COF', '1500.00', 1], ['EPA', '3500.00', 2]]);
  });

  it('un pedido anulado no cuenta; uno diferido sí, y queda anotado', () => {
    const c = cargoFromOrders([
      order('1', 'EPA', '3000'),
      order('2', 'EPA', '500', { mark: 'ANULADO', markReason: 'devuelto completo' }),
      order('3', 'COF', '1500', { mark: 'DIFERIDO' }),
    ])!;
    expect(c.value).toBe('4500.00');
    expect(c.orders).toBe(2);
    expect(c.parts.find((p) => p.name === 'COF')?.deferredOrders).toBe(1);
    expect(c.parts.find((p) => p.name === 'EPA')?.deferredOrders).toBe(0);
  });

  it('un pedido que aparece en dos guías cuenta una vez', () => {
    const c = cargoFromOrders([order('1', 'EPA', '100'), order('1', 'EPA', '100', { guideId: 'g-otra' })])!;
    expect(c.orders).toBe(1);
    expect(c.value).toBe('100.00');
  });

  it('sin pedidos, o todos anulados, no hay mercancía', () => {
    expect(cargoFromOrders([])).toBeNull();
    expect(cargoFromOrders([order('1', 'EPA', '10', { mark: 'ANULADO' })])).toBeNull();
  });

  it('el reparto sigue cuadrando al centavo y avisa de la proforma pendiente', () => {
    const cargo = cargoFromOrders([order('1', 'EPA', '3000'), order('2', 'COF', '1000', { mark: 'DIFERIDO' })]);
    const a = allocateTotal('1000.00', cargo, 'VALUE', makeCountryVE())!;
    expect(allocationAddsUp(a)).toBe(true);
    expect(a.shares.find((s) => s.name === 'COF')).toMatchObject({ amount: '250.00', deferredOrders: 1 });
    expect(a.shares.find((s) => s.name === 'EPA')?.deferredOrders).toBeUndefined();
  });
});

describe('snapshotOrders / toTripOrder', () => {
  it('congela qué pasó con cada pedido', () => {
    const snap = snapshotOrders([
      order('1', 'EPA', '10'),
      order('2', 'EPA', '20', { mark: 'ANULADO', markReason: 'x' }),
      order('3', 'COF', '30', { mark: 'DIFERIDO' }),
    ]);
    expect(snap.map((o) => o.status)).toEqual(['INCLUIDO', 'ANULADO', 'DIFERIDO']);
    expect(snap[1].reason).toBe('x');
  });

  it('ignora una marca desconocida', () => {
    expect(toTripOrder({ id: 'g', value: '1', mark: 'RARA' }).mark).toBeNull();
  });
});

describe('con la capa de datos', () => {
  const VIAJE = 'TRIP_RT_VE_A1';

  it('lista los pedidos del viaje, uno por guía', async () => {
    const orders = await listTripOrders(VIAJE);
    expect(orders.map((o) => o.orderNumber)).toEqual(['PED-1001', 'PED-1002', 'PED-1003']);
  });

  it('anular exige un motivo', async () => {
    const r = await setOrderMark({ trip: { id: VIAJE, countryId: 'VE' }, orderId: 'ORD_1', mark: 'ANULADO' });
    expect(r.error).toMatch(/por qué/i);
  });

  it('la marca persiste, cambia la mercancía y se quita; no cambia lo que se paga', async () => {
    const trip = { id: VIAJE, countryId: 'VE' };
    const antes = await calculateTrip(VIAJE);
    if (antes.status !== 'ok') throw new Error('no calcula');
    expect(antes.calculation.result.margin.cargoValue).toBe('5000.00');

    expect((await setOrderMark({ trip, orderId: 'ORD_2', mark: 'ANULADO', reason: 'pedido duplicado' })).error).toBeNull();
    expect((await setOrderMark({ trip, orderId: 'ORD_3', mark: 'DIFERIDO' })).error).toBeNull();

    const orders = await listTripOrders(VIAJE);
    expect(orders.map((o) => o.mark)).toEqual([null, 'ANULADO', 'DIFERIDO']);

    const despues = await calculateTrip(VIAJE);
    if (despues.status !== 'ok') throw new Error('no calcula');
    expect(despues.calculation.result.totalLiquidado).toBe(antes.calculation.result.totalLiquidado);
    expect(despues.calculation.result.margin.cargoValue).toBe('4500.00');
    const share = despues.calculation.result.allocation!.shares.find((s) => s.name === 'Cofersa');
    expect(share?.deferredOrders).toBe(1);

    // Quitar la marca vuelve a incluir el pedido.
    await setOrderMark({ trip, orderId: 'ORD_2', mark: null });
    expect((await listTripOrders(VIAJE)).map((o) => o.mark)).toEqual([null, null, 'DIFERIDO']);
  });

  it('la liquidación guarda la foto de los pedidos con su marca', async () => {
    const trip = { id: VIAJE, countryId: 'VE' };
    await setOrderMark({ trip, orderId: 'ORD_3', mark: 'DIFERIDO' });
    const r = await calculateTrip(VIAJE);
    if (r.status !== 'ok') throw new Error('no calcula');
    const c = r.calculation;
    const saved = await emitSettlement({
      trip: c.trip, partyId: c.partyId, edits: { customVars: {} }, status: 'Borrador', notes: null,
      marginReason: null, context: c.context, calc: c.result, totalAmount: c.result.totalLiquidado,
      orders: snapshotOrders(c.orders),
    });
    expect(saved.status).toBe('saved');
    if (saved.status !== 'saved') return;
    const leida = await getSettlement(saved.settlement.id);
    expect(leida?.orders?.map((o) => o.status)).toEqual(['INCLUIDO', 'INCLUIDO', 'DIFERIDO']);
  });
});

describe('listPendingTrips', () => {
  it('los listos son los completados; los incompletos incluyen los no completados', async () => {
    const listos = await listPendingTrips('ready', { countryId: 'VE' });
    const incompletos = await listPendingTrips('incomplete', { countryId: 'VE' });
    const todos = await listPendingTrips('all', { countryId: 'VE' });
    expect(listos.every((t) => t.status === 'completed')).toBe(true);
    expect(incompletos.map((t) => t.id)).toContain('TRIP_PLANIFICADO_1');
    expect(incompletos.map((t) => t.id)).not.toContain('TRIP_RT_VE_A2');
    expect(todos.length).toBe(listos.length + incompletos.length);
  });
});
