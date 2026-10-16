import { describe, expect, it } from 'vitest';
import { fechaAlistamiento, tiempoViajeDias } from './tiempo-cluster';

describe('tiempo-cluster (T-1 dinámico)', () => {
  it('da el tiempo logístico por zona, con default para zona desconocida/null', () => {
    expect(tiempoViajeDias('Zona 1')).toBe(1);
    expect(tiempoViajeDias('Zona 4')).toBe(2); // ruta larga (San Carlos/La Fortuna)
    expect(tiempoViajeDias('Zona X')).toBe(1); // default
    expect(tiempoViajeDias(null)).toBe(1);
  });

  it('calcula la fecha de alistamiento hacia atrás desde la entrega', () => {
    expect(fechaAlistamiento('2026-10-15', 'Zona 1')).toBe('2026-10-14'); // T-1
    expect(fechaAlistamiento('2026-10-15', 'Zona 4')).toBe('2026-10-13'); // T-2
  });
});
