import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeText } from '../text';

describe('normalizeText', () => {
  it('quita acentos, pasa a minúsculas y recorta', () => {
    expect(normalizeText('  JOSÉ Ñandú  ')).toBe('jose nandu');
  });
  it('null y undefined dan cadena vacía', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
  it('acepta números', () => {
    expect(normalizeText(1250)).toBe('1250');
  });
});

describe('matchesSearch', () => {
  it('ignora mayúsculas y acentos en ambos lados', () => {
    expect(matchesSearch('Camión Rural', 'CAMION')).toBe(true);
    expect(matchesSearch('Camion rural', 'camión')).toBe(true);
  });
  it('búsqueda vacía coincide con todo', () => {
    expect(matchesSearch('x', '  ')).toBe(true);
  });
  it('no coincide cuando no está', () => {
    expect(matchesSearch('Cartago', 'heredia')).toBe(false);
  });
});
