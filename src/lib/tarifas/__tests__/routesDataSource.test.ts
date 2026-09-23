// @vitest-environment jsdom
//
// Rutas comerciales del tarifador.
//
// Lo que resuelven: hasta ahora cada liquidación tecleaba a mano kilómetros, paradas, bultos, peso,
// peajes y duración —seis números, uno por uno— y elegía las dos zonas de sendos desplegables que
// casi nadie completaba. Con la zona vacía, TODA regla por zona dejaba de aplicar sin ninguna señal.
//
// Lo que se cuida acá es que una ruta mal cargada se rechace al GUARDARLA, no que produzca un
// cálculo silenciosamente equivocado más tarde.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteRoute, getRoute, listRoutes, listRoutesByCountry, routesUsingZone, saveRoute,
  setRouteActive, validateRoute, type RouteInput, type ZoneRef,
} from '../routesDataSource';
import { db } from '../data';

const ZONAS: ZoneRef[] = [
  { id: 'Z_VE_CCS', countryId: 'VE', code: 'CCS' },
  { id: 'Z_VE_CAR', countryId: 'VE', code: 'CAR' },
  { id: 'Z_CR_SJO', countryId: 'CR', code: 'SJO' },
];

// La semilla ya trae rutas para CARRIER_VE_1 (ver `seed.json`): estos tests usan una compañía y
// un código propios para no chocar con ellas ni depender de cuántas haya.
const nueva = (overrides: Partial<RouteInput> = {}): RouteInput => ({
  countryId: 'VE',
  partyId: 'SP_VE_OWN',
  code: 'TEST-A',
  name: 'Carabobo → Caracas',
  originZoneId: 'Z_VE_CAR',
  destZoneId: 'Z_VE_CCS',
  km: '180',
  stopCount: '40',
  packageCount: '120',
  weightKg: '1200',
  tollCount: '3',
  tollsAmount: '60',
  durationHours: '4',
  notes: null,
  active: true,
  ...overrides,
});

// La semilla real trae liquidaciones de demo que referencian rutas reales (RT_VE_A1, RT_VE_B1,
// RT_CO_A1) por FK — sin limpiarlas, un test que borra esas rutas para dejar una zona borrable
// choca con la restricción real, que es exactamente la que protege a una liquidación emitida.
beforeEach(async () => {
  localStorage.clear();
  for (const row of await db().find('settlement')) await db().delete('settlement', row.id);
});

// ── Validación ────────────────────────────────────────────────────────────────────────────────

describe('validateRoute', () => {
  it('exige código y nombre', () => {
    const errors = validateRoute(nueva({ code: '', name: '' }), [], ZONAS);
    expect(errors.code).toBeDefined();
    expect(errors.name).toBeDefined();
  });

  it('rechaza un código con espacios o acentos', () => {
    // Es el texto que el liquidador lee en la guía física y busca acá: un carácter invisible
    // convierte "no la encuentro" en un misterio.
    expect(validateRoute(nueva({ code: 'TEST A' }), [], ZONAS).code).toBeDefined();
    expect(validateRoute(nueva({ code: 'CAR-CÉS' }), [], ZONAS).code).toBeDefined();
    expect(validateRoute(nueva({ code: 'TEST-A_2' }), [], ZONAS).code).toBeUndefined();
  });

  it('rechaza el código repetido dentro de la misma compañía', () => {
    const existentes = [{ id: 'R1', code: 'TEST-A', partyId: 'SP_VE_OWN' }];
    expect(validateRoute(nueva(), existentes, ZONAS).code).toBeDefined();
  });

  it('el mismo código en otra compañía es válido', () => {
    // Dos transportistas pueden cubrir la misma lane a precios distintos: es el caso normal.
    const existentes = [{ id: 'R1', code: 'CAR-CCS', partyId: 'OTRA' }];
    expect(validateRoute(nueva(), existentes, ZONAS).code).toBeUndefined();
  });

  it('no se choca consigo misma al editar', () => {
    const existentes = [{ id: 'R1', code: 'TEST-A', partyId: 'SP_VE_OWN' }];
    expect(validateRoute(nueva(), existentes, ZONAS, 'R1').code).toBeUndefined();
  });

  it('exige las dos zonas', () => {
    const errors = validateRoute(nueva({ originZoneId: '', destZoneId: '' }), [], ZONAS);
    expect(errors.originZoneId).toBeDefined();
    expect(errors.destZoneId).toBeDefined();
  });

  it('rechaza una zona de otro país', () => {
    // Una ruta venezolana que termina en San José no casa ninguna fila del tarifario del país.
    expect(validateRoute(nueva({ destZoneId: 'Z_CR_SJO' }), [], ZONAS).destZoneId).toBeDefined();
  });

  it('rechaza una zona que ya no existe', () => {
    expect(validateRoute(nueva({ originZoneId: 'Z_BORRADA' }), [], ZONAS).originZoneId).toBeDefined();
  });

  it('rechaza origen y destino iguales', () => {
    // No tendría fila en el tarifario zona→zona: cobraría siempre el respaldo y nadie entendería
    // por qué.
    const errors = validateRoute(nueva({ destZoneId: 'Z_VE_CAR' }), [], ZONAS);
    expect(errors.destZoneId).toBeDefined();
  });

  it('exige que los siete números vayan sin signo', () => {
    const errors = validateRoute(
      nueva({ km: '-1', stopCount: 'x', packageCount: '', weightKg: '-0.5', tollCount: 'dos', tollsAmount: '$60', durationHours: '-4' }),
      [], ZONAS,
    );
    expect(Object.keys(errors).sort()).toEqual(
      ['durationHours', 'km', 'packageCount', 'stopCount', 'tollCount', 'tollsAmount', 'weightKg'],
    );
  });

  it('cero es un valor legítimo', () => {
    // Una lane sin peajes existe, y rechazarla obligaría a inventar un número.
    const errors = validateRoute(nueva({ tollCount: '0', tollsAmount: '0' }), [], ZONAS);
    expect(errors.tollCount).toBeUndefined();
    expect(errors.tollsAmount).toBeUndefined();
  });
});

