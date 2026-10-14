// @vitest-environment jsdom
//
// La base del cálculo nunca se elige al liquidar: un tercero se calcula con la forma de cobro de su
// catálogo (carriers.rate_type) y, si no la tiene, se bloquea; la flota propia siempre usa su
// estructura de costos.

import { beforeEach, describe, expect, it } from 'vitest';
import { calculateTrip } from '../tripSettlement';
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
