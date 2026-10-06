// Estructura de costos de la flota propia de Costa Rica contra las cifras de la planilla de costeo:
// costo fijo diario 57,525.69 y costo variable 48.8118 por km (camión de 3 a 4.5 t, con ayudante).
// Si el motor no devuelve estas cifras, cargar la planilla de Costa Rica no sirve.

import { describe, expect, it } from 'vitest';
import { componentCostPerKm, computeCost } from '../cost';
import { deriveContext } from '../resolver';
import { COMPONENTES_CR, FIJOS_CR, PARAMETROS_CR, type TipoCamion } from './fixtures/costaRicaFleet';
import { makeCountryVE, makeGeoVE, makeTrip } from './fixtures';
import type { CostStructure, CostStructureRow, VarBag } from '../types';

const PARAMS = {
  kmPerYear: PARAMETROS_CR.kmAnual,
  fuelPrice: null,
  fuelEfficiency: {},
} as const;

let seq = 0;
const base = (over: Partial<CostStructureRow>): CostStructureRow => {
  seq += 1;
  return {
    id: `r${seq}`, structureId: 'CR', code: `C${seq}`, label: `Concepto ${seq}`, driver: 'FIXED', amount: '0',
    sign: 'ADD', appliesWhen: null, unit: null, order: seq, active: true, group: null, frequency: null,
    frequencyQty: null, unitQty: null, costPerKm: null, truckType: null, ...over,
  };
};

function estructuraCR(): { structure: CostStructure; rows: CostStructureRow[] } {
  const rows: CostStructureRow[] = [
    base({ code: 'CONDUCTOR', label: 'Conductor', driver: 'PER_MONTH_PRORATED', amount: String(FIJOS_CR.conductor), group: 'conductor' }),
    base({
      code: 'AYUDANTE', label: 'Ayudante', driver: 'PER_MONTH_PRORATED', amount: String(FIJOS_CR.ayudante), group: 'ayudante',
      appliesWhen: { p: 'GT', left: 'custom:con_ayudante', right: 0 },
    }),
  ];
  for (const tipo of ['T1', 'T3', 'T5'] as TipoCamion[]) {
    rows.push(base({
      code: `DEPRECIACION_${tipo}`, label: `Depreciación ${tipo}`, driver: 'PER_MONTH_PRORATED',
      amount: String(FIJOS_CR.depreciacion[tipo]), group: 'depreciacion', truckType: tipo,
    }));
    for (const [nombre, frecuencia, unidades, porTipo] of COMPONENTES_CR) {
      const [cada, costo] = porTipo[tipo];
      rows.push(base({
        code: `${nombre}_${tipo}`, label: nombre, driver: 'PER_KM', amount: String(costo), group: 'mantenimiento',
        frequency: frecuencia, frequencyQty: cada, unit: unidades, truckType: tipo,
      }));
    }
  }
  const structure: CostStructure = {
    id: 'CR', partyId: null, countryId: 'VE', name: 'Flota propia CR', operatingDaysPerMonth: PARAMETROS_CR.diasOperativos,
    params: { ...PARAMS, fuelEfficiency: {} }, effectiveFrom: null, active: true, notes: null,
  };
  return { structure, rows };
}

function costoDe(tipo: TipoCamion, km: number, conAyudante = false, nights = 0) {
  const { structure, rows } = estructuraCR();
  const country = makeCountryVE();
  const { zoneGroups, zones, locations } = makeGeoVE();
  const trip = makeTrip({ km, truckTypeId: tipo, fleetType: 'OWN' });
  const { vars, overnightNights } = deriveContext({ trip, country, zones, zoneGroups, locations });
  return computeCost(
    { country, trip, costStructure: null, costStructureRows: [], defaultCostStructure: structure, defaultCostStructureRows: rows },
    nights || overnightNights,
    // La variable por viaje la declara el perfil de la compañía; acá se simula ya resuelta.
    { ...vars, 'custom:con_ayudante': conAyudante ? 1 : 0 } as VarBag,
  );
}

describe('costo por km de un componente', () => {
  it.each([
    ['Filtro de Agua (km)', { amount: '11300', frequency: 'km' as const, frequencyQty: 15000 }, 0.7533],
    ['Batería (años)', { amount: '90400', frequency: 'year' as const, frequencyQty: 2 }, 1.2556],
    ['MO General (mensual)', { amount: '11300', frequency: 'month' as const, frequencyQty: 1 }, 3.7667],
    ['Juego de llantas (km)', { amount: '406800', frequency: 'km' as const, frequencyQty: 50000 }, 8.136],
  ])('%s', (_n, row, esperado) => {
    expect(Number(componentCostPerKm(row, 36000))).toBeCloseTo(esperado, 4);
  });

  it('sin frecuencia válida o sin km por año no hay costo', () => {
    expect(componentCostPerKm({ amount: '100', frequency: 'km', frequencyQty: 0 }, 36000)).toBeNull();
    expect(componentCostPerKm({ amount: '100', frequency: 'year', frequencyQty: 2 }, null)).toBeNull();
    expect(componentCostPerKm({ amount: '100', frequency: null, frequencyQty: null }, 36000)).toBeNull();
  });
});

