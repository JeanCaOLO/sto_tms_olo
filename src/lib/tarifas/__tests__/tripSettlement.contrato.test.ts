// @vitest-environment jsdom
//
// Contrato del transportista en la liquidación: un contrato vencido a la fecha del viaje AVISA pero
// deja liquidar (no es un problema bloqueante).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listLiquidableTrips } from '../tripsDataSource';
import type { TripRecord } from '../types';

const contrato = vi.hoisted(() => ({ expiry: null as string | null }));

vi.mock('../partiesDataSource', async (importOriginal) => {
  const real = await importOriginal<typeof import('../partiesDataSource')>();
  return {
    ...real,
    carrierBaseForCarrier: vi.fn(async () => ({
      override: { method: 'FIXED' as const },
      contract: { carrierName: 'Transportes Prueba', contractExpiry: contrato.expiry },
    })),
  };
});

import { calculateTrip } from '../tripSettlement';
import { isContractExpired } from '../carrierContract';

beforeEach(() => { localStorage.clear(); contrato.expiry = null; });

async function viajeDeTercero(): Promise<TripRecord> {
  const viaje = (await listLiquidableTrips({ countryId: 'VE', carrierId: 'CARRIER_VE_1' }))[0];
  if (!viaje) throw new Error('la semilla no trae viajes de CARRIER_VE_1');
  return viaje;
}

describe('isContractExpired', () => {
  it('vence solo si el vencimiento es anterior al día del viaje; sin fecha no vence', () => {
    expect(isContractExpired('2026-09-30', '2026-10-01T12:00:00.000Z')).toBe(true);
    expect(isContractExpired('2026-10-01', '2026-10-01T12:00:00.000Z')).toBe(false);
    expect(isContractExpired('2026-10-02', '2026-10-01')).toBe(false);
    expect(isContractExpired(null, '2026-10-01')).toBe(false);
    expect(isContractExpired('', '2026-10-01')).toBe(false);
  });
});

describe('contrato vencido en el cálculo del viaje', () => {
  it('avisa con CONTRATO_VENCIDO pero no bloquea', async () => {
    contrato.expiry = '2000-01-01';
    const r = await calculateTrip(await viajeDeTercero());
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.calculation.contract).toMatchObject({ contractExpiry: '2000-01-01', expired: true });
    expect(r.calculation.warnings.some((w) => w.startsWith('Contrato vencido el 2000-01-01'))).toBe(true);
    expect(r.calculation.blockingIssues.map((i) => i.code)).not.toContain('CONTRATO_VENCIDO');
  });

  it('un contrato vigente o sin vencimiento no avisa', async () => {
    for (const expiry of ['2999-12-31', null]) {
      contrato.expiry = expiry;
      const r = await calculateTrip(await viajeDeTercero());
      if (r.status !== 'ok') throw new Error(r.message);
      expect(r.calculation.contract?.expired).toBe(false);
      expect(r.calculation.warnings.some((w) => w.startsWith('Contrato vencido'))).toBe(false);
    }
  });
});
