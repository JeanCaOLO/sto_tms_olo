import { describe, it, expect } from 'vitest';
import { demoCatalogos, demoCompanias, demoPedidosDeRuta, demoPedidosDeViaje, demoViajes } from './demo';

describe('demo selectors', () => {
  it('lista las compañías demo por país', () => {
    expect(demoCompanias('cr').map((c) => c.id)).toContain('0109');
    expect(demoCompanias('ve').map((c) => c.id)).toEqual(expect.arrayContaining(['0001', '0002', '0003']));
  });

  it('filtra los viajes por compañía y los une cuando no hay compañía', () => {
    const soloBeval = demoViajes('ve', '0003');
    expect(soloBeval.length).toBeGreaterThan(0);
    const todasVe = demoViajes('ve', '');
    expect(todasVe.length).toBeGreaterThanOrEqual(soloBeval.length);
  });

  it('los catálogos demo traen vehículos con capacidades distintas', () => {
    const { vehiculos } = demoCatalogos('cr', '0109');
    expect(vehiculos.length).toBeGreaterThan(1);
    expect(new Set(vehiculos.map((v) => v.capacity_weight)).size).toBeGreaterThan(1);
  });

  it('los pedidos de un viaje demo traen coordenadas', () => {
    const viaje = demoViajes('cr', '0109')[0];
    const pedidos = demoPedidosDeViaje('cr', '0109', viaje.id);
    expect(pedidos.length).toBeGreaterThan(0);
    expect(pedidos[0].delivery_latitude).toBeTypeOf('number');
    // pedidos por ruta = los del/los viaje(s) de esa ruta
    expect(demoPedidosDeRuta('cr', '0109', viaje.route_type_id).length).toBeGreaterThanOrEqual(pedidos.length);
  });
});