// ── Persistencia ──────────────────────────────────────────────────────────────────────────────

// Z_VE_CAR, Z_VE_CCS y Z_CR_SJO ya vienen en la semilla del módulo: se usan tal cual, no se
// insertan (hacerlo colisionaría por id repetido).
describe('alta y baja', () => {
  it('guarda, normaliza el código y persiste los números', async () => {
    const result = await saveRoute(nueva({ code: 'test-a' }));
    expect(result.status).toBe('saved');
    if (result.status !== 'saved') return;

    expect(result.route).toMatchObject({
      code: 'TEST-A',
      originZoneId: 'Z_VE_CAR',
      destZoneId: 'Z_VE_CCS',
      km: 180,
      stopCount: 40,
      tollCount: 3,
      tollsAmount: '60',
    });

    expect(await getRoute(result.route.id)).toMatchObject({ code: 'TEST-A' });
  });

  it('lista sólo las de la compañía', async () => {
    await saveRoute(nueva());
    await saveRoute(nueva({ partyId: 'CARRIER_VE_2', code: 'OTRA' }));

    expect((await listRoutes('SP_VE_OWN')).map((r) => r.code)).toEqual(['TEST-A']);
  });

  it('lista por país sin importar la compañía', async () => {
    await saveRoute(nueva());
    await saveRoute(nueva({ partyId: 'CARRIER_VE_2', code: 'OTRA' }));

    // La semilla ya trae rutas de VE: se comprueba que estén las dos nuevas, no cuántas hay.
    const codigos = (await listRoutesByCountry('VE')).map((r) => r.code);
    expect(codigos).toContain('TEST-A');
    expect(codigos).toContain('OTRA');
  });

  it('la baja es lógica: la saca de la lista sin borrarla', async () => {
    const result = await saveRoute(nueva());
    if (result.status !== 'saved') throw new Error('no se guardó');

    await setRouteActive(result.route.id, false);

    expect((await listRoutes('SP_VE_OWN')).map((r) => r.id)).not.toContain(result.route.id);
    expect((await listRoutes('SP_VE_OWN', { includeInactive: true })).map((r) => r.id)).toContain(result.route.id);
  });

  it('una ruta con zona inexistente no se guarda', async () => {
    const result = await saveRoute(nueva({ originZoneId: 'Z_FANTASMA' }));
    expect(result.status).toBe('invalid');
  });
});

// ── Integridad con las zonas ──────────────────────────────────────────────────────────────────

describe('zonas en uso', () => {
  it('dice qué rutas usan una zona, para poder nombrarlas antes de borrarla', async () => {
    await saveRoute(nueva());

    // La encuentra tanto como origen…
    expect((await routesUsingZone('Z_VE_CAR')).map((r) => r.code)).toContain('TEST-A');
    // …como destino.
    expect((await routesUsingZone('Z_VE_CCS')).map((r) => r.code)).toContain('TEST-A');
    // Una zona que ninguna ruta nombra no la usa nadie.
    expect(await routesUsingZone('Z_CO_BAQ')).toEqual([]);
  });

  it('la capa de datos impide borrar una zona con rutas', async () => {
    await saveRoute(nueva());

    // Es la protección que el tarifario perdió al guardar códigos en vez de ids, recuperada acá
    // por la clave foránea declarada en el esquema.
    await expect(db().delete('zone', 'Z_VE_CAR')).rejects.toMatchObject({ code: '23503' });
  });

  it('una vez borradas las rutas, la zona se puede borrar', async () => {
    await saveRoute(nueva());

    // Se borran TODAS las que la usan, incluidas las que trae la semilla.
    for (const r of await routesUsingZone('Z_VE_CAR')) await deleteRoute(r.id);

    await expect(db().delete('zone', 'Z_VE_CAR')).resolves.toBeUndefined();
  });
});
