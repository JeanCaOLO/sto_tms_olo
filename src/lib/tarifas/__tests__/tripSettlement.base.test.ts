// @vitest-environment jsdom
//
// La base del cálculo nunca se elige al liquidar: un tercero se calcula con la forma de cobro de su
// catálogo (carriers.rate_type) y, si no la tiene, se bloquea; la flota propia siempre usa su
// estructura de costos.

import { beforeEach, describe, expect, it } from 'vitest';
import { calculateTrip } from '../tripSettlement';
import { loadDatabase } from '../data/memory/store';
import { listLiquidableTrips } from '../tripsDataSource';
import type { TripRecord } from '../types';

beforeEach(() => { localStorage.clear(); });

async function viajeDeTercero(): Promise<TripRecord> {
  const viaje = (await listLiquidableTrips({ countryId: 'VE', carrierId: 'CARRIER_VE_1' }))[0];
  if (!viaje) throw new Error('la semilla no trae viajes de CARRIER_VE_1');
  return viaje;
}

describe('base del cálculo según el catálogo', () => {
  it('un tercero se calcula con la forma de cobro de su transportista, sin bloqueos de base', async () => {
    const r = await calculateTrip(await viajeDeTercero());
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.calculation.blockingIssues.map((i) => i.code)).not.toContain('BASE_NO_DEFINIDA');
    expect(r.calculation.result.base?.method).toBe('FIXED');
  });

  it('un viaje de tercero sin transportista queda bloqueado, no cae a km', async () => {
    const r = await calculateTrip({ ...(await viajeDeTercero()), carrierId: null });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.calculation.blockingIssues).toContainEqual(expect.objectContaining({ code: 'BASE_NO_DEFINIDA' }));
  });
});

describe('tendering: el monto adjudicado al viaje es la base', () => {
  async function conTendering(): Promise<TripRecord> {
    const viaje = await viajeDeTercero();
    const carrier = loadDatabase().carriers.find((c) => c.id === viaje.carrierId);
    if (!carrier) throw new Error('el viaje no tiene transportista en la semilla');
    carrier.rate_type = 'TENDERING';
    return viaje;
  }
  const adjudicar = (viaje: TripRecord, carrierId: string, amount: string) => {
    loadDatabase().tripTenderAwards.push({
      id: 'tnd_test', country_id: viaje.countryId, trip_id: viaje.id, carrier_id: carrierId, amount,
      awarded_at: null, actor: null, notes: null,
    });
  };

  it('con adjudicación se liquida ese monto, sin bloqueos de base', async () => {
    const viaje = await conTendering();
    adjudicar(viaje, viaje.carrierId!, '1234');
    const r = await calculateTrip(viaje);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.calculation.blockingIssues.map((i) => i.code)).not.toContain('BASE_NO_DEFINIDA');
    expect(r.calculation.result.base).toMatchObject({ method: 'FIXED', source: { kind: 'TENDER' } });
    expect(r.calculation.result.trace.find((l) => l.ruleCode === 'BASE_FIJA_TENDERING')?.final).toBe('1234.00');
  });

  it('sin adjudicación queda bloqueado con el motivo, no cae a otra base', async () => {
    const r = await calculateTrip(await conTendering());
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.calculation.blockingIssues).toContainEqual(
      expect.objectContaining({ code: 'BASE_NO_DEFINIDA', message: expect.stringContaining('adjudicado') }),
    );
  });

  it('una adjudicación de otro transportista bloquea', async () => {
    const viaje = await conTendering();
    adjudicar(viaje, 'CARRIER_VE_2', '1234');
    const r = await calculateTrip(viaje);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.calculation.blockingIssues).toContainEqual(
      expect.objectContaining({ code: 'BASE_NO_DEFINIDA', message: expect.stringContaining('otro transportista') }),
    );
  });
});
