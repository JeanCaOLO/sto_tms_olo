// @vitest-environment jsdom
//
// Un viaje con devoluciones SIN RECIBIR no se puede liquidar: la pantalla lo dice con un mensaje claro
// ("No se puede liquidar el viaje X porque tiene N devoluciones sin recibir"). Recibidas, completadas, rechazadas o
// canceladas no cuentan. El backend (returns_gate.py) lo hace cumplir aunque la pantalla no lo avise.

import { beforeEach, describe, expect, it } from 'vitest';
import { loadDatabase } from '../data/memory/store';
import { calculateTrip } from '../tripSettlement';
import { notLiquidableReason } from '../tripContext';
import { getTrip, listLiquidableTrips } from '../tripsDataSource';
import type { TripRecord } from '../types';

beforeEach(() => { localStorage.clear(); });

async function viaje(): Promise<TripRecord> {
  const trip = (await listLiquidableTrips({ countryId: 'VE', carrierId: 'CARRIER_VE_1' }))[0];
  if (!trip) throw new Error('la semilla no trae viajes de CARRIER_VE_1');
  return trip;
}

const devolucion = (tripId: string, status: string, id = `dev_${status}_${Math.random()}`) =>
  loadDatabase().tripReturns.push({ id, route_id: tripId, status, return_number: id });

describe('mensaje de un viaje con devoluciones sin recibir', () => {
  it('sin devoluciones sin recibir el viaje se puede liquidar', async () => {
    expect(notLiquidableReason(await viaje())).toBeNull();
  });

  it('dice cuántas son, en plural', async () => {
    const trip = { ...(await viaje()), openReturns: 3 };
    const reason = notLiquidableReason(trip);
    expect(reason).toContain(`No se puede liquidar el viaje ${trip.routeNumber}`);
    expect(reason).toContain('3 devoluciones sin recibir');
    expect(reason).toContain('módulo de Devoluciones');
  });

  it('con una sola, en singular', async () => {
    expect(notLiquidableReason({ ...(await viaje()), openReturns: 1 })).toContain('1 devolución sin recibir');
  });

  it('un viaje no completado sigue diciendo primero que no está completado', async () => {
    expect(notLiquidableReason({ ...(await viaje()), status: 'planned', openReturns: 2 })).toContain('no está completado');
  });
});

describe('el viaje trae sus devoluciones sin recibir', () => {
  it('getTrip cuenta solo las pending y approved de ese viaje', async () => {
    const trip = await viaje();
    devolucion(trip.id, 'pending');
    devolucion(trip.id, 'approved');
    devolucion(trip.id, 'received');
    devolucion(trip.id, 'completed');
    devolucion(trip.id, 'rejected');
    devolucion(trip.id, 'cancelled');
    devolucion('otro-viaje', 'pending');
    expect((await getTrip(trip.id))?.openReturns).toBe(2);
  });

  it('la lista de viajes por liquidar también las trae', async () => {
    const trip = await viaje();
    devolucion(trip.id, 'pending');
    const listed = (await listLiquidableTrips({ countryId: 'VE', carrierId: 'CARRIER_VE_1' })).find((t) => t.id === trip.id);
    expect(listed?.openReturns).toBe(1);
  });

  it('sin devoluciones el conteo es 0', async () => {
    const trip = await viaje();
    expect((await getTrip(trip.id))?.openReturns).toBe(0);
  });

  it('el cálculo del viaje avisa que no se puede liquidar hasta recibirlas', async () => {
    const trip = await viaje();
    devolucion(trip.id, 'pending');
    const result = await calculateTrip((await getTrip(trip.id))!);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.calculation.notLiquidableReason).toContain('sin recibir');
  });

  it('al recibirlas el aviso desaparece', async () => {
    const trip = await viaje();
    devolucion(trip.id, 'received');
    const result = await calculateTrip((await getTrip(trip.id))!);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.calculation.notLiquidableReason).toBeNull();
  });
});
