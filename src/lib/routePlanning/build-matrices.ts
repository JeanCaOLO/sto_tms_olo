import type { DistanceMatrices, Stop } from './types.ts';
import { estimateDurationMin, haversineKm } from './haversine.ts';
import { fetchDrivingMatrix } from './google-distance-matrix.ts';

function buildFallbackMatrices(stops: Stop[]): DistanceMatrices {
  const n = stops.length;
  const distanceKm: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const durationMin: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      distanceKm[i][j] = haversineKm(stops[i], stops[j]);
      durationMin[i][j] = estimateDurationMin(distanceKm[i][j]);
    }
  }
  return { distanceKm, durationMin, usedFallback: true };
}

export async function buildMatrices(stops: Stop[], googleApiKey?: string): Promise<DistanceMatrices> {
  if (!googleApiKey) return buildFallbackMatrices(stops);
  const { distanceKm, durationMin } = await fetchDrivingMatrix(stops, googleApiKey);
  return { distanceKm, durationMin, usedFallback: false };
}
