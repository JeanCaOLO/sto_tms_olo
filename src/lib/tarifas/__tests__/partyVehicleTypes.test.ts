// @vitest-environment jsdom
//
// Catálogo de vehículos por compañía.
//
// Lo que se prueba acá es el motivo de que exista: que las variables `truckVolumeM3` y
// `truckWeightTons` —que el motor tiene desde hace varios pasos— dejen de teclearse viaje por viaje.
// Sin el catálogo valían 0 y toda regla condicionada por capacidad quedaba muerta.

import { beforeEach, describe, expect, it } from 'vitest';
import { calculate } from '../index';
import { resolveTruckCapacity } from '../resolver';
import {
  faltantesDeCatalogo, listVehicleTypes, saveVehicleType, setVehicleTypeActive,
  validateVehicleType, type VehicleTypeInput,
} from '../partyVehicleTypesDataSource';
import { db } from '../data';
import { makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostParams, makeRule, makeTrip } from './fixtures';
import type { CalculateInput, PartyVehicleType, TripContext } from '../types';

const nuevo = (overrides: Partial<VehicleTypeInput> = {}): VehicleTypeInput => ({
  partyId: 'CARRIER_CR_1',
  code: 'NPR',
  name: 'Isuzu NPR',
  volumeM3: '12',
  weightTons: '3.5',
  notes: null,
  active: true,
  ...overrides,
});

beforeEach(() => { localStorage.clear(); });

// ── Derivación de la capacidad ────────────────────────────────────────────────────────────────

describe('resolveTruckCapacity', () => {
  const catalogo: PartyVehicleType[] = [
    { id: 'V1', partyId: 'P1', code: 'NPR', name: 'Isuzu NPR', volumeM3: 12, weightTons: 3.5, notes: null, active: true },
    { id: 'V2', partyId: 'P1', code: 'CABEZAL', name: 'Cabezal', volumeM3: 60, weightTons: 30, notes: null, active: false },
  ];

  it('toma la capacidad del catálogo por el código del camión', () => {
    expect(resolveTruckCapacity('NPR', 0, 0, catalogo)).toEqual({ volumeM3: 12, weightTons: 3.5 });
  });

  it('lo cargado en el viaje manda sobre el catálogo', () => {
    // Un viaje excepcional puede corregir la capacidad sin tocar el catálogo de la compañía.
    expect(resolveTruckCapacity('NPR', 20, 5, catalogo)).toEqual({ volumeM3: 20, weightTons: 5 });
  });

  it('cero cuenta como "no informado", que es como llegan los viajes reales', () => {
    expect(resolveTruckCapacity('NPR', 0, undefined, catalogo).volumeM3).toBe(12);
  });

  it('un tipo dado de baja no aporta capacidad', () => {
    expect(resolveTruckCapacity('CABEZAL', 0, 0, catalogo)).toEqual({ volumeM3: 0, weightTons: 0 });
  });

  it('un código que no está en el catálogo da cero, sin romper', () => {
    expect(resolveTruckCapacity('DESCONOCIDO', 0, 0, catalogo)).toEqual({ volumeM3: 0, weightTons: 0 });
  });

  it('sin catálogo se comporta como antes', () => {
    expect(resolveTruckCapacity('NPR', 0, 0, [])).toEqual({ volumeM3: 0, weightTons: 0 });
  });
});

// ── De punta a punta: la regla del requerimiento ──────────────────────────────────────────────

function totalDe(trip: Partial<TripContext>, catalogo: PartyVehicleType[]): string {
  const country = makeCountryVE();
  const { zoneGroups, zones, locations } = makeGeoVE();
  const input: CalculateInput = {
    country,
    trip: makeTrip(trip),
    // "Metros cúbicos del camión × 10", una de las reglas de ejemplo del requerimiento.
    rules: [makeRule({
      code: 'POR_VOLUMEN',
      stage: 'VARIABLE',
      expression: { op: 'PER_UNIT', unit: 'truckVolumeM3', rate: '10.00' },
    })],
    zones,
    zoneGroups,
    locations,
    ownCostParams: makeOwnCostParams(),
    outsourcedCostRates: [],
    marginPolicy: makeMarginPolicy(),
    partyVehicleTypes: catalogo,
  };
  return calculate(input).totalLiquidado;
}

