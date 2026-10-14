// Datos DEMO para ver el calendario poblado mientras el backend del nuevo flujo
// aún no existe. Solo se usan como fallback cuando listarPlanes() no devuelve
// nada (ver CalendarioPlanificacion). Fechas relativas al lunes de ESTA semana,
// para que caigan en la vista actual. Coords reales del GAM (Costa Rica) para
// que el mapa de cada viaje se dibuje.
// ponytail: dataset a mano, se borra entero cuando el endpoint real de /planes
// entregue viajes con fecha+zona. No tocar la UI para quitarlo.

import { addDays, format, startOfWeek } from 'date-fns';
import type { PlanStop, PlanTrip, RoutePlan } from './planes-types';

let n = 0;
const uid = (p: string) => `demo-${p}-${n++}`;

function stop(
  orden: number, cliente: string, ciudad: string, zona: string,
  lat: number, lng: number, peso: number,
): PlanStop {
  return {
    id: uid('stop'), order_id: uid('ord'), stop_order: orden,
    order_number: `PD-${1000 + n}`, customer_name: cliente,
    delivery_address: `${ciudad}, Costa Rica`, delivery_city: ciudad, delivery_zone: zona,
    delivery_latitude: lat, delivery_longitude: lng,
    total_weight: peso, total_volume: +(peso / 90).toFixed(2),
  };
}

function viaje(zona: string, seq: number, placa: string, label: string, stops: PlanStop[], flotaPropia = true): PlanTrip {
  return {
    id: uid('trip'), status: 'pending', vehicle_id: uid('veh'), driver_id: uid('con'),
    delivery_zone: zona, sequence_order: seq,
    total_weight: stops.reduce((a, s) => a + (s.total_weight ?? 0), 0),
    total_volume: +stops.reduce((a, s) => a + (s.total_volume ?? 0), 0).toFixed(2),
    vehicle_plate: placa, vehicle_label: label,
    vehicle_capacity_weight: 3500, vehicle_capacity_volume: 22, is_flota_propia: flotaPropia, stops,
  };
}

function plan(fecha: string, trips: PlanTrip[]): RoutePlan {
  const ahora = new Date().toISOString();
  return {
    id: uid('plan'), country_id: null, warehouse_id: null, plan_date: fecha, status: 'confirmed',
    notes: null, created_at: ahora, updated_at: ahora, trips, unassigned_order_numbers: [],
  };
}

export function planesDemo(): RoutePlan[] {
  n = 0;
  const lunes = startOfWeek(new Date(), { weekStartsOn: 1 });
  const d = (i: number) => format(addDays(lunes, i), 'yyyy-MM-dd');
  return [
    plan(d(0), [ // lunes → Z1 = V1
      viaje('Z1', 1, 'CL-1234', 'Hino 300', [
        stop(1, 'Automercado Escazú', 'Escazú', 'Z1', 9.9189, -84.1419, 420),
        stop(2, 'EPA Escazú', 'Escazú', 'Z1', 9.9276, -84.1385, 610),
        stop(3, 'Pequeño Mundo Santa Ana', 'Santa Ana', 'Z1', 9.9324, -84.1836, 300),
      ]),
    ]),
    plan(d(1), [ // martes → Z2 = V2, V3
      viaje('Z2', 1, 'CL-5678', 'Isuzu NPR', [
        stop(1, 'Walmart Heredia', 'Heredia', 'Z2', 9.9985, -84.1169, 520),
        stop(2, 'Maxi Palí Heredia', 'Heredia', 'Z2', 10.0023, -84.114, 480),
      ]),
      viaje('Z2', 2, 'CL-9012', 'Hino 500', [
        stop(1, 'Cofersa San Joaquín', 'San Joaquín', 'Z2', 9.9931, -84.1569, 700),
        stop(2, 'Depósito Santa Bárbara', 'Santa Bárbara', 'Z2', 10.0281, -84.1575, 350),
      ], false),
    ]),
    plan(d(2), [ // miércoles → Z3 = V4
      viaje('Z3', 1, 'CL-3344', 'Hino 300', [
        stop(1, 'EPA Curridabat', 'Curridabat', 'Z3', 9.9178, -84.0333, 560),
        stop(2, 'Automercado Tres Ríos', 'Tres Ríos', 'Z3', 9.9061, -83.9872, 410),
        stop(3, 'Ferretería Cartago', 'Cartago', 'Z3', 9.8644, -83.9194, 480),
      ]),
    ]),
    plan(d(3), [ // jueves → Z1 = V5
      viaje('Z1', 1, 'CL-1234', 'Hino 300', [
        stop(1, 'Multiplaza Escazú', 'Escazú', 'Z1', 9.9357, -84.1398, 390),
        stop(2, 'City Mall Alajuela', 'Alajuela', 'Z1', 10.013, -84.208, 450),
      ]),
    ]),
  ];
}
