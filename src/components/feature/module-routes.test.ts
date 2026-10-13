import { describe, it, expect } from 'vitest';
import { permKeyForPath } from './module-routes';

describe('permKeyForPath', () => {
  it('devuelve el permKey para un path exacto', () => {
    const key = permKeyForPath('/liquidaciones');
    expect(typeof key).toBe('string');
  });

  it('maneja trailing slashes: /liquidaciones/', () => {
    const key = permKeyForPath('/liquidaciones/');
    expect(typeof key).toBe('string');
  });

  it('devuelve el mismo permKey con o sin trailing slash', () => {
    const withoutSlash = permKeyForPath('/liquidaciones');
    const withSlash = permKeyForPath('/liquidaciones/');
    expect(withSlash).toBe(withoutSlash);
  });

  it('devuelve undefined para paths desconocidos', () => {
    const key = permKeyForPath('/paths-that-do-not-exist');
    expect(key).toBeUndefined();
  });

  it('normaliza mayúsculas en la búsqueda', () => {
    // La búsqueda se hace en minúsculas internamente
    const key1 = permKeyForPath('/liquidaciones');
    const key2 = permKeyForPath('/LIQUIDACIONES');
    expect(key2).toBe(key1);
  });
});

describe('Costos Flota', () => {
  it('exige tarifas.config en la ruta consolidada', () => {
    expect(permKeyForPath('/tarifas/costos-flota')).toBe('tarifas.config');
    expect(permKeyForPath('/tarifas/costos-flota/')).toBe('tarifas.config');
  });
});
