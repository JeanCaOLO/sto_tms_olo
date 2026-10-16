// Detección de "viaje sin lógica de costos" y enlace a la pantalla de la compañía.

import { describe, expect, it } from 'vitest';
import type { TarifasCatalog } from '../catalogLoader';
import { detectMissingLogic, noLogicHref, noLogicMessage, noRuleApplied } from '../missingLogic';
import type { CostStructure, CostStructureRow, RateTable, Rule } from '../types';

const structure = { id: 'S', active: true } as CostStructure;
const row = { id: 'R', active: true } as CostStructureRow;
const rule = (over: Partial<Rule> = {}) => ({ id: 'RU', active: true, scope: 'COUNTRY', partyId: null, ...over }) as Rule;
const table = { id: 'T', active: true } as RateTable;

const catalog = (over: Partial<TarifasCatalog> = {}): TarifasCatalog => ({
  country: {} as TarifasCatalog['country'],
  rules: [], zones: [], zoneGroups: [], marginPolicy: {} as TarifasCatalog['marginPolicy'],
  partyVariables: [], costStructure: null, costStructureRows: [],
  defaultCostStructure: null, defaultCostStructureRows: [], rateTables: [], rateTableRows: [],
  ...over,
});

const own = { carrierId: 'C1', carrierName: 'OLO', isOwnFleet: true };
const third = { carrierId: 'C2', carrierName: 'Transmajori', isOwnFleet: false };

describe('detectMissingLogic', () => {
  it('flota propia sin estructura propia ni del país: falta costos', () => {
    expect(detectMissingLogic(catalog(), own, 'P1')?.missing).toEqual(['costos']);
  });

  it('flota propia con la estructura del país: tiene con qué calcular', () => {
    const c = catalog({ defaultCostStructure: structure, defaultCostStructureRows: [row] });
    expect(detectMissingLogic(c, own, 'P1')).toBeNull();
  });

  it('flota propia con estructura sin filas: falta costos', () => {
    expect(detectMissingLogic(catalog({ costStructure: structure }), own, 'P1')?.missing).toEqual(['costos']);
  });

  it('tercero sin reglas ni tarifario: falta reglas y tarifario', () => {
    expect(detectMissingLogic(catalog(), third, 'P2')?.missing).toEqual(['reglas', 'tarifario']);
  });

  it('tercero sin perfil de cálculo: además falta el perfil', () => {
    expect(detectMissingLogic(catalog(), third, null)?.missing).toEqual(['perfil', 'reglas', 'tarifario']);
  });

  it('tercero con una regla del país o con un tarifario activo: tiene con qué calcular', () => {
    expect(detectMissingLogic(catalog({ rules: [rule()] }), third, 'P2')).toBeNull();
    expect(detectMissingLogic(catalog({ rateTables: [table] }), third, 'P2')).toBeNull();
  });

  it('las reglas de OTRA compañía o inactivas no cuentan', () => {
    const c = catalog({ rules: [rule({ scope: 'PARTY', partyId: 'OTRA' }), rule({ active: false })] });
    expect(detectMissingLogic(c, third, 'P2')?.missing).toEqual(['reglas', 'tarifario']);
  });
});

describe('noRuleApplied', () => {
  it('tercero sin ninguna línea aplicada: sin lógica', () => {
    expect(noRuleApplied(third, 'P2', 0)?.missing).toEqual(['reglas', 'tarifario']);
  });
  it('tercero con líneas, o flota propia: no aplica', () => {
    expect(noRuleApplied(third, 'P2', 3)).toBeNull();
    expect(noRuleApplied(own, 'P1', 0)).toBeNull();
  });
});

describe('enlace y mensaje', () => {
  it('propia lleva a Flota Propia con el panel de costos; tercero a Transportistas con tarifarios', () => {
    const a = detectMissingLogic(catalog(), own, 'P1')!;
    expect(noLogicHref(a)).toBe('/tarifas/flota-propia?carrier=C1&open=costs');
    const b = detectMissingLogic(catalog(), third, 'P2')!;
    expect(noLogicHref(b)).toBe('/tarifas/transportistas?carrier=C2&open=rates');
  });
  it('sin transportista asignado no hay enlace', () => {
    expect(noLogicHref({ fleet: 'OUTSOURCED', carrierId: null, carrierName: null, missing: ['reglas'] })).toBeNull();
  });
  it('el mensaje dice qué falta', () => {
    expect(noLogicMessage(detectMissingLogic(catalog(), own, 'P1')!)).toContain('estructura de costos');
  });
});