describe('estructura de Costa Rica contra la planilla', () => {
  it('el mantenimiento del camión de 3 a 4.5 t suma 48.8118 por km', () => {
    // 1 km, sin fijos prorrateables que molesten: se compara contra el costo de 100 km menos el fijo.
    const km100 = Number(costoDe('T3', 100).total);
    const km0 = Number(costoDe('T3', 0).total);
    expect((km100 - km0) / 100).toBeCloseTo(48.8118, 2);
  });

  it('el costo fijo diario con ayudante es 57,525.69', () => {
    const fijoDiario = Number(costoDe('T3', 0, true).total);
    expect(fijoDiario).toBeCloseTo(57525.69, 2);
  });

  it('sin ayudante el fijo diario baja en el costo diario del ayudante', () => {
    const con = Number(costoDe('T3', 0, true).total);
    const sin = Number(costoDe('T3', 0, false).total);
    expect(con - sin).toBeCloseTo(FIJOS_CR.ayudante / 30, 2);
  });

  it('un viaje de 100 km de un día cuesta fijo diario + 100 × costo por km', () => {
    const total = Number(costoDe('T3', 100, true).total);
    expect(total).toBeCloseTo(57525.69 + 100 * 48.8118, 1);
  });

  it('cada tipo de camión usa SUS componentes y SU depreciación', () => {
    const t1 = Number(costoDe('T1', 100).total);
    const t3 = Number(costoDe('T3', 100).total);
    const t5 = Number(costoDe('T5', 100).total);
    expect(t1).toBeLessThan(t3);
    expect(t3).toBeLessThan(t5);
  });
});

describe('combustible y drivers personalizados', () => {
  const country = makeCountryVE();
  const { zoneGroups, zones, locations } = makeGeoVE();

  const costo = (structure: CostStructure, rows: CostStructureRow[], extraVars: Record<string, number> = {}, truck = 'T3', warn?: (m: string) => void) => {
    const trip = makeTrip({ km: 100, truckTypeId: truck, fleetType: 'OWN' });
    const { vars } = deriveContext({ trip, country, zones, zoneGroups, locations });
    return computeCost(
      { country, trip, costStructure: structure, costStructureRows: rows },
      0, { ...vars, ...extraVars } as VarBag, warn,
    );
  };
  const estructura = (params: Partial<CostStructure['params']> = {}): CostStructure => ({
    ...estructuraCR().structure, params: { kmPerYear: 36000, fuelPrice: null, fuelEfficiency: {}, ...params },
  });

  it('el combustible es precio del litro ÷ rendimiento × km, en una línea propia', () => {
    const r = costo(estructura({ fuelPrice: '635', fuelEfficiency: { T3: '6' } }), [base({ code: 'CERO' })]);
    expect(Number(r.total)).toBeCloseTo(100 * 635 / 6, 2);
    expect(r.breakdown.map((l) => l.ruleCode)).toContain('COMBUSTIBLE');
  });

  it('sin rendimiento para ese camión no calcula combustible y avisa', () => {
    const avisos: string[] = [];
    const r = costo(estructura({ fuelPrice: '635', fuelEfficiency: { T1: '8.5' } }), [base({ code: 'CERO' })], {}, 'T3', (m) => avisos.push(m));
    expect(Number(r.total)).toBe(0);
    expect(avisos.join(' ')).toMatch(/rendimiento/i);
  });

  it('una variable personalizada numérica puede ser el driver de una fila', () => {
    const fila = base({ code: 'PEAJES', driver: 'custom:peajes', amount: '15' });
    expect(Number(costo(estructura(), [fila], { 'custom:peajes': 3 }).total)).toBe(45);
  });

  it('un driver personalizado sin valor en el viaje vale 0 y avisa', () => {
    const avisos: string[] = [];
    const fila = base({ code: 'PEAJES', driver: 'custom:peajes', amount: '15' });
    expect(Number(costo(estructura(), [fila], {}, 'T3', (m) => avisos.push(m)).total)).toBe(0);
    expect(avisos.join(' ')).toMatch(/custom:peajes/);
  });
});
