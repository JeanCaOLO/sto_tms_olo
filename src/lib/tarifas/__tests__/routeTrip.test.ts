// De una ruta a un viaje.
//
// Es la pieza que convierte "elegí CAR-CCS" en las variables que el motor necesita. Hasta ahora
// esos siete números se tecleaban uno por uno en cada liquidación, y las dos zonas se elegían de
// sendos desplegables que casi nadie completaba: con la zona vacía, TODA regla por zona dejaba de
// aplicar sin ninguna señal.

import { describe, expect, it } from 'vitest';
import { camposAjustados, toTripContext } from '../routeTrip';
import { calculate } from '../index';
import { makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostParams, makeRule } from './fixtures';
import type { CalculateInput, RouteDef } from '../types';

const RUTA: RouteDef = {
  id: 'RT_1',
  countryId: 'VE',
  partyId: 'CARRIER_VE_1',
  code: 'CAR-CCS',
  name: 'Carabobo → Caracas',
  originZoneId: 'Z_CAR',
  destZoneId: 'Z_CCS',
  km: 180,
  stopCount: 40,
  packageCount: 120,
  weightKg: 1200,
  tollCount: 3,
  tollsAmount: '60',
  durationHours: 4,
  notes: null,
  active: true,
};

const EXTRAS = { quotedAt: '2026-09-01T10:00:00.000Z', partyId: 'CARRIER_VE_1' };

// ── Lo que la ruta aporta ─────────────────────────────────────────────────────────────────────

describe('toTripContext', () => {
  it('hereda los siete números que hoy se teclean a mano', () => {
    const trip = toTripContext(RUTA, EXTRAS, 'OUTSOURCED');

    expect(trip).toMatchObject({
      km: 180,
      clientCount: 40,
      packageCount: 120,
      weightKg: 1200,
      tollCount: 3,
      tollsAmount: '60',
      durationHours: 4,
    });
  });

  it('las zonas salen de la ruta, no de dos desplegables', () => {
    const trip = toTripContext(RUTA, EXTRAS, 'OUTSOURCED');
    expect(trip.originLocationId).toBe('Z_CAR');
    expect(trip.destLocationId).toBe('Z_CCS');
  });

  it('la flota se deriva de la compañía, no se recibe', () => {
    // Recibirla permitiría liquidar el viaje de un tercero con las reglas de flota propia.
    expect(toTripContext(RUTA, EXTRAS, 'OWN').fleetType).toBe('OWN');
    expect(toTripContext(RUTA, EXTRAS, 'OUTSOURCED').fleetType).toBe('OUTSOURCED');
  });

  it('el transportista del viaje es la compañía, y la flota propia no tiene', () => {
    expect(toTripContext(RUTA, EXTRAS, 'OUTSOURCED').carrierId).toBe('CARRIER_VE_1');
    expect(toTripContext(RUTA, EXTRAS, 'OWN').carrierId).toBeNull();
  });
});

// ── Lo que es del día, no de la lane ──────────────────────────────────────────────────────────

describe('datos del viaje concreto', () => {
  it('las recolectas son del día y arrancan en cero', () => {
    expect(toTripContext(RUTA, EXTRAS, 'OUTSOURCED').pickupCount).toBe(0);
    expect(toTripContext(RUTA, { ...EXTRAS, pickupCount: 2 }, 'OUTSOURCED').pickupCount).toBe(2);
  });

  it('lleva las variables personalizadas cargadas en el viaje', () => {
    // Es el agujero que cierra: hasta ahora nadie rellenaba `customVars` en toda la aplicación, así
    // que toda variable "por viaje" resolvía siempre a su valor por defecto.
    const trip = toTripContext(
      RUTA, { ...EXTRAS, customVars: { 'custom:horas_espera': 3 } }, 'OUTSOURCED',
    );
    expect(trip.customVars).toEqual({ 'custom:horas_espera': 3 });
  });

  it('sin variables personalizadas no agrega la clave', () => {
    expect(toTripContext(RUTA, EXTRAS, 'OUTSOURCED')).not.toHaveProperty('customVars');
  });

  it('la capacidad del camión llega ya resuelta desde el catálogo', () => {
    const trip = toTripContext(
      RUTA, { ...EXTRAS, truckTypeId: 'NPR', truckVolumeM3: 12, truckWeightTons: 3.5 }, 'OUTSOURCED',
    );
    expect(trip).toMatchObject({ truckTypeId: 'NPR', truckVolumeM3: 12, truckWeightTons: 3.5 });
  });
});

