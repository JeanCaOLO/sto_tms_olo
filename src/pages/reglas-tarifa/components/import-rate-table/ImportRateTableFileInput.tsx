// Entrada de archivo para la importación de tarifarios.

import Select from '../../../../components/base/Select';
import { type NumberFormat } from '../../../../lib/tarifas/costSheetParser';
import type { SheetMatrix } from '../../../../lib/tarifas/costTemplate';

interface Props {
  fileName: string;
  numberFormat: NumberFormat;
  sheetIndex: number;
  headerRow: number;
  sheets: Array<{ name: string }>;
  matrix: SheetMatrix;
  onFileChange: (file: File | undefined) => void;
  onNumberFormatChange: (fmt: NumberFormat) => void;
  onSheetChange: (idx: number) => void;
  onHeaderRowChange: (row: number) => void;
}

const NUMBER_FORMAT_OPTIONS: { value: NumberFormat; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'es', label: 'Español — 1.234,56' },
  { value: 'en', label: 'Inglés — 1,234.56' },
];

export default function ImportRateTableFileInput({
  fileName,
  numberFormat,
  sheetIndex,
  headerRow,
  sheets,
  matrix,
  onFileChange,
  onNumberFormatChange,
  onSheetChange,
  onHeaderRowChange,
}: Props) {
  return (
    <>
      <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">Archivo</label>
      <input
        type="file"
        accept=".csv,.xlsx,.xls,.txt"
        onChange={(e) => onFileChange(e.target.files?.[0])}
        className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 file:cursor-pointer"
      />
      {fileName && (
        <p className="text-xs text-slate-500 mt-1.5">
          <i className="ri-file-line mr-1"></i>{fileName}
          {sheets.length > 1 && ` · ${sheets.length} hojas`}
        </p>
      )}
      </div>

      {sheets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {sheets.length > 1 && (
            <Select
              label="Hoja"
              value={String(sheetIndex)}
              onChange={(e) => onSheetChange(Number(e.target.value))}
              options={sheets.map((s, i) => ({ value: String(i), label: s.name }))}
            />
          )}
          <Select
            label="Fila de encabezado"
            value={String(headerRow)}
            onChange={(e) => onHeaderRowChange(Number(e.target.value))}
            options={matrix.slice(0, 15).map((_r, i) => ({
              value: String(i),
              label: `Fila ${i + 1}`,
            }))}
          />
          <Select
            label="Formato de los números"
            value={numberFormat}
            onChange={(e) => onNumberFormatChange(e.target.value as NumberFormat)}
            options={NUMBER_FORMAT_OPTIONS}
          />
        </div>
      )}
    </>
  );
}
