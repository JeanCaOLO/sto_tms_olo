import type { MatrizDistancias } from './distance-matrix';
import type { PedidoSeleccionado } from './types';

// Ventana horaria por defecto: 8 am a 7 pm. Fusionada desde el prototipo
// (src/lib/routePlanning/plan-route.ts). Cuando el negocio soporte ventanas
// por cliente, estos defaults se usan como fallback.
export const DEFAULT_WINDOW_START_MIN = 8 * 60; // 480
export const DEFAULT_WINDOW_END_MIN = 19 * 60; // 1140

// ponytail: assumes 5 min service time per stop (driver parks, delivers,
// collects signature). Ceiling: doesn't account for multi-package stops or
// difficult access. Upgrade: make service_time a per-order field when data
// is available from the WMS.
const SERVICE_TIME_MIN = 5;

export interface EtaResult {
  /** Minutes from midnight (e.g. 510 = 8:30 am) */
  eta_min: number;
  outside_window: boolean;
}

/** Formats minutes-from-midnight to "HH:MM" (24h) */
export function formatEta(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Calculates the ETA for each stop in the ordered sequence, walking the
 * clock forward from DEFAULT_WINDOW_START_MIN using travel durations from
 * the matrix.
 *
 * Returns a new array with `eta_min` and `outside_window` filled in.
 * Stops without coordinates (is_exception) get eta_min = -1 / outside_window = false
 * since we can't compute their travel time.
 */
export function calcularEtas(
  paradas: PedidoSeleccionado[],
  matriz: MatrizDistancias,
): PedidoSeleccionado[] {
  if (paradas.length === 0) return [];

  let clock = DEFAULT_WINDOW_START_MIN;
  const resultado: PedidoSeleccionado[] = [];

  for (let i = 0; i < paradas.length; i++) {
    const parada = paradas[i];

    if (parada.delivery_latitude == null || parada.delivery_longitude == null) {
      resultado.push({ ...parada, eta_min: -1, outside_window: false });
      continue;
    }

    if (i > 0) {
      const prev = paradas[i - 1];
      const travel = matriz.duracionMin(prev.id, parada.id) ?? 0;
      clock += travel + SERVICE_TIME_MIN;
    }

    const eta_min = clock;
    const outside_window = eta_min > DEFAULT_WINDOW_END_MIN;
    resultado.push({ ...parada, eta_min, outside_window });
  }

  return resultado;
}
