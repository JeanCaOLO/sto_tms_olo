// Importación de una planilla de estructura de costos.
//
// El flujo es de CUATRO pasos a propósito: archivo → hoja → mapeo → vista previa. Ninguna planilla
// viene igual, así que el sistema no adivina: propone y la persona confirma. La vista previa
// muestra también lo que NO se va a importar, para que nadie descubra después que faltaban filas.

import { useMemo, useState } from 'react';
import Button from '../../../components/base/Button';
import Select from '../../../components/base/Select';
import Badge from '../../../components/base/Badge';
import {
  analyzeSheet, parseCostRows, type ColumnMapping, type SheetAnalysis, type SheetMatrix,
  type TargetField,
} from '../../../lib/tarifas/costSheetParser';
import { COST_DRIVER_LABELS } from '../../../lib/tarifas/cost';
import type { CostDriver } from '../../../lib/tarifas/types';
import type { CostRowInput } from '../../../lib/tarifas/costStructureDataSource';

interface Props {
  isOpen: boolean;
  structureName: string;
  onClose: () => void;
  onImport: (rows: CostRowInput[], mode: 'replace' | 'append') => Promise<void>;
}

type Step = 'file' | 'sheet' | 'map' | 'preview';

const DRIVER_OPTIONS = (Object.keys(COST_DRIVER_LABELS) as CostDriver[])
  .map((d) => ({ value: d, label: COST_DRIVER_LABELS[d] }));

const FIELD_OPTIONS: { value: TargetField; label: string }[] = [
  { value: 'ignore', label: 'No importar' },
  { value: 'label', label: 'Concepto' },
  { value: 'amount', label: 'Importe' },
  { value: 'unit', label: 'Unidad' },
  { value: 'code', label: 'Código' },
];

