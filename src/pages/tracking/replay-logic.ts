// Reglas puras del replay del recorrido: interpolación sobre el rastro y detección de paradas.
import type { RecorridoPoint } from './types';

export type TrailPoint = RecorridoPoint;

export interface ReplayPoint {
  lat: number;
  lng: number;
  /** Instante (ms epoch) que representa el punto interpolado. */
  at: number;
  /** Índice del último punto del rastro ya recorrido. */
  index: number;
}

export interface DetectedStop {
  lat: number;
  lng: number;
  fromMs: number;
  toMs: number;
}

export const REPLAY_SPEEDS = [1, 2, 5, 10];
/** Duración del replay completo a 1×. */
export const REPLAY_BASE_MS = 30_000;
const STOP_RADIUS_M = 100;
const STOP_MIN_MS = 3 * 60_000;

const rad = Math.PI / 180;

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Puntos con fecha válida, en orden cronológico. */
export function validTrail(trail: TrailPoint[]): TrailPoint[] {
  return trail
    .filter((p) => Number.isFinite(Date.parse(p.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** Posición del camión en `progress` (0 a 1) del recorrido, interpolando entre puntos por tiempo; null con <2 puntos. */
export function pointAt(trail: TrailPoint[], progress: number): ReplayPoint | null {
  if (trail.length < 2) return null;
  const p = Math.min(1, Math.max(0, progress));
  const start = Date.parse(trail[0].at);
  const span = Date.parse(trail[trail.length - 1].at) - start;
  const at = start + span * p;
  let index = 0;
  while (index < trail.length - 2 && Date.parse(trail[index + 1].at) <= at) index += 1;
  const a = trail[index];
  const b = trail[index + 1];
  const ta = Date.parse(a.at);
  const tb = Date.parse(b.at);
  const f = tb > ta ? Math.min(1, Math.max(0, (at - ta) / (tb - ta))) : 0;
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, at, index };
}

/** Tramos donde el camión permaneció dentro de 100 m del mismo punto al menos 3 min. */
export function detectStops(trail: TrailPoint[], radiusM = STOP_RADIUS_M, minMs = STOP_MIN_MS): DetectedStop[] {
  const found: DetectedStop[] = [];
  let i = 0;
  while (i < trail.length) {
    let j = i;
    while (j + 1 < trail.length && distanceM(trail[i], trail[j + 1]) <= radiusM) j += 1;
    const fromMs = Date.parse(trail[i].at);
    const toMs = Date.parse(trail[j].at);
    if (j > i && toMs - fromMs >= minMs) {
      found.push({ lat: trail[i].lat, lng: trail[i].lng, fromMs, toMs });
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return found;
}
