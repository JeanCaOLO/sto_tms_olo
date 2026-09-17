// Validación del dominio de compañías a liquidar. Son tests de lógica pura: no montan React ni
// tocan el almacén — es justo el motivo de que la validación viva en `parties.ts` y no dentro del
// modal.

import { describe, expect, it } from 'vitest';
import {
  isValid,
  normalizeParty,
  suggestCode,
  suggestedTaxIdType,
  validateParty,
  type SettlementPartyInput,
} from '../parties';

function party(overrides: Partial<SettlementPartyInput> = {}): SettlementPartyInput {
  return {
    country_id: 'CR',
    classification: 'OUTSOURCED',
    code: 'TR-CR-001',
    name: 'Transportes del Valle',
    tax_id: '3-101-123456',
    tax_id_type: 'CEDULA_JURIDICA',
    carrier_id: null,
    contact_name: null,
    email: null,
    phone: null,
    address: null,
    status: 'active',
    notes: null,
    ...overrides,
  };
}

const sinOtras = { existing: [] };

describe('validateParty — campos obligatorios comunes', () => {
  it('acepta una compañía completa', () => {
    expect(isValid(validateParty(party(), sinOtras))).toBe(true);
  });

  it('exige nombre, código y país', () => {
    const errors = validateParty(party({ name: '  ', code: '', country_id: '' }), sinOtras);
    expect(errors.name).toBeDefined();
    expect(errors.code).toBeDefined();
    expect(errors.country_id).toBeDefined();
  });

  it('rechaza un correo con formato inválido y acepta uno válido', () => {
    expect(validateParty(party({ email: 'no-es-correo' }), sinOtras).email).toBeDefined();
    expect(validateParty(party({ email: 'ops@transportes.cr' }), sinOtras).email).toBeUndefined();
  });
});

describe('validateParty — lo que distingue a un tercero de la flota propia', () => {
  it('un tercero sin identificación fiscal no es válido', () => {
    const errors = validateParty(party({ tax_id: null, tax_id_type: null }), sinOtras);
    expect(errors.tax_id).toBeDefined();
    expect(errors.tax_id_type).toBeDefined();
  });

  it('la flota propia sí puede no tener identificación fiscal', () => {
    const errors = validateParty(
      party({ classification: 'OWN', tax_id: null, tax_id_type: null }),
      sinOtras,
    );
    expect(errors.tax_id).toBeUndefined();
    expect(errors.tax_id_type).toBeUndefined();
    expect(isValid(errors)).toBe(true);
  });
});

describe('validateParty — unicidad', () => {
  const otra = { id: 'P1', code: 'TR-CR-001', country_id: 'CR', carrier_id: 'TMS_1' };

  it('rechaza un código repetido dentro del mismo país', () => {
    expect(validateParty(party(), { existing: [otra] }).code).toBeDefined();
  });

  it('compara códigos sin distinguir mayúsculas ni espacios', () => {
    expect(validateParty(party({ code: '  tr-cr-001 ' }), { existing: [otra] }).code).toBeDefined();
  });

  it('permite el mismo código en países distintos', () => {
    expect(validateParty(party({ country_id: 'VE' }), { existing: [otra] }).code).toBeUndefined();
  });

  it('no se choca consigo misma al editar', () => {
    const errors = validateParty(party({ id: 'P1' }), { existing: [otra] });
    expect(errors.code).toBeUndefined();
  });

  it('rechaza enlazar dos compañías al mismo transportista del TMS', () => {
    expect(validateParty(party({ carrier_id: 'TMS_1' }), { existing: [otra] }).carrier_id).toBeDefined();
  });

  it('varias compañías sin enlace al TMS no se estorban', () => {
    const sinEnlace = { id: 'P2', code: 'OTRO', country_id: 'CR', carrier_id: null };
    expect(validateParty(party({ carrier_id: null }), { existing: [sinEnlace] }).carrier_id).toBeUndefined();
  });
});

describe('normalizeParty', () => {
  it('recorta, pasa el código a mayúsculas y convierte los vacíos en null', () => {
    const normalized = normalizeParty(
      party({ code: ' tr-cr-002 ', name: '  Transportes X  ', phone: '   ', email: ' a@b.co ' }),
    );
    expect(normalized.code).toBe('TR-CR-002');
    expect(normalized.name).toBe('Transportes X');
    expect(normalized.phone).toBeNull();
    expect(normalized.email).toBe('a@b.co');
  });
});

describe('sugerencias', () => {
  it('propone el tipo fiscal según el país y cae en OTRO si no lo conoce', () => {
    expect(suggestedTaxIdType('VE')).toBe('RIF');
    expect(suggestedTaxIdType('CO')).toBe('NIT');
    expect(suggestedTaxIdType('CR')).toBe('CEDULA_JURIDICA');
    expect(suggestedTaxIdType('MX')).toBe('OTRO');
  });

  it('numera el código por clasificación y país', () => {
    const existing = [
      { code: 'TR-CR-001', country_id: 'CR', classification: 'OUTSOURCED' as const },
      { code: 'FP-CR-001', country_id: 'CR', classification: 'OWN' as const },
      { code: 'TR-VE-001', country_id: 'VE', classification: 'OUTSOURCED' as const },
    ];
    expect(suggestCode('OUTSOURCED', 'CR', existing)).toBe('TR-CR-002');
    expect(suggestCode('OWN', 'CR', existing)).toBe('FP-CR-002');
    expect(suggestCode('OUTSOURCED', 'MX', existing)).toBe('TR-MX-001');
  });
});
