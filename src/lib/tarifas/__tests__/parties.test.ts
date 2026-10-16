// Compañías a liquidar = transportistas del catálogo + perfil de cálculo. Lógica pura.

import { describe, expect, it } from 'vitest';
import { classificationOf, mergeCarriersWithProfiles } from '../parties';

describe('classificationOf', () => {
  it('flota propia o tercero sale solo de is_flota_propia', () => {
    expect(classificationOf(true)).toBe('OWN');
    expect(classificationOf(false)).toBe('OUTSOURCED');
    // Sin dato no se asume flota propia: se costearía con nómina un viaje que se paga a un tercero.
    expect(classificationOf(null)).toBe('OUTSOURCED');
  });
});

describe('mergeCarriersWithProfiles', () => {
  const carriers = [
    { id: 'c1', code: 'OLO', name: 'OLO', tax_id: null, country_id: 'CR', is_flota_propia: true, status: 'active' },
    { id: 'c2', code: 'T1', name: 'Transmajori', tax_id: '3-101', country_id: 'CR', is_flota_propia: false, status: 'active' },
  ];

  it('un transportista sin perfil aparece igual, con partyId null', () => {
    const [olo, tercero] = mergeCarriersWithProfiles(carriers, [{ id: 'p2', carrier_id: 'c2', status: 'active' }]);
    expect(olo).toMatchObject({ carrierId: 'c1', classification: 'OWN', partyId: null, profileStatus: null });
    expect(tercero).toMatchObject({ carrierId: 'c2', classification: 'OUTSOURCED', partyId: 'p2', profileStatus: 'active' });
  });

  it('los datos maestros salen del catálogo, no del perfil', () => {
    const [, tercero] = mergeCarriersWithProfiles(carriers, [{ id: 'p2', carrier_id: 'c2', status: 'inactive' }]);
    expect(tercero.name).toBe('Transmajori');
    expect(tercero.taxId).toBe('3-101');
    expect(tercero.profileStatus).toBe('inactive');
  });
});
