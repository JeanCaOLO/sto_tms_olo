import type { Stop } from './types';

/**
 * Orden de VISUALIZACIÓN de las paradas (mapa y lista): el de la secuencia que fija Planificación según la prioridad del
 * OMS. No se reordena por cercanía a la sede: una parada lejana con prioridad alta va antes que una cercana. Es el mismo
 * orden del que parten la «siguiente parada» y el ETA del backend. Las paradas sin secuencia válida quedan al final.
 */
export function ordenarPorSecuencia(stops: Stop[]): Stop[] {
  return [...stops].sort((a, b) => a.sequence - b.sequence);
}
