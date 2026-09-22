// Disparador automático de viajes (Fase Planificación automática, ver el
// artefacto "Avance OMS/TMS" y la regla confirmada por Andrey 2026-09-22:
// esto NO es una pantalla donde alguien arma el viaje a mano - es un motor
// que agrupa pedidos alistados y decide SOLO cuándo y con qué camión salir.
// La única intervención humana que le queda a esto es anular un viaje ya
// propuesto/creado - nunca construirlo.
//
// Módulo puro (sin React, sin fetch) - ver Testing Posture en
// aidlc/spaces/default/memory/project.md.
//
// GAP HEREDADO de pedidos-alistados-api.ts: sin peso/volumen real por línea
// todavía, este disparador NO decide cuánto camión ocupa un pedido (eso es
// capacity-fit.ts, para cuando haya datos de línea reales) - solo decide QUÉ
// pedidos van juntos (por ruta) y CUÁNDO ya es momento de salir.

import { asignarFlota, type FlotaSlot } from './fleet-split';
import type { PedidoAlistado } from './pedidos-alistados-api';

export type MotivoDisparo = 'urgencia' | 'umbral';

export interface PropuestaViaje {
  ruta: string;
  pedidos: PedidoAlistado[];
  motivoDisparo: MotivoDisparo;
  slotAsignado: FlotaSlot | null; // null = disparó pero no hay flota disponible ahora
}

export interface GrupoEnEspera {
  ruta: string;
  pedidos: PedidoAlistado[];
}

export interface ResultadoDisparador {
  propuestas: PropuestaViaje[];
  gruposEnEspera: GrupoEnEspera[];
}

// Umbral de acumulación por defecto: con cuántos pedidos alistados de la MISMA
// ruta ya vale la pena sacar un camión, si ninguno es urgente todavía. Vive
// acá como constante (no en la UI del Motor de Reglas todavía) - candidato a
// moverse al catálogo semi-configurable cuando ese catálogo escriba de vuelta.
export const UMBRAL_ACUMULACION_DEFAULT = 3;

// Prioridad numérica <= este valor = tier 1 (vencido/hoy/ventana T-1) según
// priorityEngine.ts - a esa urgencia no se puede esperar a acumular más carga.
const PRIORIDAD_URGENTE = 3;

export function agruparPorRuta(pedidos: PedidoAlistado[]): Map<string, PedidoAlistado[]> {
  const grupos = new Map<string, PedidoAlistado[]>();
  for (const pedido of pedidos) {
    const clave = pedido.delivery_zone || '(sin ruta)';
    const lista = grupos.get(clave);
    if (lista) lista.push(pedido);
    else grupos.set(clave, [pedido]);
  }
  return grupos;
}

export function esGrupoUrgente(pedidos: PedidoAlistado[]): boolean {
  return pedidos.some((p) => p.esClienteRetira || p.prioridad <= PRIORIDAD_URGENTE);
}

export function debeDispararViaje(
  pedidos: PedidoAlistado[],
  umbralAcumulacion: number = UMBRAL_ACUMULACION_DEFAULT,
): { disparar: boolean; motivo: MotivoDisparo | null } {
  if (pedidos.length === 0) return { disparar: false, motivo: null };
  if (esGrupoUrgente(pedidos)) return { disparar: true, motivo: 'urgencia' };
  if (pedidos.length >= umbralAcumulacion) return { disparar: true, motivo: 'umbral' };
  return { disparar: false, motivo: null };
}

// Agrupa por ruta, decide qué grupos ya deben salir, y les asigna flota -
// dando prioridad de asignación a los grupos que dispararon por URGENCIA
// (y, entre ellos, al que tenga el pedido más urgente) antes que a los que
// solo dispararon por umbral de acumulación, para que un camión de flota
// propia nunca se lo gane un viaje menos urgente por simple orden de llegada.
export function generarPropuestasDeViaje(
  pedidosAlistados: PedidoAlistado[],
  slotsDisponibles: FlotaSlot[],
  umbralAcumulacion: number = UMBRAL_ACUMULACION_DEFAULT,
): ResultadoDisparador {
  const grupos = agruparPorRuta(pedidosAlistados);

  const candidatos: { ruta: string; pedidos: PedidoAlistado[]; motivo: MotivoDisparo }[] = [];
  const gruposEnEspera: GrupoEnEspera[] = [];

  for (const [ruta, pedidos] of grupos) {
    const { disparar, motivo } = debeDispararViaje(pedidos, umbralAcumulacion);
    if (disparar && motivo) candidatos.push({ ruta, pedidos, motivo });
    else gruposEnEspera.push({ ruta, pedidos });
  }

  candidatos.sort((a, b) => {
    if (a.motivo !== b.motivo) return a.motivo === 'urgencia' ? -1 : 1;
    const minA = Math.min(...a.pedidos.map((p) => p.prioridad));
    const minB = Math.min(...b.pedidos.map((p) => p.prioridad));
    return minA - minB;
  });

  let slotsRestantes = [...slotsDisponibles];
  const propuestas: PropuestaViaje[] = candidatos.map(({ ruta, pedidos, motivo }) => {
    const slot = asignarFlota(slotsRestantes);
    if (slot) slotsRestantes = slotsRestantes.filter((s) => s !== slot);
    return { ruta, pedidos, motivoDisparo: motivo, slotAsignado: slot };
  });

  return { propuestas, gruposEnEspera };
}
