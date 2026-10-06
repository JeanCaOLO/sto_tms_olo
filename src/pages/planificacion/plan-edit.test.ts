import { describe, expect, it } from 'vitest';
import { moverPedido } from './plan-edit';
import type { RoutePlan } from './planes-types';

function planDePrueba(): RoutePlan {
  const stop = (order_id: string) => ({
    id: `s-${order_id}`,
    order_id,
    stop_order: 1,
    order_number: order_id,
    customer_name: null,
    delivery_city: null,
    delivery_zone: null,
    total_weight: null,
    total_volume: null,
  });
  const trip = (id: string, ids: string[]) => ({
    id,
    vehicle_id: `v-${id}`,
    driver_id: null,
    delivery_zone: id,
    sequence_order: 1,
    total_weight: null,
    total_volume: null,
    vehicle_plate: 'AAA',
    vehicle_label: 'x',
    vehicle_capacity_weight: 100,
    vehicle_capacity_volume: 10,
    is_flota_propia: false,
    stops: ids.map(stop),
  });
  return {
    id: 'p1',
    country_id: null,
    warehouse_id: null,
    plan_date: '2026-01-01',
    status: 'draft',
    notes: null,
    created_at: '',
    updated_at: '',
    trips: [trip('t1', ['o1', 'o2']), trip('t2', ['o3'])],
    unassigned_order_numbers: [],
  };
}

describe('moverPedido', () => {
  it('saca el pedido del viaje origen y lo agrega al destino', () => {
    const { trips } = moverPedido(planDePrueba(), 'o2', 't1', 't2');
    expect(trips.find((t) => t.id === 't1')?.order_ids).toEqual(['o1']);
    expect(trips.find((t) => t.id === 't2')?.order_ids).toEqual(['o3', 'o2']);
  });

  it('no duplica si el pedido ya estaba en el destino', () => {
    const { trips } = moverPedido(planDePrueba(), 'o3', 't1', 't2');
    // o3 no está en t1, así que t1 no cambia y t2 no lo duplica
    expect(trips.find((t) => t.id === 't2')?.order_ids).toEqual(['o3']);
  });
});
