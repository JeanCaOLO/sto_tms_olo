// Buscador de conductor y su transportista.
//
// El escenario que guía todo: la guía física trae "JOSÉ RAMÍREZ" y la cédula "1-2345-6789", y no
// dice de qué compañía es. Quien liquida tipea cualquiera de esos dos datos y tiene que llegar al
// conductor Y a su transportista.

import { describe, expect, it } from 'vitest';
import {
  driversOfCarrier, driversWithoutCarrier, normalizeDocument, searchDrivers, type DriverOption,
} from '../driverSearch';

const CONDUCTORES: DriverOption[] = [
  { id: 'D1', fullName: 'José Ramírez', document: '1-2345-6789', carrierId: 'C1', carrierName: 'Transportes Cofersa' },
  { id: 'D2', fullName: 'María Jiménez', document: '2-3456-7890', carrierId: 'C1', carrierName: 'Transportes Cofersa' },
  { id: 'D3', fullName: 'Carlos Ramírez', document: '3-4567-8901', carrierId: 'C2', carrierName: 'EPA Logística' },
  { id: 'D4', fullName: 'Ana Solís', document: '4-5678-9012', carrierId: null, carrierName: null },
  { id: 'D5', fullName: 'Pedro Mora', document: '12345', carrierId: 'C2', carrierName: 'EPA Logística' },
];

const ids = (results: ReturnType<typeof searchDrivers>) => results.map((r) => r.driver.id);

// ── El caso de la guía física ─────────────────────────────────────────────────────────────────

describe('buscar por cédula, que es lo que trae la guía', () => {
  it('encuentra al conductor y trae su transportista', () => {
    const [primero] = searchDrivers(CONDUCTORES, '1-2345-6789');

    expect(primero.driver.fullName).toBe('José Ramírez');
    expect(primero.driver.carrierName).toBe('Transportes Cofersa');
    expect(primero.matchedOn).toBe('document');
  });

  it('no importa cómo esté escrita la cédula', () => {
    // La misma persona, escrita de cuatro formas distintas.
    for (const escrita of ['1-2345-6789', '1 2345 6789', '123456789', '1.2345.6789']) {
      expect(searchDrivers(CONDUCTORES, escrita)[0]?.driver.id).toBe('D1');
    }
  });

  it('busca por cédula parcial, que es como se tipea', () => {
    expect(ids(searchDrivers(CONDUCTORES, '2345'))).toContain('D1');
  });

  it('la coincidencia exacta de cédula gana a la parcial', () => {
    // "12345" es la cédula completa de D5 y aparece dentro de la de D1.
    expect(searchDrivers(CONDUCTORES, '12345')[0]?.driver.id).toBe('D5');
  });
});

describe('buscar por nombre', () => {
  it('encuentra sin importar tildes ni mayúsculas', () => {
    expect(ids(searchDrivers(CONDUCTORES, 'JOSE'))).toContain('D1');
    expect(ids(searchDrivers(CONDUCTORES, 'josé'))).toContain('D1');
  });

  it('encuentra por apellido, no solo por nombre', () => {
    expect(ids(searchDrivers(CONDUCTORES, 'ramirez')).sort()).toEqual(['D1', 'D3']);
  });

  it('el nombre completo exacto va primero', () => {
    expect(searchDrivers(CONDUCTORES, 'Carlos Ramírez')[0]?.driver.id).toBe('D3');
  });
});

describe('buscar por transportista', () => {
  it('escribir el nombre de la compañía trae a sus conductores', () => {
    const resultados = searchDrivers(CONDUCTORES, 'EPA');

    expect(ids(resultados).sort()).toEqual(['D3', 'D5']);
    expect(resultados[0].matchedOn).toBe('carrier');
  });

  it('un conductor pesa más que una compañía con el mismo término', () => {
    // "Mora" es el apellido de D5; ninguna compañía se llama así, pero si la hubiera, el conductor
    // tiene que aparecer primero: se está buscando una persona.
    expect(searchDrivers(CONDUCTORES, 'Mora')[0]?.matchedOn).toBe('name');
  });
});

// ── El camino inverso ─────────────────────────────────────────────────────────────────────────

describe('elegir la compañía y filtrar sus conductores', () => {
  it('lista solo los de esa compañía', () => {
    // Alfabético por nombre: José antes que María.
    expect(driversOfCarrier(CONDUCTORES, 'C1').map((d) => d.id)).toEqual(['D1', 'D2']);
  });

  it('acotar la búsqueda a una compañía descarta a los demás', () => {
    // "Ramírez" son dos, pero solo uno es de Cofersa.
    expect(ids(searchDrivers(CONDUCTORES, 'ramirez', { carrierId: 'C1' }))).toEqual(['D1']);
  });

  it('sin término, muestra los de la compañía en vez de no mostrar nada', () => {
    expect(ids(searchDrivers(CONDUCTORES, '', { carrierId: 'C2' })).sort()).toEqual(['D3', 'D5']);
  });

  it('los conductores sin transportista se pueden listar aparte', () => {
    expect(driversWithoutCarrier(CONDUCTORES).map((d) => d.id)).toEqual(['D4']);
  });
});

// ── Robustez ──────────────────────────────────────────────────────────────────────────────────

describe('comportamiento', () => {
  it('el orden es determinista: la misma búsqueda da siempre lo mismo', () => {
    const alReves = [...CONDUCTORES].reverse();
    expect(ids(searchDrivers(CONDUCTORES, 'ramirez'))).toEqual(ids(searchDrivers(alReves, 'ramirez')));
  });

  it('sin coincidencias devuelve lista vacía, no un error', () => {
    expect(searchDrivers(CONDUCTORES, 'zzzz')).toEqual([]);
  });

  it('un conductor sin cédula no rompe la búsqueda', () => {
    const conNulo: DriverOption[] = [
      { id: 'X', fullName: 'Sin Documento', document: null, carrierId: null, carrierName: null },
    ];
    expect(ids(searchDrivers(conNulo, 'sin'))).toEqual(['X']);
    expect(searchDrivers(conNulo, '123')).toEqual([]);
  });

  it('respeta el límite de resultados', () => {
    expect(searchDrivers(CONDUCTORES, '', { limit: 2 })).toHaveLength(2);
  });
});

describe('normalizeDocument', () => {
  it('deja solo lo significativo', () => {
    expect(normalizeDocument('1-2345-6789')).toBe('123456789');
    expect(normalizeDocument('V-12.345.678')).toBe('v12345678');
    expect(normalizeDocument(null)).toBe('');
  });
});
