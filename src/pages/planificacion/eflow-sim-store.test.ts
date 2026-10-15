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
});
