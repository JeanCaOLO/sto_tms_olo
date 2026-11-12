// @vitest-environment jsdom
//
// Excel de «Viajes por liquidar» con pedidos: hoja agrupada (viaje + pedidos con nivel de esquema,
// resumen arriba, estilos) y hoja plana. Se vuelve a leer el archivo serializado para probar lo que Excel verá.

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildTripsWorkbook } from '../exportTripsWithOrders';
import { tripColumns } from '../parts/tripColumns';
import type { TripOrder, TripRecord } from '../../../lib/tarifas/types';

const trip = (id: string): TripRecord => ({
  id, routeNumber: `R-${id}`, routeDate: '2026-10-01', status: 'completed', guideCount: 2, deliveredGuides: 2,
  totalStops: 2, completedStops: 2, weightKg: 100, km: 50, carrierName: 'Transp', isOwnFleet: false,
} as unknown as TripRecord);

const order = (n: string, extra: Partial<TripOrder> = {}): TripOrder => ({
  guideId: `g-${n}`, guideNumber: `GD-${n}`, sequence: Number(n), deliveryStatus: 'delivered',
  orderId: `o-${n}`, orderNumber: `PED-${n}`, customerId: 'EPA', customerCode: 'EPA', customerName: 'EPA',
  value: '1500.50', weightKg: 10, volumeM3: 1, items: 2, mark: null, markReason: null, ...extra,
});

const ordersByTrip = new Map<string, TripOrder[]>([
  ['A', [order('1'), order('2', { mark: 'ANULADO', markReason: 'duplicado' })]],
  ['B', []],
]);

/** Construye, serializa y vuelve a leer: lo que se baja es lo que se prueba. */
async function roundTrip(columns = tripColumns) {
  const built = await buildTripsWorkbook([trip('A'), trip('B')], ordersByTrip, columns);
  const buffer = await built.workbook.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buffer);
  return { built, back };
}

const cell = (ws: ExcelJS.Worksheet, r: number, c: number) => ws.getRow(r).getCell(c).value;

describe('buildTripsWorkbook', () => {
  it('cuenta viajes y pedidos', async () => {
    const { built } = await roundTrip();
    expect(built.tripRows).toBe(2);
    expect(built.orderRows).toBe(2);
  });

  it('hoja agrupada: viaje, encabezado de pedidos y pedidos en nivel 1 colapsado', async () => {
    const { back } = await roundTrip();
    const ws = back.getWorksheet('Viajes y pedidos')!;
    // encabezado, viaje A, encabezado de pedidos, 2 pedidos, viaje B (sin pedidos: sin bloque)
    expect(ws.rowCount).toBe(6);
    expect(cell(ws, 2, 1)).toBe('R-A');
    expect(cell(ws, 3, 2)).toBe('#');
    expect(cell(ws, 4, 4)).toBe('PED-1');
    expect(cell(ws, 5, 9)).toBe('Anulado');
    expect(cell(ws, 6, 1)).toBe('R-B');
    expect([1, 2, 3, 4, 5, 6].map((r) => ws.getRow(r).outlineLevel)).toEqual([0, 0, 1, 1, 1, 0]);
    expect([3, 4, 5].every((r) => ws.getRow(r).hidden)).toBe(true);
    expect(ws.getRow(2).hidden).toBe(false);
  });

  it('el resumen va arriba y la fila del viaje queda marcada como colapsada', async () => {
    const { built, back } = await roundTrip();
    expect(back.getWorksheet('Viajes y pedidos')!.properties.outlineProperties?.summaryBelow).toBe(false);
    // `collapsed` es lo que exceljs escribe en el XML de la fila (al leer se deriva del nivel, por eso se mira el libro armado).
    const ws = built.workbook.getWorksheet('Viajes y pedidos')!;
    expect((ws.getRow(2).model as { collapsed?: boolean }).collapsed).toBe(true);
    expect((ws.getRow(6).model as { collapsed?: boolean }).collapsed).toBeFalsy(); // viaje sin pedidos: nada que abrir
  });

  it('estilos: encabezado y viajes en negrita, valor numérico con formato', async () => {
    const { back } = await roundTrip();
    const ws = back.getWorksheet('Viajes y pedidos')!;
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(ws.getRow(2).getCell(1).font?.bold).toBe(true);
    const value = ws.getRow(4).getCell(6);
    expect(value.value).toBe(1500.5);
    expect(value.numFmt).toBe('#,##0.00');
  });

  it('hoja plana: el viaje se repite por pedido, con filtro, y el viaje sin pedidos no se pierde', async () => {
    const { back } = await roundTrip();
    const ws = back.getWorksheet('Detalle plano')!;
    expect(ws.rowCount).toBe(1 + 2 + 1);
    expect(cell(ws, 2, 1)).toBe('R-A');
    expect(cell(ws, 3, 1)).toBe('R-A');
    expect(cell(ws, 4, 1)).toBe('R-B');
    const pedidoCol = tripColumns.length + 3;
    expect(cell(ws, 2, pedidoCol)).toBe('PED-1');
    expect(cell(ws, 4, pedidoCol)).toBe(''); // sin pedido
    expect(ws.autoFilter).toBeTruthy();
  });

  it('respeta las columnas que se ven: solo esas y en su orden', async () => {
    const visibles = [tripColumns[1], tripColumns[0]]; // Fecha, Viaje
    const { back } = await roundTrip(visibles);
    const ws = back.getWorksheet('Viajes y pedidos')!;
    expect(cell(ws, 1, 1)).toBe('Fecha');
    expect(cell(ws, 1, 2)).toBe('Viaje');
    expect(cell(ws, 2, 2)).toBe('R-A');
    expect(cell(ws, 1, 3)).toBeNull(); // no sobran columnas de viaje
  });
});