// ── Correcciones puntuales ────────────────────────────────────────────────────────────────────

describe('un viaje excepcional corrige la ruta sin cambiarla', () => {
  it('lo cargado a mano manda sobre lo que dice la ruta', () => {
    // Obligar a editar la ruta para corregir un viaje cambiaría el cálculo de todos los demás.
    const trip = toTripContext(RUTA, { ...EXTRAS, overrides: { km: 210 } }, 'OUTSOURCED');
    expect(trip.km).toBe(210);
    expect(trip.clientCount).toBe(40); // lo demás sigue viniendo de la ruta
  });

  it('un CERO explícito también manda', () => {
    // "Este viaje no tuvo peajes" es un dato. Si la ruta lo pisara, se cobrarían peajes que no hubo.
    const trip = toTripContext(RUTA, { ...EXTRAS, overrides: { tollCount: 0 } }, 'OUTSOURCED');
    expect(trip.tollCount).toBe(0);
  });
});

describe('camposAjustados', () => {
  it('sin correcciones no marca nada', () => {
    expect(camposAjustados(RUTA, toTripContext(RUTA, EXTRAS, 'OUTSOURCED'))).toEqual([]);
  });

  it('nombra exactamente lo que se corrigió, para poder mostrarlo', () => {
    const trip = toTripContext(RUTA, { ...EXTRAS, overrides: { km: 210, tollCount: 0 } }, 'OUTSOURCED');
    expect(camposAjustados(RUTA, trip).sort()).toEqual(['km', 'tollCount']);
  });
});

// ── De punta a punta ──────────────────────────────────────────────────────────────────────────

describe('una regla por zona aplica sin que nadie teclee la zona', () => {
  it('cobra la tarifa del tramo que declara la ruta', () => {
    // Éste es el punto de toda la fase: la regla condicionada por zona SÓLO aplicaba en el Probador,
    // porque en la liquidación real la zona quedaba vacía.
    const { zoneGroups, zones } = makeGeoVE();
    const rutaVE: RouteDef = { ...RUTA, originZoneId: 'Z_CCS', destZoneId: 'Z_CAR' };

    // Una ubicación POR ZONA: así el id de la zona sirve directamente como origen y destino del
    // viaje, que es lo que permite que la ruta aporte su geografía sin tabla puente. Es lo mismo
    // que arma el catálogo del motor.
    const locations = zones.map((z) => ({
      id: z.id, countryId: z.countryId, zoneId: z.id, code: z.code, name: z.name,
    }));

    const input: CalculateInput = {
      country: makeCountryVE(),
      trip: toTripContext(rutaVE, EXTRAS, 'OUTSOURCED'),
      rules: [makeRule({
        code: 'TRAMO_CCS_CAR',
        stage: 'BASE',
        conditions: {
          p: 'AND',
          args: [
            { p: 'EQ', left: 'originZone', right: 'CCS' },
            { p: 'EQ', left: 'destZone', right: 'CAR' },
          ],
        },
        expression: { op: 'FIXED', amount: '400.00' },
      })],
      zones,
      zoneGroups,
      locations,
      ownCostParams: makeOwnCostParams(),
      outsourcedCostRates: [{
        id: 'OSR', countryId: 'VE', carrierId: 'CARRIER_VE_1', truckTypeId: '', flatRate: '100',
      }],
      marginPolicy: makeMarginPolicy(),
    };

    expect(calculate(input).totalLiquidado).toBe('400.00');
  });
});
