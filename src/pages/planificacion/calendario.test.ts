import { describe, expect, it } from 'vitest';
import { diasMes, diasSemana, isoDe, numeroDeViaje, viajesDeCelda, zonasPresentes } from './calendario';
import type { PlanTrip, RoutePlan } from './planes-types';

function trip(id: string, zona: string, seq: number): PlanTrip {
  return {
    id, status: 'pending', vehicle_id: 'v', driver_id: null, delivery_zone: zona,
    sequence_order: seq, total_weight: null, total_volume: null, vehicle_plate: 'P',
    vehicle_label: 'L', vehicle_capacity_weight: 1, vehicle_capacity_volume: 1,
    is_flota_propia: true, stops: [],
  };
}
function plan(fecha: string, trips: PlanTrip[]): RoutePlan {
  return {
    id: `plan-${fecha}`, country_id: null, warehouse_id: null, plan_date: fecha,
    status: 'confirmed', notes: null, created_at: '', updated_at: '', trips,
    unassigned_order_numbers: [],
  };
}

// Pizarrón del cliente: Z1/lunes = V1; Z2/martes = V2, V3.
const PLANES = [
  plan('2026-10-12', [trip('a', 'Z1', 1)]),
  plan('2026-10-13', [trip('b', 'Z2', 1), trip('c', 'Z2', 2)]),
];
const SEMANA = diasSemana(new Date('2026-10-13T12:00:00')).map(isoDe);

describe('calendario', () => {
  it('la semana arranca en lunes y trae 6 días (L..S)', () => {
    expect(SEMANA[0]).toBe('2026-10-12'); // lunes
    expect(SEMANA).toHaveLength(6);
  });

  it('el mes cubre semanas completas (múltiplo de 7)', () => {
    expect(diasMes(new Date('2026-10-13T12:00:00')).length % 7).toBe(0);
  });

  it('viajesDeCelda filtra por fecha + zona', () => {
    expect(viajesDeCelda(PLANES, '2026-10-13', 'Z2').map((t) => t.id)).toEqual(['b', 'c']);
    expect(viajesDeCelda(PLANES, '2026-10-13', 'Z1')).toEqual([]);
  });

  it('zonasPresentes devuelve las filas ordenadas', () => {
    expect(zonasPresentes(PLANES, SEMANA)).toEqual(['Z1', 'Z2']);
  });

  it('numeroDeViaje numera global (fecha, zona, secuencia): V1 en Z1/lun, V2/V3 en Z2/mar', () => {
    const n = numeroDeViaje(PLANES, SEMANA);
    expect(n.get('a')).toBe(1);
    expect(n.get('b')).toBe(2);
    expect(n.get('c')).toBe(3);
  });
});
