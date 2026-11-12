import { describe, expect, it } from 'vitest';
import { inRange, rangeFor, rangeToIso } from '../dateRange';

// Miércoles 21 de octubre de 2026.
const WED = new Date(2026, 9, 21, 15, 30);

describe('rangeFor', () => {
  it('hoy es el día actual', () => {
    expect(rangeFor('today', WED)).toEqual({ preset: 'today', from: '2026-10-21', to: '2026-10-21' });
  });

  it('semana va de lunes a domingo', () => {
    expect(rangeFor('week', WED)).toMatchObject({ from: '2026-10-19', to: '2026-10-25' });
    expect(rangeFor('week', new Date(2026, 9, 25))).toMatchObject({ from: '2026-10-19', to: '2026-10-25' }); // domingo
  });

  it('mes cubre el mes completo, también febrero bisiesto', () => {
    expect(rangeFor('month', WED)).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
    expect(rangeFor('month', new Date(2028, 1, 10))).toMatchObject({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('todo no limita y rango conserva lo escrito', () => {
    expect(rangeFor('all', WED)).toEqual({ preset: 'all', from: '', to: '' });
    expect(rangeFor('custom', WED, { from: '2026-10-01', to: '2026-10-05' })).toEqual({ preset: 'custom', from: '2026-10-01', to: '2026-10-05' });
  });
});

describe('inRange', () => {
  const range = rangeFor('custom', WED, { from: '2026-10-19', to: '2026-10-21' });

  it('es inclusivo en ambos extremos', () => {
    expect(inRange(new Date(2026, 9, 19, 0, 0).toISOString(), range)).toBe(true);
    expect(inRange(new Date(2026, 9, 21, 23, 59).toISOString(), range)).toBe(true);
    expect(inRange(new Date(2026, 9, 22, 0, 1).toISOString(), range)).toBe(false);
    expect(inRange(new Date(2026, 9, 18, 23, 59).toISOString(), range)).toBe(false);
  });

  it('sin límite acepta cualquier fecha válida; un valor vacío o inválido no cae', () => {
    expect(inRange('2020-01-01T00:00:00Z', rangeFor('all'))).toBe(true);
    expect(inRange(null, rangeFor('all'))).toBe(false);
    expect(inRange('no es fecha', rangeFor('all'))).toBe(false);
  });

  it('rangeToIso deja nulo el límite vacío', () => {
    expect(rangeToIso(rangeFor('all'))).toEqual({ from: null, to: null });
    expect(rangeToIso(range).from).toBe(new Date(2026, 9, 19, 0, 0, 0).toISOString());
  });
});
