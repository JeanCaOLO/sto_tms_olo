import type { Stop } from './types';

/**
 * Orden de VISUALIZACIÓN de las paradas (mapa y lista): el de la secuencia que fija Planificación según la prioridad del
 * OMS. No se reordena por cercanía a la sede: una parada lejana con prioridad alta va antes que una cercana. Es el mismo
 * orden del que parten la «siguiente parada» y el ETA del backend. Las paradas sin secuencia válida quedan al final.
 */
export function ordenarPorSecuencia(stops: Stop[]): Stop[] {
  // Sin secuencia numérica (nula, NaN) la resta daría NaN y el orden quedaría indefinido: esas van al final.
  const key = (stop: Stop) => (Number.isFinite(stop.sequence) ? stop.sequence : Number.POSITIVE_INFINITY);
  return [...stops].sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    return ka === kb ? 0 : ka < kb ? -1 : 1;
  });
}
