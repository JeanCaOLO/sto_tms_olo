import { describe, it, expect } from 'vitest';
import { sugerirVehiculos } from './fleet-suggest';
import type { Pedido, Vehiculo } from './types';

const veh = (id: string, w: number, v: number): Vehiculo => ({
  id, plate: id, brand: '', model: '', vehicle_type: '', capacity_weight: w, capacity_volume: v, carrier_id: '',
});
const ped = (w: number, v: number): Pedido => ({
  id: `p${w}-${v}`, order_number: 'x', customer_id: 'c', store_id: 's',
  delivery_address: '', delivery_city: '', delivery_zone: '', total_weight: w, total_volume: v,
  status: 'pending', order_date: '2026-01-01',
});

describe('sugerirVehiculos', () => {
  const flota = [veh('a', 8000, 32), veh('b', 4500, 20), veh('c', 2500, 12)];

  it('elige el menor número de vehículos (mayor capacidad primero) que cubre el pool', () => {
    const r = sugerirVehiculos([ped(6000, 20)], flota);
    expect(r.vehiculos.map((v) => v.id)).toEqual(['a']); // 8000 kg cubre 6000
    expect(r.cubre).toBe(true);
  });

  it('agrega vehículos hasta cubrir peso y volumen', () => {
    const r = sugerirVehiculos([ped(10000, 40)], flota);
    expect(r.vehiculos.map((v) => v.id)).toEqual(['a', 'b']); // 12500 kg / 52 m³
    expect(r.cubre).toBe(true);
  });

  it('marca cubre=false y devuelve toda la flota útil si no alcanza', () => {
    const r = sugerirVehiculos([ped(20000, 5)], flota);
    expect(r.vehiculos).toHaveLength(3);
    expect(r.cubre).toBe(false);
  });

  it('ignora vehículos con capacidad 0', () => {
    const r = sugerirVehiculos([ped(1000, 5)], [veh('z', 0, 0), veh('a', 4500, 20)]);
    expect(r.vehiculos.map((v) => v.id)).toEqual(['a']);
  });
});
