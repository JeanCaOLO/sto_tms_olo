import { describe, it, expect } from 'vitest';
import { optimizarConCapacidad, entregasADescargarPara } from './capacity-fit';
import type { PedidoSeleccionado, Vehiculo } from './types';

// Coordenadas del GAM para que optimizarParadas use la rama con coordenadas.
let seq = 0;
function parada(over: Partial<PedidoSeleccionado>): PedidoSeleccionado {
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
    order_date: '2026-01-01',
    delivery_latitude: 9.93 + seq * 0.01,
    delivery_longitude: -84.08 - seq * 0.01,
    stop_number: seq,
    ...over,
  };
}

const vehiculo: Vehiculo = {
  id: 'v1', plate: 'AAA', brand: 'b', model: 'm', vehicle_type: 'camion',
  capacity_weight: 1000, capacity_volume: 10,
};

describe('optimizarConCapacidad', () => {
  it('devuelve el array `excluidos` (no un conteo) con las paradas que no caben', () => {
    // margen peso 85% => 850 kg útiles. 10 paradas x 100 kg = 1000 => 2 sobran.
    const paradas = Array.from({ length: 10 }, () => parada({}));
    const { orden, excluidos } = optimizarConCapacidad(paradas, vehiculo);
    expect(Array.isArray(excluidos)).toBe(true);
    expect(excluidos.length).toBe(2);
    expect(orden.length).toBe(8);
    expect(excluidos[0]).toHaveProperty('order_number');
  });

  it('BR1.2: una devolución conocida cuenta en la capacidad igual que una entrega', () => {
    const entregas = Array.from({ length: 8 }, () => parada({ total_weight: 100 }));
    const devolucion = parada({ total_weight: 100, tipo: 'devolucion' });
    // 9 x 100 = 900 > 850 => exactamente una queda excluida, sin importar el tipo.
    const { excluidos } = optimizarConCapacidad([...entregas, devolucion], vehiculo);
    expect(excluidos.length).toBe(1);
  });

  it('BR1.2: una devolución puede quedar excluida por capacidad', () => {
    const entregas = Array.from({ length: 8 }, () => parada({ total_weight: 105 })); // 840
    const devolucion = parada({ total_weight: 100, tipo: 'devolucion' }); // 940 > 850
    const { orden, excluidos } = optimizarConCapacidad([...entregas, devolucion], vehiculo);
    expect(excluidos.some((p) => p.tipo === 'devolucion')).toBe(true);
    expect(orden.some((p) => p.tipo === 'devolucion')).toBe(false);
  });

  it('BR1.2: una devolución grande fuerza la exclusión de otra parada', () => {
    const chicas = Array.from({ length: 8 }, () => parada({ total_weight: 100 })); // 800
    const devolucionGrande = parada({ total_weight: 400, tipo: 'devolucion' });
    // La devolución se ordena primero (mayor carga relativa) y entra; luego
    // 800 + 400 = 1200 => se excluyen paradas de entrega hasta bajar de 850.
    const { orden, excluidos } = optimizarConCapacidad([...chicas, devolucionGrande], vehiculo);
    expect(orden.some((p) => p.tipo === 'devolucion')).toBe(true);
    expect(excluidos.length).toBeGreaterThan(0);
    expect(excluidos.every((p) => p.tipo !== 'devolucion')).toBe(true);
  });

  it('sin vehículo no excluye nada', () => {
    const paradas = Array.from({ length: 5 }, () => parada({}));
    const { orden, excluidos } = optimizarConCapacidad(paradas);
    expect(excluidos).toEqual([]);
    expect(orden.length).toBe(5);
  });

  it('entregasADescargarPara: una devolución en vivo fuerza descargar entregas y solo lista entregas', () => {
    const entregas = Array.from({ length: 8 }, () => parada({ total_weight: 100 })); // 800
    const live = parada({ total_weight: 300, is_live: true, tipo: 'devolucion' }); // 800+300=1100 > 850
    const descargar = entregasADescargarPara([...entregas, live], vehiculo);
    expect(descargar.length).toBeGreaterThan(0);
    expect(descargar.every((p) => p.tipo !== 'devolucion' && !p.is_live)).toBe(true);
  });

  it('entregasADescargarPara: si la carga entrante cabe, no descarga nada', () => {
    const entregas = Array.from({ length: 5 }, () => parada({ total_weight: 100 })); // 500
    const live = parada({ total_weight: 100, is_live: true, tipo: 'devolucion' }); // 600 < 850
    expect(entregasADescargarPara([...entregas, live], vehiculo)).toEqual([]);
  });

  it('respeta un ancla: la devolución anclada nunca se excluye aunque no quepa el resto', () => {
    const grandes = Array.from({ length: 10 }, () => parada({ total_weight: 200 }));
    const devAnclada = parada({ total_weight: 100, tipo: 'devolucion' });
    const anclados = new Set([devAnclada.id]);
    const { orden, excluidos } = optimizarConCapacidad([...grandes, devAnclada], vehiculo, anclados);
    expect(orden.some((p) => p.id === devAnclada.id)).toBe(true);
    expect(excluidos.some((p) => p.id === devAnclada.id)).toBe(false);
  });
});
