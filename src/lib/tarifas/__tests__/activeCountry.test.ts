// Resolución del país activo del módulo.
//
// Es poco código pero decide QUÉ se ve en todo el tarifador: si devuelve un país que ya no existe,
// las listas quedan vacías sin explicación y parece que se perdieron los datos.

import { describe, expect, it } from 'vitest';
import { resolveActiveCountry } from '../activeCountry';

const PAISES = [
  { id: 'VE', name: 'Venezuela' },
  { id: 'CR', name: 'Costa Rica' },
];

describe('resolveActiveCountry', () => {
  it('respeta el país guardado', () => {
    expect(resolveActiveCountry(PAISES, 'CR')?.id).toBe('CR');
  });

  it('sin país guardado usa el primero', () => {
    expect(resolveActiveCountry(PAISES, null)?.id).toBe('VE');
  });

  it('si el guardado ya no existe, cae al primero en vez de dejar el módulo en un país fantasma', () => {
    // Pasa al cambiar de entorno o al borrar un país: sin este resguardo, todas las listas
    // filtrarían por un id inexistente y aparecerían vacías.
    expect(resolveActiveCountry(PAISES, 'XX')?.id).toBe('VE');
  });

  it('sin países configurados devuelve null, que la barra traduce en un aviso', () => {
    expect(resolveActiveCountry([], 'VE')).toBeNull();
  });
});
