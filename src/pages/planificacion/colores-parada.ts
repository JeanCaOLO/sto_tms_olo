import type { PlanStop } from './planes-types';

// Paleta de colores distinguibles para los puntos de entrega de un viaje.
const PALETA = [
  '#0d9488', // teal
  '#7c3aed', // violeta
  '#db2777', // rosa
  '#ea580c', // naranja
  '#2563eb', // azul
  '#16a34a', // verde
  '#ca8a04', // ámbar
  '#0891b2', // cyan
];
const SIN_COORDS = '#94a3b8'; // gris para paradas sin coordenadas

// Clave de agrupación = punto físico de entrega (coordenadas). Varios pedidos
// con las mismas coords comparten parada → comparten color.
function claveDe(s: PlanStop): string | null {
  if (s.delivery_latitude == null || s.delivery_longitude == null) return null;
  return `${s.delivery_latitude},${s.delivery_longitude}`;
}

export interface ColoresParada {
  colorDe: Map<string, string>; // order_id → color
  puntos: number; // cantidad de puntos de entrega únicos
}

// Asigna un color por punto de entrega, en orden de aparición de las paradas.
export function coloresPorPunto(stops: PlanStop[]): ColoresParada {
  const colorDeClave = new Map<string, string>();
  const colorDe = new Map<string, string>();
  let i = 0;
  for (const s of stops) {
    const k = claveDe(s);
    if (k == null) {
      colorDe.set(s.order_id, SIN_COORDS);
      continue;
    }
    if (!colorDeClave.has(k)) {
      colorDeClave.set(k, PALETA[i % PALETA.length]);
      i += 1;
    }
    colorDe.set(s.order_id, colorDeClave.get(k) as string);
  }
  return { colorDe, puntos: colorDeClave.size };
}
