import { describe, it, expect } from 'vitest';
import { agruparPorDestino, planificarDia, planPorCapacidad, USAR_CAPACIDAD } from './plan-automatico';
import type { FlotaSlot } from './fleet-split';
import type { Pedido, Vehiculo } from './types';

function pedido(id: string, zone: string, peso: number | null = null, over: Partial<Pedido> = {}): Pedido {
  return {
    id, order_number: id, customer_id: 'c', store_id: 's',
    delivery_address: 'x', delivery_city: 'City', delivery_zone: zone,
    total_weight: peso as number, total_volume: null as unknown as number, status: 'alistado',
    order_date: '2026-01-01', delivery_date: '2026-01-02',
    delivery_latitude: 9.9, delivery_longitude: -84.0, ...over,
  };
}

function slot(id: string, capKg: number, propia = false): FlotaSlot {
  const v: Vehiculo = {
    id, plate: id, brand: 'b', model: 'm', vehicle_type: 't',
    capacity_weight: capKg, capacity_volume: 100, is_flota_propia: propia,
  };
  return { vehiculo: v, conductorId: `cond-${id}` };
}

describe('agruparPorDestino', () => {
  it('agrupa los pedidos por delivery_zone', () => {
    const grupos = agruparPorDestino([
      pedido('a', 'Norte'), pedido('b', 'Sur'), pedido('c', 'Norte'),
    ]);
    expect(grupos.get('Norte')).toHaveLength(2);
    expect(grupos.get('Sur')).toHaveLength(1);
  });

  it('usa (sin destino) cuando falta delivery_zone', () => {
    expect(agruparPorDestino([pedido('a', '')]).get('(sin destino)')).toHaveLength(1);
  });
});

// El módulo corre hoy con capacidad DESACTIVADA (USAR_CAPACIDAD=false): un
// vehículo por destino, sin mirar peso/volumen. Ver plan-automatico.ts.
describe('planificarDia (sin capacidad)', () => {
  it('el flag de capacidad está apagado', () => {
    expect(USAR_CAPACIDAD).toBe(false);
  });

  it('arma un viaje por destino con un vehículo cada uno', () => {
    const pedidos = [pedido('a', 'Norte'), pedido('b', 'Norte'), pedido('c', 'Sur')];
    const { viajes, sinAsignar } = planificarDia(pedidos, [slot('v1', 1000), slot('v2', 1000)]);
    expect(viajes.map((v) => v.destino).sort()).toEqual(['Norte', 'Sur']);
    // Norte no se parte por capacidad: sus 2 pedidos van en el mismo viaje.
    expect(viajes.find((v) => v.destino === 'Norte')!.pedidos).toHaveLength(2);
    expect(sinAsignar).toHaveLength(0);
  });

  it('no parte un grupo aunque el peso excediera capacidad (capacidad ignorada)', () => {
    // Dos pedidos "pesados" en el mismo destino, vehículo chico: igual van juntos.
    const pedidos = [pedido('a', 'Norte', 80), pedido('b', 'Norte', 80)];
    const { viajes, sinAsignar } = planificarDia(pedidos, [slot('v1', 100)]);
    expect(viajes).toHaveLength(1);
    expect(viajes[0].pedidos).toHaveLength(2);
    expect(sinAsignar).toHaveLength(0);
  });

  it('asigna flota propia primero', () => {
    const pedidos = [pedido('a', 'Norte')];
    const { viajes } = planificarDia(pedidos, [slot('tercero', 1000, false), slot('propio', 500, true)]);
    expect(viajes[0].slot.vehiculo.id).toBe('propio');
  });

  it('deja sin asignar los destinos sin vehículo libre', () => {
    const pedidos = [pedido('a', 'Norte'), pedido('b', 'Sur')];
    const { viajes, sinAsignar } = planificarDia(pedidos, [slot('v1', 1000)]);
    expect(viajes).toHaveLength(1);
    expect(sinAsignar).toHaveLength(1);
  });

  it('peso/volumen desconocido (null) da total null, no 0', () => {
    const { viajes } = planificarDia([pedido('a', 'Norte')], [slot('v1', 1000)]);
    expect(viajes[0].pesoTotal).toBeNull();
    expect(viajes[0].volumenTotal).toBeNull();
  });

  it('suma el peso solo de los pedidos que sí lo traen', () => {
    const { viajes } = planificarDia(
      [pedido('a', 'Norte', 100), pedido('b', 'Norte', 50)],
      [slot('v1', 1000)],
    );
    expect(viajes[0].pesoTotal).toBe(150);
  });
});

// Rama de capacidad (hoy detrás del flag): un slot no puede reaparecer en
// viajes de dos destinos distintos el mismo día. Invariante señalado por Claude.
describe('planPorCapacidad — cada slot se usa una sola vez', () => {
  it('no repite un vehículo entre destinos', () => {
    const pedidos = [pedido('a', 'Norte', 100), pedido('b', 'Sur', 100)];
    const { viajes } = planPorCapacidad(pedidos, [slot('v1', 1000), slot('v2', 1000)]);
    const ids = viajes.map((v) => v.slot.vehiculo.id);
    expect(new Set(ids).size).toBe(ids.length); // sin duplicados
  });

  it('deja sin asignar el destino que se quedó sin vehículo libre', () => {
    const pedidos = [pedido('a', 'Norte', 100), pedido('b', 'Sur', 100)];
    const { viajes, sinAsignar } = planPorCapacidad(pedidos, [slot('v1', 1000)]);
    expect(viajes).toHaveLength(1);
    expect(sinAsignar).toHaveLength(1);
  });
});
