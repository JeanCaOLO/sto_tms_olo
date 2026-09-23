import { describe, expect, it } from 'vitest';
import { repartirEntreFlota, type FlotaSlot } from './fleet-split';
import type { Pedido, Vehiculo } from './types';

let seq = 0;
function pedido(over: Partial<Pedido> = {}): Pedido {
  seq += 1;
  return {
    id: `p${seq}`,
    order_number: `ORD-${seq}`,
    customer_id: 'c',
    store_id: 's',
    delivery_address: 'x',
    delivery_city: 'San José',
    delivery_zone: 'GAM',
    total_weight: 100,
    total_volume: 1,
    status: 'pending',
    order_date: '2026-01-01', delivery_date: '2026-01-02',
    ...over,
  };
}

function vehiculo(over: Partial<Vehiculo>): Vehiculo {
  return { id: 'v', plate: 'AAA', brand: 'b', model: 'm', vehicle_type: 'camion', capacity_weight: 1000, capacity_volume: 10, ...over };
}

describe('repartirEntreFlota - prioridad a flota propia', () => {
  it('llena primero el vehículo de flota propia aunque tenga menor capacidad que uno de tercero', () => {
    const propio: FlotaSlot = { vehiculo: vehiculo({ id: 'propio', capacity_weight: 200, is_flota_propia: true }), conductorId: 'd1' };
    const tercero: FlotaSlot = { vehiculo: vehiculo({ id: 'tercero', capacity_weight: 5000, is_flota_propia: false }), conductorId: 'd2' };

    // Un solo pedido pequeño: si el propio se ordena primero, se lo queda él.
    const pedidos = [pedido({ total_weight: 50, total_volume: 0.5 })];
    const { asignaciones } = repartirEntreFlota(pedidos, [tercero, propio]);

    expect(asignaciones).toHaveLength(1);
    expect(asignaciones[0].slot.vehiculo.id).toBe('propio');
  });

  it('dentro de cada grupo (propio/tercero) sigue ordenando por capacidad descendente', () => {
    const propioChico: FlotaSlot = { vehiculo: vehiculo({ id: 'propio-chico', capacity_weight: 100, is_flota_propia: true }), conductorId: 'd1' };
    const propioGrande: FlotaSlot = { vehiculo: vehiculo({ id: 'propio-grande', capacity_weight: 900, is_flota_propia: true }), conductorId: 'd2' };

    const pedidos = [pedido({ total_weight: 50, total_volume: 0.5 })];
    const { asignaciones } = repartirEntreFlota(pedidos, [propioChico, propioGrande]);

    expect(asignaciones[0].slot.vehiculo.id).toBe('propio-grande');
  });

  it('vehículos sin is_flota_propia (undefined) se tratan como tercero, no rompen el orden', () => {
    const sinDato: FlotaSlot = { vehiculo: vehiculo({ id: 'sin-dato', capacity_weight: 5000 }), conductorId: 'd1' };
    const propio: FlotaSlot = { vehiculo: vehiculo({ id: 'propio', capacity_weight: 200, is_flota_propia: true }), conductorId: 'd2' };

    const pedidos = [pedido({ total_weight: 50, total_volume: 0.5 })];
    const { asignaciones } = repartirEntreFlota(pedidos, [sinDato, propio]);

    expect(asignaciones[0].slot.vehiculo.id).toBe('propio');
  });
});
