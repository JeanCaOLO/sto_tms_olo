import { describe, it, expect } from 'vitest';
import { geofencesOverlap, overlappingZoneNames } from './geofence-overlap';
import type { GeoJSONGeometry } from './ZoneMap';

// Cuadrado [lon,lat] cerrado (primer y último punto iguales).
function square(x: number, y: number, s = 1): GeoJSONGeometry {
  return { type: 'Polygon', coordinates: [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]] };
}

describe('geofencesOverlap', () => {
  it('dos cuadrados que se pisan → true', () => {
    expect(geofencesOverlap(square(0, 0, 2), square(1, 1, 2))).toBe(true);
  });

  it('dos cuadrados separados → false', () => {
    expect(geofencesOverlap(square(0, 0, 1), square(5, 5, 1))).toBe(false);
  });

  it('cuadrados que apenas comparten borde pero no área → false', () => {
    // Adyacentes: uno termina en x=1, el otro empieza en x=1 (tocan el borde).
    // No es un solape de área; la heurística no debe gritar por tocarse.
    expect(geofencesOverlap(square(0, 0, 1), square(2, 0, 1))).toBe(false);
  });

  it('un cuadrado contenido dentro de otro → true', () => {
    expect(geofencesOverlap(square(0, 0, 10), square(3, 3, 2))).toBe(true);
  });
});

describe('overlappingZoneNames', () => {
  it('devuelve los nombres de las zonas que se pisan', () => {
    const nueva = square(0, 0, 2);
    const names = overlappingZoneNames(nueva, [
      { name: 'Z1', geofence: square(1, 1, 2) }, // se pisa
      { name: 'Z2', geofence: square(9, 9, 1) }, // lejos
      { name: 'Z3', geofence: null },            // sin cerca
    ]);
    expect(names).toEqual(['Z1']);
  });
});