describe('"metros cúbicos del camión × 10", sin teclear los metros cúbicos', () => {
  const catalogo: PartyVehicleType[] = [
    { id: 'V1', partyId: 'P1', code: 'NPR', name: 'Isuzu NPR', volumeM3: 12, weightTons: 3.5, notes: null, active: true },
  ];

  it('con catálogo, la regla cobra sola', () => {
    expect(totalDe({ truckTypeId: 'NPR' }, catalogo)).toBe('120.00');
  });

  it('sin catálogo, la misma regla vale cero — el estado anterior', () => {
    expect(totalDe({ truckTypeId: 'NPR' }, [])).toBe('0.00');
  });

  it('una condición por toneladas también resuelve desde el catálogo', () => {
    const country = makeCountryVE();
    const { zoneGroups, zones, locations } = makeGeoVE();
    const result = calculate({
      country,
      trip: makeTrip({ truckTypeId: 'NPR' }),
      rules: [makeRule({
        code: 'RECARGO_GRANDE',
        stage: 'MODIFIER',
        conditions: { p: 'GTE', left: 'truckWeightTons', right: 3 },
        expression: { op: 'FIXED', amount: '50.00' },
      })],
      zones, zoneGroups, locations,
      ownCostParams: makeOwnCostParams(), outsourcedCostRates: [], marginPolicy: makeMarginPolicy(),
      partyVehicleTypes: catalogo,
    });

    expect(result.totalLiquidado).toBe('50.00');
  });
});

// ── Alta y validación ─────────────────────────────────────────────────────────────────────────

describe('validateVehicleType', () => {
  it('exige código, nombre y números sin signo', () => {
    const errors = validateVehicleType(
      nuevo({ code: '', name: '', volumeM3: '-1', weightTons: 'x' }), [],
    );
    expect(Object.keys(errors).sort()).toEqual(['code', 'name', 'volumeM3', 'weightTons']);
  });

  it('rechaza un código repetido en la misma compañía, sin distinguir mayúsculas', () => {
    const existentes = [{ id: 'V1', code: 'NPR', partyId: 'CARRIER_CR_1' }];
    expect(validateVehicleType(nuevo({ code: 'npr' }), existentes).code).toBeDefined();
  });

  it('el mismo código en otra compañía es válido', () => {
    const existentes = [{ id: 'V1', code: 'NPR', partyId: 'OTRA' }];
    expect(validateVehicleType(nuevo(), existentes).code).toBeUndefined();
  });

  it('no se choca consigo mismo al editar', () => {
    const existentes = [{ id: 'V1', code: 'NPR', partyId: 'CARRIER_CR_1' }];
    expect(validateVehicleType(nuevo(), existentes, 'V1').code).toBeUndefined();
  });
});

describe('alta y baja', () => {
  it('guarda y persiste', async () => {
    const result = await saveVehicleType(nuevo());
    expect(result.status).toBe('saved');

    const lista = await listVehicleTypes('CARRIER_CR_1');
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ code: 'NPR', volumeM3: 12, weightTons: 3.5 });
  });

  it('la baja lógica lo saca de la lista sin borrarlo', async () => {
    const result = await saveVehicleType(nuevo());
    if (result.status !== 'saved') throw new Error('no se guardó');

    await setVehicleTypeActive(result.vehicleType.id, false);

    expect(await listVehicleTypes('CARRIER_CR_1')).toHaveLength(0);
    expect(await listVehicleTypes('CARRIER_CR_1', { includeInactive: true })).toHaveLength(1);
  });
});

// ── El atajo tras importar un tarifario ───────────────────────────────────────────────────────

describe('faltantesDeCatalogo', () => {
  it('lista los códigos que ya tienen tarifa pero todavía no tienen capacidad', async () => {
    // Es el caso después de importar un Excel de tarifas: los códigos ya existen.
    await db().insert('outsourcedCostRate', {
      country_id: 'CR', carrier_id: 'CARRIER_CR_1', truck_type_id: 'FRR',
      flat_rate: '520', currency_mode: 'LOCAL',
    });

    expect(await faltantesDeCatalogo('CARRIER_CR_1')).toContain('FRR');
  });

  it('deja de listarlo una vez declarado', async () => {
    await db().insert('outsourcedCostRate', {
      country_id: 'CR', carrier_id: 'CARRIER_CR_1', truck_type_id: 'FRR',
      flat_rate: '520', currency_mode: 'LOCAL',
    });
    await saveVehicleType(nuevo({ code: 'FRR', name: 'Isuzu FRR' }));

    expect(await faltantesDeCatalogo('CARRIER_CR_1')).not.toContain('FRR');
  });

  it('no repite un código que aparece en varias tarifas', async () => {
    for (const truck of ['FRR', 'FRR']) {
      await db().insert('outsourcedCostRate', {
        country_id: 'CR', carrier_id: 'CARRIER_CR_1', truck_type_id: truck,
        flat_rate: '520', currency_mode: 'LOCAL',
      });
    }
    const faltantes = await faltantesDeCatalogo('CARRIER_CR_1');
    // Aparece una sola vez, aunque tenga dos tarifas. (La semilla ya trae otro código para esta
    // compañía, así que la lista no es solo FRR.)
    expect(faltantes.filter((c) => c === 'FRR')).toHaveLength(1);
  });
});
