// Excel de «Viajes por liquidar» con los pedidos de cada viaje. Módulo sin React: arma el libro y lo baja.
//
// Hoja 1, «Viajes y pedidos»: cada viaje es una fila (en negrita) y sus pedidos van debajo (nivel 1),
// agrupados con el esquema de Excel: el botón [+]/[−] está en la fila del viaje y abre o cierra sus pedidos,
// como la fila expandible de la pantalla. Se entrega colapsada (solo viajes).
// Hoja 2, «Detalle plano»: un pedido por fila con los datos de su viaje repetidos, con filtros, lista para
// filtrar o armar una tabla dinámica. Un viaje sin pedidos sale con una fila de pedido vacía.
//
// Las columnas del viaje son las que la persona ve en la tabla (ocultas fuera, en su orden).
// `exceljs` se carga al exportar: pesa y solo hace falta aquí.

import type { Cell, Row, Workbook, Worksheet } from 'exceljs';
import { deliveryLabel, MARK_LABELS } from '../../lib/tarifas/tripOrders';
import type { DataTableColumn } from '../../components/base/DataTable';
import type { TripOrder, TripRecord } from '../../lib/tarifas/types';

type Value = string | number;

const ORDER_HEADERS = ['#', 'Guía', 'Pedido', 'Casa comercial', 'Valor', 'Peso (kg)', 'Entrega', 'En la liquidación', 'Motivo'];
/** Posición (0-based) de las columnas de pedido que son números, para alinearlas y darles formato. */
const ORDER_VALUE = 4;
const ORDER_WEIGHT = 5;

const TEAL = 'FF0F766E';
const TEAL_SOFT = 'FFF0FDFA';
const SLATE_SOFT = 'FFF1F5F9';
const MONEY = '#,##0.00';

const clean = (v: unknown): Value => (v === null || v === undefined ? '' : (v as Value));

/** Valor monetario como número (Excel lo suma); si no es numérico, el texto tal cual. */
const money = (v: string): Value => {
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
};

export const orderCells = (o: TripOrder): Value[] => [
  clean(o.sequence),
  o.guideNumber ?? '',
  o.orderNumber ?? '',
  o.customerName ?? 'Sin casa comercial',
  money(o.value),
  o.weightKg,
  deliveryLabel(o.deliveryStatus),
  MARK_LABELS[o.mark ?? 'INCLUIDO'],
  o.markReason ?? '',
];

/** Las celdas del viaje, con los mismos valores que la tabla, para las columnas dadas. */
export const tripCells = (t: TripRecord, columns: DataTableColumn<TripRecord>[]): Value[] =>
  columns.map((c) => clean(c.exportValue ? c.exportValue(t) : c.accessor(t)));

const fill = (cell: Cell, argb: string) => {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
};

const styleHeader = (row: Row) => {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    fill(cell, TEAL);
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
};

/** Anchos por el contenido más largo de cada columna, con tope. */
const fitColumns = (ws: Worksheet) => {
  ws.columns.forEach((col) => {
    let max = 8;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      max = Math.max(max, String(cell.value ?? '').length);
    });
    col.width = Math.min(40, max + 2);
  });
};

const formatOrderNumbers = (row: Row, offset: number) => {
  const value = row.getCell(offset + ORDER_VALUE + 1);
  if (typeof value.value === 'number') value.numFmt = MONEY;
  row.getCell(offset + ORDER_VALUE + 1).alignment = { horizontal: 'right' };
  row.getCell(offset + ORDER_WEIGHT + 1).alignment = { horizontal: 'right' };
};

export interface TripsWorkbook {
  workbook: Workbook;
  tripRows: number;
  orderRows: number;
}

export async function buildTripsWorkbook(
  trips: TripRecord[],
  ordersByTrip: Map<string, TripOrder[]>,
  columns: DataTableColumn<TripRecord>[],
): Promise<TripsWorkbook> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const tripHeaders = columns.map((c) => c.header);

  // ── Hoja agrupada ────────────────────────────────────────────────────────────────────────────────
  const grouped = workbook.addWorksheet('Viajes y pedidos', {
    views: [{ state: 'frozen', ySplit: 1 }],
    // Resumen ARRIBA: el botón [+]/[−] queda en la fila del viaje, no debajo de sus pedidos.
    properties: { outlineLevelRow: 1, outlineProperties: { summaryBelow: false, summaryRight: true } },
  });
  styleHeader(grouped.addRow(tripHeaders));
  const numericTrip = new Set(columns.map((c, i) => (c.align === 'right' ? i : -1)).filter((i) => i >= 0));

  let orderRows = 0;
  for (const t of trips) {
    const tripRow = grouped.addRow(tripCells(t, columns));
    tripRow.font = { bold: true };
    tripRow.eachCell((cell) => fill(cell, TEAL_SOFT));
    numericTrip.forEach((i) => { tripRow.getCell(i + 1).alignment = { horizontal: 'right' }; });

    const orders = ordersByTrip.get(t.id) ?? [];
    if (orders.length === 0) continue;

    const head = grouped.addRow(['', ...ORDER_HEADERS]);
    head.eachCell((cell, col) => {
      if (col === 1) return;
      cell.font = { bold: true, italic: true, color: { argb: 'FF334155' } };
      fill(cell, SLATE_SOFT);
    });
    head.outlineLevel = 1;
    head.hidden = true;
    for (const o of orders) {
      const row = grouped.addRow(['', ...orderCells(o)]);
      row.outlineLevel = 1;
      row.hidden = true;
      formatOrderNumbers(row, 1);
      orderRows += 1;
    }
    // Con el resumen arriba, la fila del viaje es la que lleva la marca «colapsado» (el botón sale como +).
    // exceljs la deriva solo para filas de esquema, así que se fija aquí a mano.
    Object.defineProperty(tripRow, 'collapsed', { value: true });
  }
  fitColumns(grouped);

  // ── Hoja plana ───────────────────────────────────────────────────────────────────────────────────
  const flat = workbook.addWorksheet('Detalle plano', { views: [{ state: 'frozen', ySplit: 1 }] });
  styleHeader(flat.addRow([...tripHeaders, ...ORDER_HEADERS]));
  const blankOrder: Value[] = ORDER_HEADERS.map(() => '');
  const addFlat = (base: Value[], order: Value[], hasOrder: boolean) => {
    const row = flat.addRow([...base, ...order]);
    numericTrip.forEach((i) => { row.getCell(i + 1).alignment = { horizontal: 'right' }; });
    if (hasOrder) formatOrderNumbers(row, tripHeaders.length);
  };
  for (const t of trips) {
    const base = tripCells(t, columns);
    const orders = ordersByTrip.get(t.id) ?? [];
    if (orders.length === 0) addFlat(base, blankOrder, false);
    for (const o of orders) addFlat(base, orderCells(o), true);
  }
  fitColumns(flat);
  flat.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, flat.rowCount), column: tripHeaders.length + ORDER_HEADERS.length },
  };

  return { workbook, tripRows: trips.length, orderRows };
}

/** Arma el libro y lo descarga como `<nombre>-AAAA-MM-DD.xlsx`. */
export async function downloadTripsWorkbook(
  trips: TripRecord[],
  ordersByTrip: Map<string, TripOrder[]>,
  columns: DataTableColumn<TripRecord>[],
  fileName: string,
): Promise<TripsWorkbook> {
  const built = await buildTripsWorkbook(trips, ordersByTrip, columns);
  const buffer = await built.workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return built;
}
