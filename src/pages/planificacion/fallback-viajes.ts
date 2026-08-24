import { FALLBACK_RUTAS } from './fallback-rutas';
import { MOCK_STOPS } from './fallback-pedidos';
import type { Pedido, Viaje } from './types';

const nombreRuta = (rutaId: string) => FALLBACK_RUTAS.find((r) => r.id === rutaId)?.name || '';

function pedidoDeStop(stopIndex: number, viajeId: string, ordenEnViaje: number): Pedido {
  const stop = MOCK_STOPS[stopIndex];
  return {
    id: `mock-pedido-${viajeId}-${ordenEnViaje}`,
    order_number: `ORD-MOCK-${String(stopIndex + 1).padStart(3, '0')}`,
    customer_id: `mock-customer-${stopIndex}`,
    store_id: 'mock-store-1',
    status: 'pending',
    order_date: new Date().toISOString(),
    ...stop,
  };
}

const pedidosDe = (indices: number[], viajeId: string): Pedido[] =>
  indices.map((stopIndex, i) => pedidoDeStop(stopIndex, viajeId, i));

const HOY = new Date().toISOString().split('T')[0];

// ponytail: 4 viajes sintéticos agrupando los 20 stops mock por afinidad
// geográfica, reflejando el concepto real de "viaje" del WMS (Reunión
// 2026-08-18): n pedidos + n destinos, con la ruta ya asignada. El viaje 2
// lleva un pedido de excepción (dirección distinta a la registrada, sin
// coordenadas) para ejercitar ese caso de punta a punta.
export function getFallbackViajes(): Viaje[] {
  const rutaNorte = FALLBACK_RUTAS[0].id;
  const rutaSur = FALLBACK_RUTAS[1].id;
  const rutaCentro = FALLBACK_RUTAS[2].id;
  const rutaOriente = FALLBACK_RUTAS[3].id;

  const pedidosViaje2 = pedidosDe([4, 5, 6, 12, 13], 'VJ-MOCK-002');
  const excepcion = pedidosViaje2.find((p) => p.order_number === 'ORD-MOCK-007');
  if (excepcion) {
    excepcion.delivery_latitude = undefined;
    excepcion.delivery_longitude = undefined;
    excepcion.is_exception = true;
    excepcion.exception_address_raw = 'Entregar en sucursal de Tres Ríos, contactar al 8888-8888 (no es la dirección registrada del cliente)';
  }

  return [
    {
      id: 'VJ-MOCK-001',
      trip_number: 'Viaje 1',
      route_type_id: rutaNorte,
      route_type_name: nombreRuta(rutaNorte),
      trip_date: HOY,
      status: 'despachado',
      pedidos: pedidosDe([2, 3, 14, 15, 16], 'VJ-MOCK-001'),
    },
    {
      id: 'VJ-MOCK-002',
      trip_number: 'Viaje 2',
      route_type_id: rutaSur,
      route_type_name: nombreRuta(rutaSur),
      trip_date: HOY,
      status: 'despachado',
      pedidos: pedidosViaje2,
    },
    {
      id: 'VJ-MOCK-003',
      trip_number: 'Viaje 3',
      route_type_id: rutaCentro,
      route_type_name: nombreRuta(rutaCentro),
      trip_date: HOY,
      status: 'despachado',
      pedidos: pedidosDe([0, 1, 8, 9, 19], 'VJ-MOCK-003'),
    },
    {
      id: 'VJ-MOCK-004',
      trip_number: 'Viaje 4',
      route_type_id: rutaOriente,
      route_type_name: nombreRuta(rutaOriente),
      trip_date: HOY,
      status: 'despachado',
      pedidos: pedidosDe([10, 11, 17, 18, 7], 'VJ-MOCK-004'),
    },
  ];
}
