import { describe, expect, it } from 'vitest';
import { fechaAlistamiento, tiempoViajeDias } from './tiempo-cluster';
import type { PlanStop, PlanTrip } from './planes-types';

// Construye un viaje con solo las coordenadas que importan al cálculo.
function trip(coords: ([number, number] | null)[]): PlanTrip {
  const stops = coords.map(
    (c, i) =>
      ({
        id: `s${i}`,
        delivery_latitude: c ? c[0] : null,
        delivery_longitude: c ? c[1] : null,
      }) as PlanStop,
  );
  return { stops } as PlanTrip;
}

const GAM: [number, number] = [9.93, -84.09]; // junto al depósito (San José)
const LA_FORTUNA: [number, number] = [10.47, -84.64]; // ~85 km → T-2
const LIBERIA: [number, number] = [10.6333, -85.4375]; // ~167 km → T-3

describe('tiempo-cluster (T-n dinámico por distancia real)', () => {
  it('cluster dentro del GAM → T-1', () => {
    expect(tiempoViajeDias(trip([GAM, GAM]))).toBe(1);
  });

  it('cluster lejano (La Fortuna) → T-2 por la parada más lejana', () => {
    // La parada más lejana manda, aunque haya paradas cercanas en el mismo viaje.
    expect(tiempoViajeDias(trip([GAM, LA_FORTUNA]))).toBe(2);
  });

  it('cluster muy lejano (Guanacaste) → T-3', () => {
    expect(tiempoViajeDias(trip([LIBERIA]))).toBe(3);
  });

  it('sin coordenadas en ninguna parada → T-1 por defecto', () => {
    expect(tiempoViajeDias(trip([null, null]))).toBe(1);
  });

  it('fechaAlistamiento = entrega − tiempo del cluster', () => {
    expect(fechaAlistamiento('2026-10-15', trip([GAM]))).toBe('2026-10-14'); // T-1
    expect(fechaAlistamiento('2026-10-20', trip([LA_FORTUNA]))).toBe('2026-10-18'); // T-2
    expect(fechaAlistamiento('2026-10-20', trip([LIBERIA]))).toBe('2026-10-17'); // T-3
  });
});
