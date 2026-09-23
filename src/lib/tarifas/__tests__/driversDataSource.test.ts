// @vitest-environment jsdom
//
// Conductores del tarifador.
//
// Existen porque la guía física trae NOMBRE y CÉDULA y casi nunca la compañía. El buscador que
// resuelve eso (`driverSearch.ts`) está escrito y probado desde hace tiempo, pero la lista se leía
// del TMS: sin conductores cargados allá, no había nada que buscar acá.
//
// Lo que más importa de este archivo: que `toDriverOptions` entregue EXACTAMENTE la forma que el
// buscador ya consume, para que ese módulo puro no se toque ni se vuelva a probar.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  getDriver, listDrivers, listDriversByCountry, saveDriver, setDriverActive, toDriverOptions,
  validateDriver, type DriverInput,
} from '../driversDataSource';
import { searchDrivers } from '../driverSearch';
import type { DriverDef } from '../types';

// La semilla ya trae conductores para CARRIER_VE_1: estos tests usan una compania propia para
// no chocar con sus cedulas ni depender de cuantos haya.
const nuevo = (overrides: Partial<DriverInput> = {}): DriverInput => ({
  countryId: 'VE',
  partyId: 'SP_VE_OWN',
  fullName: 'José Ramírez',
  document: 'V-12.345.678',
  phone: null,
  license: null,
  licenseExpiresAt: null,
  notes: null,
  active: true,
  ...overrides,
});

beforeEach(() => { localStorage.clear(); });

// ── Validación ────────────────────────────────────────────────────────────────────────────────

describe('validateDriver', () => {
  it('exige el nombre', () => {
    expect(validateDriver(nuevo({ fullName: '  ' }), []).fullName).toBeDefined();
  });

  it('rechaza una cédula repetida en la misma compañía, sin importar cómo se escriba', () => {
    // "V-12.345.678" y "V12345678" son la misma persona. Permitir las dos formas crearía dos
    // conductores que el buscador muestra como duplicados idénticos.
    const existentes: Pick<DriverDef, 'id' | 'document' | 'partyId'>[] = [
      { id: 'D1', document: 'V12345678', partyId: 'SP_VE_OWN' },
    ];
    expect(validateDriver(nuevo(), existentes).document).toBeDefined();
  });

  it('la misma cédula en otra compañía es válida', () => {
    // Un conductor puede haber pasado de un transportista a otro; que ambos lo tengan cargado no
    // es un error de datos.
    const existentes = [{ id: 'D1', document: 'V-12.345.678', partyId: 'OTRA' }];
    expect(validateDriver(nuevo(), existentes).document).toBeUndefined();
  });

  it('no se choca consigo mismo al editar', () => {
    const existentes = [{ id: 'D1', document: 'V12345678', partyId: 'SP_VE_OWN' }];
    expect(validateDriver(nuevo(), existentes, 'D1').document).toBeUndefined();
  });

  it('un conductor sin cédula no choca con otro sin cédula', () => {
    // La guía a veces no la trae; dos vacíos no son la misma persona.
    const existentes = [{ id: 'D1', document: null, partyId: 'SP_VE_OWN' }];
    expect(validateDriver(nuevo({ document: null }), existentes).document).toBeUndefined();
  });

  it('valida el formato del vencimiento de la licencia', () => {
    expect(validateDriver(nuevo({ licenseExpiresAt: '31/12/2027' }), []).licenseExpiresAt).toBeDefined();
    expect(validateDriver(nuevo({ licenseExpiresAt: '2027-12-31' }), []).licenseExpiresAt).toBeUndefined();
    expect(validateDriver(nuevo({ licenseExpiresAt: '' }), []).licenseExpiresAt).toBeUndefined();
  });
});

// ── Persistencia ──────────────────────────────────────────────────────────────────────────────

