// @vitest-environment jsdom
//
// Perfiles de cálculo sobre los transportistas del catálogo. Los transportistas se leen por la
// capa de datos (entidad externa) y NO se editan desde el liquidador.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  carrierBaseForCarrier, deactivateParty, discardNewParty, ensurePartyProfile, getProfileForCarrier,
  listCarrierProfiles, reactivateParty, resolveCarrierBase,
} from '../partiesDataSource';
import { db, ReadOnlyEntityError } from '../data';

beforeEach(() => { localStorage.clear(); });

describe('listCarrierProfiles', () => {
  it('lista transportistas del catálogo con su perfil', async () => {
    const todos = await listCarrierProfiles();
    expect(todos.length).toBeGreaterThan(0);
    const ve1 = todos.find((c) => c.carrierId === 'CARRIER_VE_1');
    expect(ve1?.partyId).toBe('CARRIER_VE_1');
    expect(ve1?.classification).toBe('OUTSOURCED');
  });

  it('filtra flota propia y terceros por is_flota_propia', async () => {
    const propias = await listCarrierProfiles({ classification: 'OWN' });
    const terceros = await listCarrierProfiles({ classification: 'OUTSOURCED' });
    expect(propias.length).toBeGreaterThan(0);
    expect(propias.every((c) => c.classification === 'OWN')).toBe(true);
    expect(terceros.every((c) => c.classification === 'OUTSOURCED')).toBe(true);
  });

  it('filtra por país', async () => {
    const cr = await listCarrierProfiles({ countryId: 'CR' });
    expect(cr.length).toBeGreaterThan(0);
    expect(cr.every((c) => c.countryId === 'CR')).toBe(true);
  });

  it('oculta los perfiles desactivados salvo que se pidan', async () => {
    await deactivateParty('CARRIER_VE_1');
    expect((await listCarrierProfiles()).some((c) => c.carrierId === 'CARRIER_VE_1')).toBe(false);
    expect((await listCarrierProfiles({ includeInactive: true })).some((c) => c.carrierId === 'CARRIER_VE_1')).toBe(true);
  });
});

describe('ensurePartyProfile', () => {
  it('devuelve el perfil existente sin crear otro', async () => {
    const result = await ensurePartyProfile('CARRIER_VE_1');
    expect(result).toEqual({ status: 'saved', partyId: 'CARRIER_VE_1', created: false });
  });

  it('crea el perfil la primera vez, y es idempotente', async () => {
    // Un transportista sin perfil: se le quita el de la semilla borrando lo que lo referencia.
    const [perfil] = await db().find('settlementParty', { where: [{ column: 'carrier_id', op: 'eq', value: 'CARRIER_CR_2' }] });
    for (const t of ['partyVariable', 'pricingRule', 'rateTable', 'costStructure'] as const) {
      for (const row of await db().find(t, { where: [{ column: 'party_id', op: 'eq', value: perfil.id }] })) {
        await db().delete(t, row.id);
      }
    }
    await db().delete('settlementParty', perfil.id);
    expect(await getProfileForCarrier('CARRIER_CR_2')).toBeNull();

    const primera = await ensurePartyProfile('CARRIER_CR_2');
    const segunda = await ensurePartyProfile('CARRIER_CR_2');
    expect(primera.status).toBe('saved');
    if (primera.status !== 'saved' || segunda.status !== 'saved') return;
    expect(primera.created).toBe(true);
    expect(segunda).toEqual({ status: 'saved', partyId: primera.partyId, created: false });
  });

  it('no crea perfil para un transportista que no está en el catálogo', async () => {
    expect((await ensurePartyProfile('NO_EXISTE')).status).toBe('failed');
  });
});

