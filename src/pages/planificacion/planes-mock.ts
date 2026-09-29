// Fallback mock de los planes persistidos, para ver la UI sin backend (§6.7).
// Mantiene un store en memoria por el ciclo de vida de la pestaña y reusa el
// motor cliente (planificarDia) para armar el draft, igual que hará el backend.
// ponytail: store en memoria (Map) — se pierde al recargar; es el mismo
// contrato que ya usa fallback-pedidos.ts. Upgrade path: los endpoints reales
// de /planes lo reemplazan sin tocar la UI.

import { planificarDia } from './plan-automatico';
import { construirSlots } from './fleet-slots';
import type { FlotaSlot } from './fleet-split';
import type { Conductor, Pedido, Vehiculo } from './types';
import {
  TRANSICIONES,
  type PlanEditPayload,
  type PlanStatus,
  type PlanStop,
  type PlanTrip,
  type RoutePlan,
} from './planes-types';

const store = new Map<string, RoutePlan>();
let seq = 0;
const nuevoId = (p: string) => `mock-${p}-${Date.now()}-${seq++}`;

interface Contexto {
  pedidos: Pedido[];
  vehiculos: Vehiculo[];
  conductores: Conductor[];
  countryId: string | null;
  warehouseId: string | null;
}

function stopDe(pedido: Pedido, stopOrder: number): PlanStop {
  return {
    id: nuevoId('stop'),
    order_id: pedido.id,
    stop_order: stopOrder,
    order_number: pedido.order_number,
    customer_name: pedido.customer_name ?? null,
    delivery_city: pedido.delivery_city ?? null,
    delivery_zone: pedido.delivery_zone ?? null,
    delivery_latitude: pedido.delivery_latitude ?? null,
    delivery_longitude: pedido.delivery_longitude ?? null,
    total_weight: pedido.total_weight ?? null,
    total_volume: pedido.total_volume ?? null,
  };
}

function sumar(stops: PlanStop[], campo: 'total_weight' | 'total_volume'): number | null {
  const conDato = stops.filter((s) => s[campo] != null);
  return conDato.length ? conDato.reduce((acc, s) => acc + (s[campo] as number), 0) : null;
}

function recalcularTotales(trip: PlanTrip): PlanTrip {
  const stops = trip.stops.map((s, i) => ({ ...s, stop_order: i + 1 }));
  return { ...trip, stops, total_weight: sumar(stops, 'total_weight'), total_volume: sumar(stops, 'total_volume') };
}

// Arma un draft corriendo el motor cliente sobre los pedidos del día.
export function construirDraft(fecha: string, ctx: Contexto): RoutePlan {
  const slots: FlotaSlot[] = construirSlots(ctx.vehiculos, ctx.conductores);
  const { viajes, sinAsignar } = planificarDia(ctx.pedidos, slots);
  const ahora = new Date().toISOString();

  const trips: PlanTrip[] = viajes.map((v, i) => {
    const veh = v.slot.vehiculo;
    const stops = v.pedidos.map((p, j) => stopDe(p, j + 1));
    return recalcularTotales({
      id: nuevoId('trip'),
      vehicle_id: veh.id,
      driver_id: v.slot.conductorId || null,
      delivery_zone: v.destino,
      sequence_order: i + 1,
      total_weight: null,
      total_volume: null,
      vehicle_plate: veh.plate,
      vehicle_label: `${veh.brand} ${veh.model}`.trim(),
      vehicle_capacity_weight: veh.capacity_weight,
      vehicle_capacity_volume: veh.capacity_volume,
      is_flota_propia: Boolean(veh.is_flota_propia),
      stops,
    });
  });

  const plan: RoutePlan = {
    id: nuevoId('plan'),
    country_id: ctx.countryId,
    warehouse_id: ctx.warehouseId,
    plan_date: fecha,
    status: 'draft',
    notes: null,
    created_at: ahora,
    updated_at: ahora,
    trips,
    unassigned_order_numbers: sinAsignar.map((p) => p.order_number),
  };
  store.set(plan.id, plan);
  return plan;
}

export function listarMock(status?: PlanStatus, fecha?: string): RoutePlan[] {
  return [...store.values()]
    .filter((p) => (!status || p.status === status) && (!fecha || p.plan_date === fecha))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function obtenerMock(id: string): RoutePlan | undefined {
  return store.get(id);
}

// Reordena las paradas entre viajes según el payload (mover pedido de un viaje
// a otro / cambiar la secuencia). Reusa los stops existentes por order_id.
export function editarMock(id: string, payload: PlanEditPayload): RoutePlan | undefined {
  const plan = store.get(id);
  if (!plan || plan.status !== 'draft') return undefined;
  const porOrderId = new Map<string, PlanStop>();
  for (const trip of plan.trips) for (const s of trip.stops) porOrderId.set(s.order_id, s);

  const trips = plan.trips.map((trip) => {
    const nuevo = payload.trips.find((t) => t.id === trip.id);
    if (!nuevo) return trip;
    const stops = nuevo.order_ids
      .map((oid) => porOrderId.get(oid))
      .filter((s): s is PlanStop => Boolean(s));
    return recalcularTotales({ ...trip, stops });
  });

  const actualizado = { ...plan, trips, updated_at: new Date().toISOString() };
  store.set(id, actualizado);
  return actualizado;
}

export function transicionarMock(id: string, destino: PlanStatus): RoutePlan | undefined {
  const plan = store.get(id);
  if (!plan || !TRANSICIONES[plan.status].includes(destino)) return undefined;
  const actualizado = { ...plan, status: destino, updated_at: new Date().toISOString() };
  store.set(id, actualizado);
  return actualizado;
}
