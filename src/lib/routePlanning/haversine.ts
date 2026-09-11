import type { Stop } from './types.ts';

const EARTH_RADIUS_KM = 6371;
// ponytail: straight-line + flat urban speed, used only when no Google Maps key
// is configured. Ceiling: ignores real roads/traffic. Upgrade: driving-mode API
// (google-distance-matrix.ts) or a self-hosted OSRM instance once available.
const FALLBACK_AVG_SPEED_KMH = 30;

export function haversineKm(a: Stop, b: Stop): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function estimateDurationMin(distanceKm: number): number {
  return (distanceKm / FALLBACK_AVG_SPEED_KMH) * 60;
}
