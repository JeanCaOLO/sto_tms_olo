import type { Stop, ViajeDetalle } from './types';

type Point = [number, number];

const rad = (deg: number) => (deg * Math.PI) / 180;
function meters([lat1, lng1]: Point, [lat2, lng2]: Point): number {
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
const pointOf = (s: Stop): Point | null => (s.lat != null && s.lng != null ? [s.lat, s.lng] : null);

/**
 * Orden de VISUALIZACIÓN de las paradas (mapa y lista): primero las ya cerradas (por hora de llegada) y luego las
 * pendientes por vecino más cercano, partiendo de la sede o de la última parada cerrada. Sin sede se parte de la
 * primera parada pendiente de la secuencia (pendiente: usar la sede de Costa Rica cuando exista). No cambia la
 * secuencia de Planificación (`sequence`, "siguiente parada" y ETA siguen siendo los del backend). Las paradas sin
 * coordenadas van al final, en su secuencia.
 */
export function ordenarPorCercania(origin: ViajeDetalle['origin'], stops: Stop[]): Stop[] {
  const bySequence = [...stops].sort((a, b) => a.sequence - b.sequence);
  const closed = bySequence
    .filter((s) => s.state !== 'pending')
    .sort((a, b) => (a.arrived_at ?? '￿').localeCompare(b.arrived_at ?? '￿') || a.sequence - b.sequence);
  const pending = bySequence.filter((s) => s.state === 'pending');
  const located = pending.filter((s) => pointOf(s));
  const unlocated = pending.filter((s) => !pointOf(s));

  const lastClosed = [...closed].reverse().map(pointOf).find((p) => p !== null) ?? null;
  let here: Point | null = lastClosed ?? (origin ? [origin.lat, origin.lng] : null);
  const ordered: Stop[] = [];
  const left = [...located];
  if (here === null && left.length) {
    const first = left.shift() as Stop; // sin sede: la primera de la secuencia es el punto de partida
    ordered.push(first);
    here = pointOf(first);
  }
  while (left.length && here) {
    let best = 0;
    let bestDistance = Infinity;
    left.forEach((s, i) => {
      const distance = meters(here as Point, pointOf(s) as Point);
      if (distance < bestDistance) { best = i; bestDistance = distance; }
    });
    const [picked] = left.splice(best, 1);
    ordered.push(picked);
    here = pointOf(picked);
  }
  return [...closed, ...ordered, ...unlocated];
}
