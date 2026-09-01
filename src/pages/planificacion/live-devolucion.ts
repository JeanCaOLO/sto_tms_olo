import type { Pedido } from './types';

export interface DevolucionEnVivoInput {
  ref: string;
  peso: number;
  volumen: number;
}

// Devolución "al pie de camión": recolección no planificada que aparece
// durante el reparto. No viene en el viaje del WMS — se siembra en la
// secuencia y en el pool para que sobreviva a "Optimizar paradas". Sin
// lat/lng: cuenta en la carga, queda fuera del trazo del mapa y se ubica al
// final de la secuencia.
export function crearDevolucionEnVivo(input: DevolucionEnVivoInput): Pedido {
  return {
    id: `live-${Date.now()}`,
    order_number: 'EN VIVO',
    customer_id: '', store_id: '', status: 'pending',
    order_date: new Date().toISOString(),
    delivery_address: input.ref, delivery_city: '', delivery_zone: '',
    total_weight: input.peso, total_volume: input.volumen,
    customer_name: input.ref,
    tipo: 'devolucion', is_live: true, live_ref: input.ref,
  };
}

// Une las anclas del usuario con las devoluciones en vivo: el optimizador debe
// dejar fuera entregas antes que una recolección "al pie de camión".
export function conAnclasEnVivo(pedidos: Pedido[], anclados?: Set<string>): Set<string> {
  return new Set<string>([
    ...(anclados ?? []),
    ...pedidos.filter((p) => p.is_live).map((p) => p.id),
  ]);
}
