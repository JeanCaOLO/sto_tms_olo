// Orquestador de la planificación automática. Módulo PURO (sin React, sin
// fetch, sin import.meta.env) — lo cargan también scripts de Node vía esbuild.
//
//   pedidos de mañana
//     → agrupar por destino (delivery_zone)
//     → asignar vehículo a cada destino (flota propia primero)
//     → ordenar las paradas de cada viaje (nearest-neighbor)
//     → una propuesta de viaje por destino
//
// CAPACIDAD DESACTIVADA (USAR_CAPACIDAD = false): hoy los pedidos reales no
// traen peso/volumen (llegan null, capacity_known=false — ver CANAL.md/Claude),
// y el negocio pidió no planificar por capacidad todavía. Con el flag apagado
// se asigna UN vehículo por destino sin partir el grupo ni mirar peso/volumen.
// Cuando EFLOW traiga los datos de línea, poner el flag en true reactiva el
// reparto por capacidad (repartirEntreFlota) sin reescribir la UI ni el hook.

import { compararPrioridadFlota, repartirEntreFlota, type FlotaSlot } from './fleet-split';
import { optimizarParadas, withStopNumbers } from './optimize-stops';
import type { Pedido, PedidoSeleccionado } from './types';

// Interruptor único de capacidad. Ver comentario de cabecera.
export const USAR_CAPACIDAD = false;

export interface ViajePropuesto {
  destino: string; // delivery_zone
  slot: FlotaSlot;
  pedidos: PedidoSeleccionado[];
  // Totales solo cuando la capacidad está activa y hay datos; null = desconocido.
  pesoTotal: number | null;
  volumenTotal: number | null;
}

export interface ResultadoPlan {
  viajes: ViajePropuesto[];
  // Pedidos que ninguna combinación destino/vehículo pudo acomodar: con
  // capacidad apagada, son los destinos que se quedaron sin vehículo libre.
  sinAsignar: Pedido[];
}

const destinoDe = (p: Pedido): string => p.delivery_zone || '(sin destino)';

export function agruparPorDestino(pedidos: Pedido[]): Map<string, Pedido[]> {
  const grupos = new Map<string, Pedido[]>();
  for (const p of pedidos) {
    const clave = destinoDe(p);
    const lista = grupos.get(clave);
    if (lista) lista.push(p);
    else grupos.set(clave, [p]);
  }
  return grupos;
}

// Suma un campo tratando null/undefined como desconocido: si NINGÚN pedido lo
// trae, el total es null (no 0), para que la UI muestre "no disponible".
function sumarOpcional(pedidos: PedidoSeleccionado[], campo: 'total_weight' | 'total_volume'): number | null {
  const conDato = pedidos.filter((p) => p[campo] != null);
  if (conDato.length === 0) return null;
  return conDato.reduce((s, p) => s + (p[campo] as number), 0);
}

export function planificarDia(pedidos: Pedido[], slots: FlotaSlot[]): ResultadoPlan {
  return USAR_CAPACIDAD ? planPorCapacidad(pedidos, slots) : planSinCapacidad(pedidos, slots);
}

// Flag apagado: un vehículo por destino, flota propia primero, sin partir el
// grupo. Si se acaban los vehículos, los destinos restantes quedan sin asignar
// (nunca un viaje sin camión).
function planSinCapacidad(pedidos: Pedido[], slots: FlotaSlot[]): ResultadoPlan {
  const grupos = [...agruparPorDestino(pedidos).entries()];
  const disponibles = [...slots].sort(compararPrioridadFlota);
  const viajes: ViajePropuesto[] = [];
  const sinAsignar: Pedido[] = [];

  for (const [destino, pedidosDestino] of grupos) {
    const slot = disponibles.shift();
    if (!slot) {
      sinAsignar.push(...pedidosDestino);
      continue;
    }
    const ordenados = withStopNumbers(optimizarParadas(pedidosDestino));
    viajes.push({
      destino,
      slot,
      pedidos: ordenados,
      pesoTotal: sumarOpcional(ordenados, 'total_weight'),
      volumenTotal: sumarOpcional(ordenados, 'total_volume'),
    });
  }

  return { viajes, sinAsignar };
}

// Flag encendido (futuro, cuando haya peso/volumen reales): reparte cada
// destino entre la flota por capacidad. Conservado para reactivar sin reescribir.
// Cada slot se usa UNA sola vez: los vehículos que un destino consumió salen de
// la lista disponible para los destinos siguientes (un camión no puede estar en
// dos viajes el mismo día). Señalado por Claude en CANAL.md.
export function planPorCapacidad(pedidos: Pedido[], slots: FlotaSlot[]): ResultadoPlan {
  const grupos = agruparPorDestino(pedidos);
  const viajes: ViajePropuesto[] = [];
  const sinAsignar: Pedido[] = [];
  let disponibles = [...slots];

  for (const [destino, pedidosDestino] of grupos) {
    if (disponibles.length === 0) {
      sinAsignar.push(...pedidosDestino);
      continue;
    }
    const { asignaciones, sinAsignar: resto } = repartirEntreFlota(pedidosDestino, disponibles);
    const usados = new Set<FlotaSlot>();
    for (const asig of asignaciones) {
      usados.add(asig.slot);
      viajes.push({
        destino,
        slot: asig.slot,
        pedidos: asig.pedidos,
        pesoTotal: sumarOpcional(asig.pedidos, 'total_weight'),
        volumenTotal: sumarOpcional(asig.pedidos, 'total_volume'),
      });
    }
    disponibles = disponibles.filter((s) => !usados.has(s));
    sinAsignar.push(...resto);
  }

  return { viajes, sinAsignar };
}
