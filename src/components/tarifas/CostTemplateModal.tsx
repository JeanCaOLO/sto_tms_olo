// Subir la plantilla de estructura de costos: archivo -> vista previa (errores, avisos, resumen por
// tipo de camión) -> guardar. Guardar REEMPLAZA la estructura activa del ámbito (país o compañía).
// El mismo diálogo lo usan Reglas de Tarifa (flota propia del país) y la ficha de la compañía.

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import Button from '../base/Button';
import Badge from '../base/Badge';
import { TruckSummaryTable } from './CostStructureParts';
import {
  costTemplateSheets, parseCostTemplate, type ParsedCostTemplate, type SheetMatrix,
} from '../../lib/tarifas/costTemplate';
import { applyCostTemplate } from '../../lib/tarifas/costStructureDataSource';
import { listTruckTypes } from '../../lib/tarifas/vehiclesDataSource';

/** Descarga el libro con la plantilla vacía. */
export function downloadCostTemplate(): void {
  const workbook = XLSX.utils.book_new();
  for (const [name, matrix] of Object.entries(costTemplateSheets())) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), name);
  }
  XLSX.writeFile(workbook, 'plantilla_estructura_costos.xlsx');
}

async function readWorkbook(file: File): Promise<Record<string, SheetMatrix>> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheets: Record<string, SheetMatrix> = {};
  for (const name of workbook.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json<SheetMatrix[number]>(workbook.Sheets[name], {
      header: 1, defval: '', raw: true,
    });
  }
  return sheets;
}

interface Props {
  isOpen: boolean;
  /** Compañía dueña. Null = estructura por defecto de la flota propia del país. */
  partyId: string | null;
  countryId: string;
  /** Nombre con el que se guarda la estructura. */
  structureName: string;
  /** Texto que explica a qué estructura reemplaza ("la estructura de la flota propia de Costa Rica"). */
  scopeLabel: string;
  currency?: string;
  onClose: () => void;
  onApplied: () => void;
}

export default function CostTemplateModal({
  isOpen, partyId, countryId, structureName, scopeLabel, currency, onClose, onApplied,
}: Props) {
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedCostTemplate | null>(null);
  const [knownTrucks, setKnownTrucks] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setFileName(''); setParsed(null); setError('');
    let cancelled = false;
    listTruckTypes()
      .then((types) => { if (!cancelled) setKnownTrucks(types.map((t) => t.code)); })
      .catch(() => { if (!cancelled) setKnownTrucks([]); }); // sin catálogo no se avisa de tipos desconocidos
    return () => { cancelled = true; };
  }, [isOpen]);

  const summary = useMemo(() => parsed?.summary ?? [], [parsed]);

  if (!isOpen) return null;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(''); setParsed(null); setFileName(file.name);
    if (!/\.xlsx?$/i.test(file.name)) {
      setError('El archivo debe ser un libro de Excel (.xlsx) con las hojas de la plantilla.');
      return;
    }
    setReading(true);
    try {
      const sheets = await readWorkbook(file);
      setParsed(parseCostTemplate(sheets, { knownTruckTypes: knownTrucks }));
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e instanceof Error ? e.message : 'error inesperado'}`);
    } finally {
      setReading(false);
    }
  };

  const handleSave = async () => {
    if (!parsed || parsed.errors.length > 0 || !parsed.operatingDays) return;
    if (!window.confirm(`Esto reemplaza ${scopeLabel} por las ${parsed.rows.length} filas de la plantilla. ¿Continuar?`)) return;
    setSaving(true); setError('');
    try {
      const result = await applyCostTemplate({
        partyId, countryId, name: structureName,
        operatingDaysPerMonth: parsed.operatingDays, params: parsed.params, rows: parsed.rows,
      });
      if (result.status === 'failed') throw new Error(result.error.message);
      onApplied();
      onClose();
    } catch (e) {
      setError(`No se pudo guardar: ${e instanceof Error ? e.message : 'error inesperado'}`);
    } finally {
      setSaving(false);
    }
  };

  const hasErrors = !!parsed && parsed.errors.length > 0;
  const issue = (i: { sheet: string; row: number | null; message: string }) =>
    `${i.sheet}${i.row ? `, fila ${i.row}` : ''}: ${i.message}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Subir plantilla de estructura de costos</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Al guardar se reemplaza {scopeLabel}. Si todavía no tenés el archivo, descargá la plantilla vacía.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
              <i className="ri-file-excel-2-line"></i> Elegir archivo .xlsx
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ''; }}
              />
            </label>
            <Button variant="secondary" onClick={downloadCostTemplate}>
              <i className="ri-download-2-line mr-1"></i> Descargar plantilla
            </Button>
            {fileName && <span className="text-xs text-slate-500">{fileName}</span>}
            {reading && <i className="ri-loader-4-line animate-spin text-slate-500"></i>}
          </div>

          {parsed && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="info" size="sm">{parsed.rows.length} filas de costo</Badge>
                {parsed.operatingDays !== null && <Badge size="sm">{parsed.operatingDays} días operativos</Badge>}
                <Badge variant={hasErrors ? 'danger' : 'success'} size="sm">{parsed.errors.length} errores</Badge>
                <Badge variant={parsed.warnings.length > 0 ? 'warning' : 'default'} size="sm">{parsed.warnings.length} avisos</Badge>
              </div>

              {hasErrors && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <p className="text-sm font-medium text-red-700 mb-1">Corregí esto en el archivo y volvé a subirlo:</p>
                  <ul className="list-disc pl-5 text-sm text-red-700 space-y-0.5">
                    {parsed.errors.map((e, i) => <li key={i}>{issue(e)}</li>)}
                  </ul>
                </div>
              )}
              {parsed.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <p className="text-sm font-medium text-amber-700 mb-1">Avisos (no impiden guardar):</p>
                  <ul className="list-disc pl-5 text-sm text-amber-700 space-y-0.5">
                    {parsed.warnings.map((w, i) => <li key={i}>{issue(w)}</li>)}
                  </ul>
                </div>
              )}

              {summary.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">
                    Resumen por tipo de camión{currency ? ` (${currency})` : ''}
                  </h3>
                  <TruckSummaryTable summary={summary} exportFileName="vista_previa_estructura_costos" />
                </div>
              )}
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void handleSave()} disabled={!parsed || hasErrors || saving || reading}>
            {saving ? 'Guardando...' : 'Guardar y reemplazar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
