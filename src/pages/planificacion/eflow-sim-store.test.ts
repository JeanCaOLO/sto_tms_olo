import { describe, expect, it } from 'vitest';
import { mapExpediciones } from './eflow-sim-store';
import { seedEflowSim } from './eflow-sim-seed';
import type { ExpedicionCabecera, ExpedicionDetalle } from './eflow-sim-api';

function cab(id: string, fecha: string, ruta: string): ExpedicionCabecera {
  return {
    IDEXPEDICION: id, IDCOMPANIA: '0109', IDALMACEN: '0001', IDSUCURSAL: '0001',
    TPEXES: 'DISP', TPEXSI: 'DISP', PRIORIDAD: null, BAJADA: null,
    IDCLIENTE: null, NOMBRECLIENTE: `Cliente ${id}`, RUTA: ruta, FECHAENTREGA: fecha,
    FECHACIERRE: null, NUMEROVIAJEWMH: null, DIRECCIONENTREGA: 'Dir', LATITUD: '9.9', LONGITUD: '-84.1',
  };
}

function linea(id: string): ExpedicionDetalle {
  return {
    IDEXPEDICION: id, IDCOMPANIA: '0109', IDALMACEN: '0001', IDSUCURSAL: '0001',
    IDLINEA: 1, IDARTICULO: 'A1', DESCRIPCION: 'x', CANTIDAD: 2, PESO: 10, VOLUMEN: 0.5,
    GUIAFISCAL: null, TPEXES: 'DISP', TPEXSI: 'DISP', PRIORIDAD: null,
  };
}

describe('mapExpediciones', () => {
  it('agrupa por fecha→zona y parte cada zona en viajes de 3 paradas', () => {
    const cabs = ['a', 'b', 'c', 'd'].map((x) => cab(x, '2026-10-15', 'Zona 1'));
    const dets = cabs.map((c) => linea(c.IDEXPEDICION));
    const planes = mapExpediciones(cabs, dets);

    expect(planes).toHaveLength(1);
    expect(planes[0].plan_date).toBe('2026-10-15');
    // 4 pedidos en una zona → 2 viajes: [3 paradas, 1 parada].
    expect(planes[0].trips).toHaveLength(2);
    expect(planes[0].trips[0].stops).toHaveLength(3);
    expect(planes[0].trips[1].stops).toHaveLength(1);
    expect(planes[0].trips[0].delivery_zone).toBe('Zona 1');
    expect(planes[0].trips[0].total_weight).toBe(30); // 3 paradas × 10
  });

  it('separa planes por fecha y zonas por RUTA', () => {
    const planes = mapExpediciones(
      [cab('a', '2026-10-15', 'Zona 1'), cab('b', '2026-10-16', 'Zona 2')],
      [linea('a'), linea('b')],
    );
    expect(planes.map((p) => p.plan_date)).toEqual(['2026-10-15', '2026-10-16']);
  });

  it('ignora cabeceras sin FECHAENTREGA', () => {
    const sinFecha = { ...cab('x', '2026-10-15', 'Zona 1'), FECHAENTREGA: null };
    expect(mapExpediciones([sinFecha], [])).toHaveLength(0);
  });

  it('el seed generado da ids de viaje únicos y paradas con coords', () => {
    const { cabecera, detalle } = seedEflowSim();
    const planes = mapExpediciones(cabecera, detalle);
    const trips = planes.flatMap((p) => p.trips);
    expect(trips.length).toBeGreaterThan(0);
    expect(new Set(trips.map((t) => t.id)).size).toBe(trips.length); // ids únicos
    for (const t of trips) {
      expect(t.stops.length).toBeLessThanOrEqual(3);
      expect(t.stops[0].delivery_latitude).not.toBeNull();
    }
  });

  it('genera nº de viaje secuencial (desde 1001, únicos) y marca CARCA por pedido', () => {
    const { cabecera, detalle } = seedEflowSim();
    const planes = mapExpediciones(cabecera, detalle);
    const trips = planes.flatMap((p) => p.trips);
    const nums = trips.map((t) => t.numero_viaje);
    expect(nums[0]).toBe('1001');
    expect(new Set(nums).size).toBe(trips.length); // nº de viaje únicos
    const stops = trips.flatMap((t) => t.stops);
    expect(stops.every((s) => typeof s.en_carca === 'boolean')).toBe(true);
    expect(stops.some((s) => s.en_carca === false)).toBe(true); // hay sin despachar
  });

  it('EPA (0029): lee las expediciones -0/-1 con su prioridad uniforme', () => {
    const { cabecera, detalle } = seedEflowSim();
    const epaStops = mapExpediciones(cabecera, detalle)
      .flatMap((p) => p.trips)
      .flatMap((t) => t.stops)
      .filter((s) => s.compania === '0029');
    expect(epaStops.length).toBeGreaterThan(0);
    const falla = epaStops.filter((s) => s.order_number.endsWith('-0'));
    const regular = epaStops.filter((s) => s.order_number.endsWith('-1'));
    expect(falla.length).toBeGreaterThan(0);
    expect(regular.length).toBeGreaterThan(0);
    expect(falla.every((s) => s.prioridad === 1)).toBe(true); // -0 falla = prioridad 1
    expect(regular.every((s) => s.prioridad === 2)).toBe(true); // -1 regular = prioridad 2
  });
});
