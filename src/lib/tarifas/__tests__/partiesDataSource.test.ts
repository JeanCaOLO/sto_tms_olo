// @vitest-environment jsdom
//
// CRUD de compañías contra el almacén real (JSON + localStorage), más la migración del formato
// viejo. jsdom porque sin localStorage no se probaría la persistencia.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  countOutsourcedRates, deactivateParty, getParty, listParties, reactivateParty, saveParty,
} from '../partiesDataSource';
import { listSimulatedCarriers } from '../localRulesDataSource';
import { loadDatabase } from '../localData/store';
import type { SettlementPartyInput } from '../parties';

function nueva(overrides: Partial<SettlementPartyInput> = {}): SettlementPartyInput {
  return {
    country_id: 'CR',
    classification: 'OUTSOURCED',
    code: 'TR-CR-900',
    name: 'Transportes de Prueba',
    tax_id: '3-101-999999',
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

beforeEach(() => {
  localStorage.clear();
});

describe('listParties', () => {
  it('separa flota propia de terceros', async () => {
    const propias = await listParties({ classification: 'OWN' });
    const terceros = await listParties({ classification: 'OUTSOURCED' });

    expect(propias.length).toBeGreaterThan(0);
    expect(terceros.length).toBeGreaterThan(0);
    expect(propias.every((p) => p.classification === 'OWN')).toBe(true);
    expect(terceros.every((p) => p.classification === 'OUTSOURCED')).toBe(true);
  });

  it('filtra por país', async () => {
    const cr = await listParties({ countryId: 'CR' });
    expect(cr.length).toBeGreaterThan(0);
    expect(cr.every((p) => p.country_id === 'CR')).toBe(true);
  });

  it('oculta las desactivadas salvo que se pidan', async () => {
    await deactivateParty('CARRIER_CR_1');

    const activas = await listParties({ classification: 'OUTSOURCED' });
    const todas = await listParties({ classification: 'OUTSOURCED', includeInactive: true });

    expect(activas.find((p) => p.id === 'CARRIER_CR_1')).toBeUndefined();
    expect(todas.find((p) => p.id === 'CARRIER_CR_1')).toBeDefined();
  });
});

describe('saveParty', () => {
  it('crea y persiste', async () => {
    const result = await saveParty(nueva());
    expect(result.status).toBe('saved');

    if (result.status === 'saved') {
      const leida = await getParty(result.party.id);
      expect(leida?.name).toBe('Transportes de Prueba');
      expect(leida?.code).toBe('TR-CR-900');
    }
  });

  it('devuelve errores por campo sin guardar nada', async () => {
    const antes = await listParties({ includeInactive: true });
    const result = await saveParty(nueva({ name: '', tax_id: null }));

    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.fieldErrors.name).toBeDefined();
      expect(result.fieldErrors.tax_id).toBeDefined();
    }
    expect(await listParties({ includeInactive: true })).toHaveLength(antes.length);
  });

  it('rechaza un código ya usado en el mismo país', async () => {
    const result = await saveParty(nueva({ code: 'TR-CR-001' }));
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.fieldErrors.code).toBeDefined();
  });

  it('rechaza un país que no existe', async () => {
    const result = await saveParty(nueva({ country_id: 'PAIS_FANTASMA' }));
    expect(result.status).toBe('failed');
  });

  it('edita sin chocar con su propio código', async () => {
    const result = await saveParty(nueva({ name: 'Nombre nuevo' }), 'CARRIER_CR_1');
    expect(result.status).toBe('saved');
    if (result.status === 'saved') expect(result.party.id).toBe('CARRIER_CR_1');
  });
});

