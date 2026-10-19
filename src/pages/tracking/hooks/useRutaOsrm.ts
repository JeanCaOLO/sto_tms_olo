import { useEffect, useMemo, useState } from 'react';
import { rutaPorCalles, type Tramo } from '../route-osrm';
import { ordenarPorCercania } from '../stop-order';
import type { ViajeDetalle } from '../types';

/** Puntos de la ruta: sede (si tiene coordenadas) y paradas con coordenadas, por cercanía (ver stop-order.ts). */
export function puntosRuta(detail: Pick<ViajeDetalle, 'origin' | 'stops'>): { puntos: [number, number][]; stopIds: (string | null)[] } {
  const puntos: [number, number][] = [];
  const stopIds: (string | null)[] = [];
  if (detail.origin) { puntos.push([detail.origin.lat, detail.origin.lng]); stopIds.push(null); }
  ordenarPorCercania(detail.origin, detail.stops).forEach((s) => {
    if (s.lat != null && s.lng != null) { puntos.push([s.lat, s.lng]); stopIds.push(s.id); }
  });
  return { puntos, stopIds };
}

/** Tramos por calles del viaje; se recalcula solo si cambian sus puntos (no en cada refresco del detalle). */
export function useRutaOsrm(detail: ViajeDetalle | null) {
  const ruta = useMemo(() => (detail ? puntosRuta(detail) : null), [detail]);
  const key = ruta ? `${detail?.id}|${ruta.puntos.join(';')}` : '';
  const [state, setState] = useState<{ key: string; tramos: Tramo[] } | null>(null);
  useEffect(() => {
    if (!ruta || ruta.puntos.length < 2) return undefined;
    let alive = true;
    void rutaPorCalles(ruta.puntos).then((tramos) => { if (alive) setState({ key, tramos }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { tramos: state?.key === key ? state.tramos : [], stopIds: ruta?.stopIds ?? [] };
}