describe('alta y baja', () => {
  it('guarda y persiste', async () => {
    const result = await saveDriver(nuevo());
    expect(result.status).toBe('saved');
    if (result.status !== 'saved') return;

    expect(await getDriver(result.driver.id)).toMatchObject({
      fullName: 'José Ramírez',
      document: 'V-12.345.678',
      partyId: 'SP_VE_OWN',
    });
  });

  it('conserva la cédula tal como la tipearon', async () => {
    // Normalizar al guardar perdería el formato que la gente reconoce en la guía. La comparación
    // normaliza; el dato no.
    const result = await saveDriver(nuevo());
    if (result.status !== 'saved') throw new Error('no se guardó');
    expect(result.driver.document).toBe('V-12.345.678');
  });

  it('lista por compañía y por país', async () => {
    await saveDriver(nuevo());
    await saveDriver(nuevo({ partyId: 'CARRIER_VE_2', fullName: 'María Pérez', document: 'V-9.999.999' }));

    expect((await listDrivers('SP_VE_OWN')).map((d) => d.fullName)).toEqual(['José Ramírez']);
    // La semilla ya trae conductores de VE: se comprueba que estén los nuevos, no cuántos hay.
    const nombres = (await listDriversByCountry('VE')).map((d) => d.fullName);
    expect(nombres).toContain('José Ramírez');
    expect(nombres).toContain('María Pérez');
  });

  it('la baja es lógica', async () => {
    const result = await saveDriver(nuevo());
    if (result.status !== 'saved') throw new Error('no se guardó');

    await setDriverActive(result.driver.id, false);

    expect((await listDrivers('SP_VE_OWN')).map((d) => d.id)).not.toContain(result.driver.id);
    expect((await listDrivers('SP_VE_OWN', { includeInactive: true })).map((d) => d.id))
      .toContain(result.driver.id);
  });
});

// ── El puente con el buscador ─────────────────────────────────────────────────────────────────

describe('toDriverOptions', () => {
  const conductores: DriverDef[] = [
    { id: 'D1', countryId: 'VE', partyId: 'P1', fullName: 'José Ramírez', document: 'V-12.345.678', phone: null, license: null, licenseExpiresAt: null, notes: null, active: true },
    { id: 'D2', countryId: 'VE', partyId: 'P2', fullName: 'María Pérez', document: 'V-9.999.999', phone: null, license: null, licenseExpiresAt: null, notes: null, active: true },
  ];
  const companias = [{ id: 'P1', name: 'Transporte Andino' }, { id: 'P2', name: 'Logística del Centro' }];

  it('entrega la forma exacta que el buscador consume', () => {
    expect(toDriverOptions(conductores, companias)[0]).toEqual({
      id: 'D1',
      fullName: 'José Ramírez',
      document: 'V-12.345.678',
      carrierId: 'P1',
      carrierName: 'Transporte Andino',
    });
  });

  it('una compañía que ya no está deja el nombre en nulo, no rompe', () => {
    expect(toDriverOptions(conductores, [])[0]?.carrierName).toBeNull();
  });

  it('el buscador encuentra por cédula escrita de otra forma', () => {
    // Es la prueba de que el puente sirve: la guía trae "V12345678" sin puntos ni guiones.
    const opciones = toDriverOptions(conductores, companias);
    const resultados = searchDrivers(opciones, 'V12345678');

    expect(resultados[0]?.driver.id).toBe('D1');
    expect(resultados[0]?.matchedOn).toBe('document');
  });

  it('el buscador encuentra por apellido', () => {
    const opciones = toDriverOptions(conductores, companias);
    expect(searchDrivers(opciones, 'perez')[0]?.driver.id).toBe('D2');
  });

  it('elegir la compañía acota la búsqueda a sus conductores', () => {
    const opciones = toDriverOptions(conductores, companias);
    const resultados = searchDrivers(opciones, '', { carrierId: 'P2' });

    expect(resultados.map((r) => r.driver.id)).toEqual(['D2']);
  });
});
