// Lectura y descarga del libro de Excel de la plantilla de estructura de costos.

import * as XLSX from 'xlsx';
import { costTemplateSheets, type SheetMatrix } from '../../../lib/tarifas/costTemplate';

/** Descarga el libro con la plantilla vacía. */
export function downloadCostTemplate(): void {
  const workbook = XLSX.utils.book_new();
  for (const [name, matrix] of Object.entries(costTemplateSheets())) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), name);
  }
  XLSX.writeFile(workbook, 'plantilla_estructura_costos.xlsx');
}

export async function readWorkbook(file: File): Promise<Record<string, SheetMatrix>> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheets: Record<string, SheetMatrix> = {};
  for (const name of workbook.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json<SheetMatrix[number]>(workbook.Sheets[name], {
      header: 1, defval: '', raw: true,
    });
  }
  return sheets;
}