export default function ImportSheetWizard({ isOpen, structureName, onClose, onImport }: Props) {
  const [step, setStep] = useState<Step>('file');
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<{ name: string; matrix: SheetMatrix }[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [fields, setFields] = useState<TargetField[]>([]);
  const [driver, setDriver] = useState<CostDriver>('FIXED');
  const [sign, setSign] = useState<'ADD' | 'SUBTRACT'>('ADD');
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep('file');
    setFileName('');
    setSheets([]);
    setSheetIndex(0);
    setError('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      // Carga BAJO DEMANDA: la librería de Excel pesa cientos de kB y solo hace falta cuando
      // alguien importa una planilla. Importarla arriba la metería en el bundle principal, que
      // paga todo el mundo al abrir la app.
      const XLSX = await import('xlsx');

      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const parsed = wb.SheetNames.map((name) => ({
        name,
        // `header: 1` devuelve una matriz cruda: sin esto, la librería inventa nombres de columna a
        // partir de la primera fila, que en estas planillas es el TÍTULO, no el encabezado.
        matrix: XLSX.utils.sheet_to_json(wb.Sheets[name], {
          header: 1, blankrows: false, defval: null,
        }) as SheetMatrix,
      }));

      if (parsed.length === 0) throw new Error('El archivo no tiene hojas.');

      setFileName(file.name);
      setSheets(parsed);
      selectSheet(parsed, 0);
      setStep('sheet');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    }
  };

  const selectSheet = (all: typeof sheets, index: number) => {
    const analysis = analyzeSheet(all[index]?.matrix ?? []);
    setSheetIndex(index);
    setHeaderRow(analysis.headerRow === -1 ? 0 : analysis.headerRow);
    setFields(analysis.columns.map((c) => c.suggested));
    setDriver(analysis.suggestedDriver);
  };

  const matrix = sheets[sheetIndex]?.matrix ?? [];

  // Se re-analiza cuando la persona cambia la fila de encabezado: las columnas y sus tipos dependen
  // de dónde empiecen los datos.
  const analysis: SheetAnalysis = useMemo(() => {
    const base = analyzeSheet(matrix);
    return { ...base, headerRow, firstDataRow: headerRow + 1 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, headerRow]);

  const mapping: ColumnMapping = useMemo(() => ({
    label: fields.findIndex((f) => f === 'label') >= 0 ? fields.findIndex((f) => f === 'label') : null,
    amount: fields.findIndex((f) => f === 'amount') >= 0 ? fields.findIndex((f) => f === 'amount') : null,
    unit: fields.findIndex((f) => f === 'unit') >= 0 ? fields.findIndex((f) => f === 'unit') : null,
    code: fields.findIndex((f) => f === 'code') >= 0 ? fields.findIndex((f) => f === 'code') : null,
  }), [fields]);

  const parsed = useMemo(
    () => parseCostRows(matrix, { firstDataRow: headerRow + 1 }, mapping, driver),
    [matrix, headerRow, mapping, driver],
  );

  const total = parsed.rows.reduce((acc, r) => acc + Number(r.amount), 0);

  const handleImport = async () => {
    setBusy(true);
    setError('');
    try {
      await onImport(
        parsed.rows.map((r) => ({
          code: r.code,
          label: r.label,
          driver: r.driver,
          amount: r.amount,
          sign,
          appliesWhen: null,
          unit: r.unit,
          active: true,
        })),
        mode,
      );
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar.');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  const headerCells = matrix[headerRow] ?? [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Importar planilla de costos</h2>
            <p className="text-xs text-slate-500 mt-0.5">Hacia «{structureName}»</p>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {/* Pasos */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-slate-100 text-xs">
          {([
            ['file', '1 · Archivo'],
            ['sheet', '2 · Hoja'],
            ['map', '3 · Columnas'],
            ['preview', '4 · Vista previa'],
          ] as [Step, string][]).map(([s, label]) => (
            <span
              key={s}
              className={`px-2.5 py-1 rounded-full ${step === s ? 'bg-teal-100 text-teal-800 font-medium' : 'text-slate-400'}`}
            >
              {label}
            </span>
          ))}
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
          )}

          {/* ── 1 · Archivo ──────────────────────────────────────────────────────────────── */}
          {step === 'file' && (
            <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-lg">
              <i className="ri-file-excel-2-line text-4xl text-slate-300"></i>
              <p className="mt-3 text-sm text-slate-600 font-medium">Elegí un Excel o un CSV</p>
              <p className="text-xs text-slate-500 mb-4">
                Se leen todas las hojas; después elegís cuál importar.
              </p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => void handleFile(e.target.files?.[0])}
                className="mx-auto block text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-teal-600 file:text-white file:cursor-pointer"
              />
            </div>
          )}

          {/* ── 2 · Hoja ─────────────────────────────────────────────────────────────────── */}
          {step === 'sheet' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                <strong>{fileName}</strong> — {sheets.length} hoja(s).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {sheets.map((s, i) => {
                  const a = analyzeSheet(s.matrix);
                  return (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => selectSheet(sheets, i)}
                      className={`text-left px-4 py-3 rounded-lg border transition-colors cursor-pointer ${
                        sheetIndex === i ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-sm font-medium text-slate-800">{s.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {s.matrix.length} filas · {a.columns.length} columnas
                        {a.detectedCurrency ? ` · ${a.detectedCurrency}` : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setStep('file')}>Atrás</Button>
                <Button onClick={() => setStep('map')}>Continuar</Button>
              </div>
            </div>
          )}

          {/* ── 3 · Columnas ─────────────────────────────────────────────────────────────── */}
          {step === 'map' && (
            <div className="space-y-4">
              {analysis.notes.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-3 space-y-1">
                  {analysis.notes.map((n, i) => <p key={i}>{n}</p>)}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Select
                  label="Fila del encabezado"
                  value={String(headerRow)}
                  onChange={(e) => setHeaderRow(Number(e.target.value))}
                  options={matrix.slice(0, 15).map((row, i) => ({
                    value: String(i),
                    label: `Fila ${i + 1}: ${row.filter(Boolean).slice(0, 3).join(' | ').slice(0, 40) || '(vacía)'}`,
                  }))}
                />
                <Select
                  label="¿Cómo se cobra cada fila?"
                  value={driver}
                  onChange={(e) => setDriver(e.target.value as CostDriver)}
                  options={DRIVER_OPTIONS}
                />
                <Select
                  label="Efecto"
                  value={sign}
                  onChange={(e) => setSign(e.target.value as 'ADD' | 'SUBTRACT')}
                  options={[
                    { value: 'ADD', label: 'Suma al costo' },
                    { value: 'SUBTRACT', label: 'Resta del costo' },
                  ]}
                />
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase">
                      <th className="px-3 py-2">Columna en la planilla</th>
                      <th className="px-3 py-2">Contenido</th>
                      <th className="px-3 py-2">Ejemplos</th>
                      <th className="px-3 py-2">Importar como</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analysis.columns.map((col) => (
                      <tr key={col.index}>
                        <td className="px-3 py-2 font-medium text-slate-700">
                          {String(headerCells[col.index] ?? `Columna ${col.index + 1}`)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={col.kind === 'number' ? 'info' : 'default'} size="sm">
                            {col.kind === 'number' ? 'números' : col.kind === 'text' ? 'texto' : col.kind === 'mixed' ? 'mixto' : 'vacía'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">
                          {matrix.slice(headerRow + 1, headerRow + 4)
                            .map((r) => r[col.index]).filter((v) => v !== null && v !== '')
                            .join(' · ').slice(0, 45) || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={fields[col.index] ?? 'ignore'}
                            onChange={(e) => setFields((prev) => {
                              const next = [...prev];
                              // Un campo se asigna a UNA sola columna: dos columnas marcadas como
                              // "Importe" dejarían el resultado a merced del orden.
                              const value = e.target.value as TargetField;
                              if (value !== 'ignore') {
                                for (let i = 0; i < next.length; i += 1) {
                                  if (next[i] === value) next[i] = 'ignore';
                                }
                              }
                              next[col.index] = value;
                              return next;
                            })}
                            options={FIELD_OPTIONS}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setStep('sheet')}>Atrás</Button>
                <Button
                  onClick={() => setStep('preview')}
                  disabled={mapping.label === null || mapping.amount === null}
                  title={mapping.label === null || mapping.amount === null
                    ? 'Marcá al menos una columna como Concepto y otra como Importe'
                    : undefined}
                >
                  Ver qué se va a importar
                </Button>
              </div>
            </div>
          )}

          {/* ── 4 · Vista previa ─────────────────────────────────────────────────────────── */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="text-emerald-700">
                  <i className="ri-check-line mr-1"></i>
                  <strong>{parsed.rows.length}</strong> filas se importan
                </span>
                {parsed.skipped.length > 0 && (
                  <span className="text-amber-700">
                    <i className="ri-error-warning-line mr-1"></i>
                    <strong>{parsed.skipped.length}</strong> se descartan
                  </span>
                )}
                <span className="text-slate-600 ml-auto">
                  Suma de importes: <strong>{total.toLocaleString('es-CR', { minimumFractionDigits: 2 })}</strong>
                </span>
              </div>

              <p className="text-xs text-slate-500">
                Compará esa suma con el total de la planilla: si no coinciden, revisá el mapeo antes
                de importar.
              </p>

              <Select
                label="¿Qué hacer con las filas que ya tiene la estructura?"
                value={mode}
                onChange={(e) => setMode(e.target.value as 'replace' | 'append')}
                options={[
                  { value: 'replace', label: 'Reemplazarlas por estas' },
                  { value: 'append', label: 'Conservarlas y agregar estas al final' },
                ]}
              />

              <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-64">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="text-left text-xs font-medium text-slate-500 uppercase">
                      <th className="px-3 py-2">Fila</th>
                      <th className="px-3 py-2">Concepto</th>
                      <th className="px-3 py-2 text-right">Importe</th>
                      <th className="px-3 py-2">Cómo se cobra</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsed.rows.map((r) => (
                      <tr key={r.code}>
                        <td className="px-3 py-1.5 text-xs text-slate-400">{r.sourceRow}</td>
                        <td className="px-3 py-1.5 text-slate-800">{r.label}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-slate-700">{r.amount}</td>
                        <td className="px-3 py-1.5 text-xs text-slate-500">{COST_DRIVER_LABELS[r.driver]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {parsed.skipped.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-amber-700 uppercase mb-1">No se importan</h4>
                  <ul className="space-y-1 max-h-32 overflow-y-auto">
                    {parsed.skipped.map((s, i) => (
                      <li key={i} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
                        Fila {s.sourceRow} · <strong>{s.label}</strong> — {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setStep('map')} disabled={busy}>Atrás</Button>
                <Button onClick={() => void handleImport()} disabled={busy || parsed.rows.length === 0}>
                  {busy ? 'Importando…' : `Importar ${parsed.rows.length} filas`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