describe('baja lógica y catálogo de solo lectura', () => {
  it('desactivar y reactivar el perfil', async () => {
    expect((await deactivateParty('CARRIER_VE_1')).error).toBeNull();
    expect((await getProfileForCarrier('CARRIER_VE_1'))?.status).toBe('inactive');
    expect((await reactivateParty('CARRIER_VE_1')).error).toBeNull();
    expect((await getProfileForCarrier('CARRIER_VE_1'))?.status).toBe('active');
  });

  it('el transportista del catálogo no se edita desde el liquidador', async () => {
    await expect(db().update('carrier', 'CARRIER_VE_1', { name: 'Otro nombre' })).rejects.toThrow(ReadOnlyEntityError);
  });
});

describe('discardNewParty (T3)', () => {
  it('deshace un perfil recién creado y no toca uno que ya tiene configuración', async () => {
    const [perfil] = await db().find('settlementParty', { where: [{ column: 'carrier_id', op: 'eq', value: 'CARRIER_CR_2' }] });
    for (const t of ['partyVariable', 'pricingRule', 'rateTable', 'costStructure'] as const) {
      for (const row of await db().find(t, { where: [{ column: 'party_id', op: 'eq', value: perfil.id }] })) {
        await db().delete(t, row.id);
      }
    }
    await db().delete('settlementParty', perfil.id);

    const created = await ensurePartyProfile('CARRIER_CR_2');
    expect(created.status === 'saved' && created.created).toBe(true);
    if (created.status !== 'saved') return;
    await discardNewParty(created.partyId);
    expect(await getProfileForCarrier('CARRIER_CR_2')).toBeNull();

    await discardNewParty('no-existe'); // nunca lanza
  });
});

// Regresión del paso 2 de "forma de pago": la base del cálculo se hereda de
// carriers.rate_type (sql/35) en vez del selector manual de Liquidaciones.
describe('carrierBaseForCarrier (base de un tercero según el catálogo)', () => {
  it('lee la forma de cobro del carrier de la semilla', async () => {
    expect(await carrierBaseForCarrier('CARRIER_VE_1')).toMatchObject({ override: { method: 'FIXED' } });
  });

  it('un carrier inexistente → motivo, no rompe el cálculo', async () => {
    expect(await carrierBaseForCarrier('NO_EXISTE')).toEqual({ issue: expect.any(String) });
  });

  it('mapea cada tipo calculable a su BaseOverride; TENDERING / vacío / desconocido bloquean', () => {
    expect(resolveCarrierBase('PER_KM')).toEqual({ override: { method: 'PER_KM' } });
    expect(resolveCarrierBase('PER_UNIT')).toEqual({ override: { method: 'PER_UNIT' } });
    expect(resolveCarrierBase('FIXED')).toEqual({ override: { method: 'FIXED' } });
    expect(resolveCarrierBase('VOLUME')).toEqual({ override: { method: 'VOLUME' } });
    expect(resolveCarrierBase('TENDERING')).toEqual({ issue: expect.stringContaining('Tendering') });
    expect(resolveCarrierBase('')).toEqual({ issue: expect.any(String) });
    expect(resolveCarrierBase(null)).toEqual({ issue: expect.any(String) });
    expect(resolveCarrierBase('BASURA')).toEqual({ issue: expect.stringContaining('BASURA') });
  });

  it('tarifa fija con monto lleva el monto; sin monto usa la regla; monto inválido bloquea', () => {
    expect(resolveCarrierBase('FIXED', '150000')).toEqual({ override: { method: 'FIXED', amount: '150000' } });
    expect(resolveCarrierBase('FIXED', 0)).toEqual({ override: { method: 'FIXED', amount: '0' } });
    expect(resolveCarrierBase('FIXED', null)).toEqual({ override: { method: 'FIXED' } });
    expect(resolveCarrierBase('FIXED', '')).toEqual({ override: { method: 'FIXED' } });
    expect(resolveCarrierBase('FIXED', '-5')).toEqual({ issue: expect.any(String) });
    expect(resolveCarrierBase('PER_KM', '150000')).toEqual({ override: { method: 'PER_KM' } });
  });
});