describe('baja lógica', () => {
  it('desactivar no borra la fila', async () => {
    await deactivateParty('CARRIER_CR_2');
    const party = await getParty('CARRIER_CR_2');
    expect(party).not.toBeNull();
    expect(party?.status).toBe('inactive');
  });

  it('reactivar la devuelve a los listados', async () => {
    await deactivateParty('CARRIER_CR_2');
    await reactivateParty('CARRIER_CR_2');
    const activas = await listParties({ classification: 'OUTSOURCED' });
    expect(activas.find((p) => p.id === 'CARRIER_CR_2')).toBeDefined();
  });

  it('informa cuántas tarifas de outsourcing dependen de la compañía', async () => {
    // La semilla trae una tarifa de outsourcing para CARRIER_CR_1.
    expect(await countOutsourcedRates('CARRIER_CR_1')).toBe(1);
    expect(await countOutsourcedRates('SP_CR_OWN')).toBe(0);
  });
});

describe('compatibilidad con lo que ya existía', () => {
  it('las tarifas de outsourcing de la semilla siguen apuntando a compañías reales', async () => {
    const db = loadDatabase();
    const ids = new Set(db.settlementParties.map((p) => p.id));
    for (const rate of db.outsourcedCostRates) {
      expect(ids.has(rate.carrier_id), `tarifa ${rate.id} apunta a ${rate.carrier_id}`).toBe(true);
    }
  });

  it('el selector de transportistas del Probador ahora lee las compañías terceras activas', async () => {
    const carriers = await listSimulatedCarriers('');
    expect(carriers.length).toBeGreaterThan(0);
    expect(carriers.every((c) => c.classification === 'OUTSOURCED' && c.status === 'active')).toBe(true);
    // Sigue teniendo `id` y `name`, que es lo único que el Probador consume.
    expect(carriers[0]).toHaveProperty('name');
  });
});

describe('migración desde el formato anterior', () => {
  it('convierte "transportistas simulados" en compañías conservando el id', () => {
    const legacy = {
      countries: [{ id: 'CR', iso2: 'CR', name: 'Costa Rica', local_currency: 'CRC', ref_currency: 'USD', rounding_decimals: 2, rounding_mode: 'DOWN', overnight_threshold_hours: 30 }],
      zoneGroups: [], zones: [],
      pricingRules: [{ id: 'REGLA_DEL_USUARIO', country_id: 'CR', code: 'MIA', name: 'Mi regla' }],
      pricingTemplates: [],
      testCarriers: [{ id: 'CARRIER_CR_1', name: 'Transportes Guanacaste (CR)' }],
      ownCostParams: [], outsourcedCostRates: [], marginPolicies: [],
      auditLog: [], settlementSnapshots: [],
    };
    localStorage.setItem('tarifas-liquidador:v1', JSON.stringify(legacy));

    const db = loadDatabase();

    // El id se conserva: si se regenerara, las tarifas de outsourcing quedarían huérfanas.
    const migrada = db.settlementParties.find((p) => p.id === 'CARRIER_CR_1');
    expect(migrada).toBeDefined();
    expect(migrada?.classification).toBe('OUTSOURCED');
    expect(migrada?.country_id).toBe('CR'); // inferido del id
    expect(migrada?.status).toBe('active');

    // Y lo que el usuario tenía configurado sigue ahí: la migración repara, no reinicia.
    expect(db.pricingRules.find((r) => r.id === 'REGLA_DEL_USUARIO')).toBeDefined();
  });

  it('una colección faltante se rellena desde la semilla sin borrar el resto', () => {
    const parcial = {
      countries: [], zoneGroups: [], zones: [],
      pricingRules: [{ id: 'REGLA_DEL_USUARIO', code: 'MIA' }],
      pricingTemplates: [], settlementParties: [], ownCostParams: [],
      outsourcedCostRates: [], marginPolicies: [], auditLog: [],
      // falta `settlements` (y el resto de las colecciones nuevas)
    };
    localStorage.setItem('tarifas-liquidador:v1', JSON.stringify(parcial));

    const db = loadDatabase();
    expect(Array.isArray(db.settlements)).toBe(true);
    expect(db.pricingRules.find((r) => r.id === 'REGLA_DEL_USUARIO')).toBeDefined();
  });
});
