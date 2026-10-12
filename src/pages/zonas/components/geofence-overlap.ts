// Detección de solapamiento entre geocercas (polígonos GeoJSON [lon,lat]).
//
// No hay @turf/boolean-overlap en el árbol (geoman trae un subconjunto), así que
// se compone con lo disponible: dos polígonos se solapan si algún vértice de uno
// cae dentro del otro, o si sus bordes se cruzan. Es una heurística suficiente
// para AVISAR al usuario (no un bloqueo duro): cubre los casos reales de zonas
// dibujadas a mano. ponytail: heurística por vértices+bordes, no un clip exacto;
// un solape onde ningún vértice entra y los bordes no se cortan (un polígono
// estrictamente dentro de otro sin tocar) se cubre con la prueba de contención.
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import lineIntersect from '@turf/line-intersect';
import { polygon as turfPolygon, lineString, type Feature, type Polygon } from '@turf/helpers';
import type { GeoJSONGeometry } from './ZoneMap';

/** Anillos exteriores de un Polygon/MultiPolygon, cada uno como lista de [lon,lat]. */
function outerRings(geom: GeoJSONGeometry): number[][][] {
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates as number[][][];
    return rings.length ? [rings[0]] : [];
  }
  const polys = geom.coordinates as number[][][][];
  return polys.map((poly) => poly[0]).filter(Boolean);
}

function toTurf(geom: GeoJSONGeometry): Feature<Polygon> | null {
  const ring = outerRings(geom)[0];
  if (!ring || ring.length < 4) return null;
  try {
    return turfPolygon([ring]);
  } catch {
    return null;
  }
}

/** ¿Se solapan las dos geocercas? Heurística vértices-dentro + cruce de bordes. */
export function geofencesOverlap(a: GeoJSONGeometry, b: GeoJSONGeometry): boolean {
  const pa = toTurf(a);
  const pb = toTurf(b);
  if (!pa || !pb) return false;

  const ringsA = outerRings(a);
  const ringsB = outerRings(b);

  // 1. Algún vértice de A dentro de B (o al revés) → se pisan.
  for (const [rings, other] of [[ringsA, pb], [ringsB, pa]] as const) {
    for (const ring of rings) {
      for (const pt of ring) {
        if (booleanPointInPolygon(pt as [number, number], other)) return true;
      }
    }
  }

  // 2. Los bordes se cruzan (solape parcial sin vértices adentro).
  for (const ringA of ringsA) {
    for (const ringB of ringsB) {
      if (ringA.length >= 2 && ringB.length >= 2
        && lineIntersect(lineString(ringA), lineString(ringB)).features.length > 0) {
        return true;
      }
    }
  }
  return false;
}

/** Nombres de las zonas existentes que se solapan con la geocerca nueva. */
export function overlappingZoneNames(
  nueva: GeoJSONGeometry,
  existentes: { name: string; geofence: GeoJSONGeometry | null }[],
): string[] {
  return existentes
    .filter((z) => z.geofence && geofencesOverlap(nueva, z.geofence))
    .map((z) => z.name);
}
