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

const HOY = new Date().toISOString().split('T')[0];

// ponytail: 3 viajes sintéticos agrupando los 8 stops mock por afinidad
// geográfica, reflejando el concepto real de "viaje" del WMS (Reunión
// 2026-08-18): n pedidos + n destinos, con la ruta ya asignada. El viaje 2
// lleva un pedido de excepción (dirección distinta a la registrada, sin
// coordenadas) para ejercitar ese caso de punta a punta.
export function getFallbackViajes(): Viaje[] {
  const rutaNorte = FALLBACK_RUTAS[0].id;
  const rutaSur = FALLBACK_RUTAS[1].id;
  const rutaCentro = FALLBACK_RUTAS[2].id;

  const excepcion: Pedido = {
    ...pedidoDeStop(6, 'VJ-MOCK-002', 2),
    delivery_latitude: undefined,
    delivery_longitude: undefined,
    is_exception: true,
    exception_address_raw: 'Entregar en sucursal de Tres Ríos, contactar al 8888-8888 (no es la dirección registrada del cliente)',
  };

  return [
    {
      id: 'VJ-MOCK-001',
      trip_number: 'Viaje 1',
      route_type_id: rutaNorte,
      route_type_name: nombreRuta(rutaNorte),
      trip_date: HOY,
      status: 'despachado',
      pedidos: [pedidoDeStop(2, 'VJ-MOCK-001', 0), pedidoDeStop(3, 'VJ-MOCK-001', 1), pedidoDeStop(7, 'VJ-MOCK-001', 2)],
    },
    {
      id: 'VJ-MOCK-002',
      trip_number: 'Viaje 2',
      route_type_id: rutaSur,
      route_type_name: nombreRuta(rutaSur),
      trip_date: HOY,
      status: 'despachado',
      pedidos: [pedidoDeStop(4, 'VJ-MOCK-002', 0), pedidoDeStop(5, 'VJ-MOCK-002', 1), excepcion],
    },
    {
      id: 'VJ-MOCK-003',
      trip_number: 'Viaje 3',
      route_type_id: rutaCentro,
      route_type_name: nombreRuta(rutaCentro),
      trip_date: HOY,
      status: 'despachado',
      pedidos: [pedidoDeStop(0, 'VJ-MOCK-003', 0), pedidoDeStop(1, 'VJ-MOCK-003', 1)],
    },
  ];
}
