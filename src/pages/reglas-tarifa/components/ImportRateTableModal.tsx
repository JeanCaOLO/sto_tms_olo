// Importación de las filas de un tarifario desde CSV o Excel.
//
// La diferencia con el importador de tarifas por vehículo: allá la forma del archivo es fija, acá
// la decide la clave del tarifario. Una columna por cada variable de la clave, más el importe.
//
// Lo que el archivo NO decide: a qué tarifario va ni en qué moneda está. Eso ya está dicho por la
// tabla elegida, y leerlo del archivo sería adivinar.

import { useMemo, useState } from 'react';
import Button from '../../../components/base/Button';
import Select from '../../../components/base/Select';
import Badge from '../../../components/base/Badge';
import { readSheets, type LoadedSheet } from '../../../lib/tarifas/sheetReader';
import {
  analyzeRateTableSheet, findDuplicateKeys, parseRateTableSheet, type RateTableMapping,
} from '../../../lib/tarifas/rateTableImport';
import type { NumberFormat } from '../../../lib/tarifas/costSheetParser';
import { bulkUpsertRows } from '../../../lib/tarifas/rateTablesDataSource';
import { VAR_KEY_LABELS } from '../../../lib/tarifas/format';
import { registrarEvento } from '../../../lib/liquidador/auditLog';
import { obtenerRolActivo } from '../../../lib/liquidador/rbac';
import { RATE_TABLE_WILDCARD, type RateTable, type VarKey } from '../../../lib/tarifas/types';

interface Props {
  isOpen: boolean;
  table: RateTable;
  onClose: () => void;
  onImported: () => void;
}

const NUMBER_FORMAT_OPTIONS: { value: NumberFormat; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'es', label: 'Español — 1.234,56' },
  { value: 'en', label: 'Inglés — 1,234.56' },
];

const varLabelOf = (key: VarKey) => VAR_KEY_LABELS[key as keyof typeof VAR_KEY_LABELS] ?? key;

export default function ImportRateTableModal({ isOpen, table, onClose, onImported }: Props) {
  const [numberFormat, setNumberFormat] = useState<NumberFormat>('auto');
  const [mode, setMode] = useState<'replace' | 'merge'>('merge');

  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<LoadedSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<RateTableMapping>({ key: [], amount: null });
  const [notes, setNotes] = useState<string[]>([]);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ inserted: number; replaced: number } | null>(null);

  // Memoizado: sin esto, el `?? []` crea un arreglo nuevo en cada render y los useMemo que lo usan
  // como dependencia vuelven a parsear la planilla entera cada vez.
  const matrix = useMemo(() => sheets[sheetIndex]?.matrix ?? [], [sheets, sheetIndex]);

  const reset = () => {
    setFileName('');
    setSheets([]);
    setSheetIndex(0);
    setHeaderRow(0);
    setMapping({ key: [], amount: null });
    setNotes([]);
    setError('');
    setDone(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const applySheet = (loaded: LoadedSheet[], index: number) => {
    const analysis = analyzeRateTableSheet(loaded[index]?.matrix ?? [], table.keyColumns);
    setSheetIndex(index);
    setHeaderRow(analysis.headerRow);
    setMapping(analysis.mapping);
    setNotes(analysis.notes);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setDone(null);
    try {
      const loaded = await readSheets(file);
      if (loaded.length === 0) throw new Error('El archivo no tiene contenido.');
      setFileName(file.name);
      setSheets(loaded);
      applySheet(loaded, 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    }
  };

  const headers = useMemo(() => {
    const width = Math.max(0, ...matrix.map((r) => r.length));
    return Array.from({ length: width }, (_, i) => {
      const cell = matrix[headerRow]?.[i];
      return cell === null || cell === undefined || String(cell).trim() === ''
        ? `Columna ${i + 1}`
        : String(cell).trim();
    });
  }, [matrix, headerRow]);

  const parsed = useMemo(
    () => parseRateTableSheet(
      matrix, table.keyColumns, { firstDataRow: headerRow + 1, mapping }, numberFormat,
    ),
    [matrix, table.keyColumns, headerRow, mapping, numberFormat],
  );

  const duplicadas = useMemo(() => findDuplicateKeys(parsed.rows), [parsed.rows]);

  const columnOptions = [
    { value: '', label: 'Sin asignar' },
    ...headers.map((h, i) => ({ value: String(i), label: `${i + 1} · ${h}` })),
  ];

  const setKeyColumn = (index: number, value: string) => {
    const copia = [...mapping.key];
    copia[index] = value === '' ? null : Number(value);
    setMapping({ ...mapping, key: copia });
  };

  const canImport = mapping.amount !== null && parsed.rows.length > 0;

  const handleImport = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await bulkUpsertRows(
        table.id,
        parsed.rows.map((r) => ({ key: r.key, amount: r.amount })),
        mode,
      );

      if (result.error) { setError(result.error); return; }

      await registrarEvento({
        entidad: 'tarifas_rate_table_rows',
        entidadId: table.id,
        accion: 'CREATE',
        usuario: 'Usuario simulado',
        rol: obtenerRolActivo(),
        despues: {
          archivo: fileName,
          tarifario: table.code,
          modo: mode,
          agregadas: result.inserted,
          reemplazadas: result.replaced,
        },
        motivo: `Importación de filas de ${table.code} desde ${fileName}`,
      });

      setDone({ inserted: result.inserted, replaced: result.replaced });
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar.');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Importar filas de <span className="font-mono text-teal-700">{table.code}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              El archivo necesita una columna por cada variable de la clave, más el importe.
            </p>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
          )}

          {done ? (
            <div className="text-center py-10">
              <div className="w-16 h-16 flex items-center justify-center bg-emerald-100 rounded-full mx-auto mb-4">
                <i className="ri-check-line text-2xl text-emerald-600"></i>
              </div>
              <h3 className="text-lg font-medium text-slate-800 mb-1">Importación terminada</h3>
              <p className="text-sm text-slate-600">
                {done.inserted} fila{done.inserted === 1 ? '' : 's'} agregada
                {done.inserted === 1 ? '' : 's'} · {done.replaced} actualizada
                {done.replaced === 1 ? '' : 's'}.
              </p>
            </div>
          ) : (
            <>
              {/* ── Archivo ───────────────────────────────────────────────────────────────── */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Archivo</label>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.txt"
                  onChange={(e) => void handleFile(e.target.files?.[0])}
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
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {sheets.length > 1 && (
                      <Select
                        label="Hoja"
                        value={String(sheetIndex)}
                        onChange={(e) => applySheet(sheets, Number(e.target.value))}
                        options={sheets.map((s, i) => ({ value: String(i), label: s.name }))}
                      />
                    )}
                    <Select
                      label="Fila de encabezado"
                      value={String(headerRow)}
                      onChange={(e) => setHeaderRow(Number(e.target.value))}
                      options={matrix.slice(0, 15).map((_r, i) => ({
                        value: String(i),
                        label: `Fila ${i + 1}`,
                      }))}
                    />
                    <Select
                      label="Formato de los números"
                      value={numberFormat}
                      onChange={(e) => setNumberFormat(e.target.value as NumberFormat)}
                      options={NUMBER_FORMAT_OPTIONS}
                    />
                  </div>

                  {notes.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-lg px-4 py-3 space-y-1">
                      {notes.map((n) => (
                        <p key={n}><i className="ri-information-line mr-1"></i>{n}</p>
                      ))}
                    </div>
                  )}

                  {/* ── Mapeo ───────────────────────────────────────────────────────────── */}
                  <div className="border border-slate-200 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-1">Qué columna es cada cosa</h3>
                    <p className="text-xs text-slate-500 mb-3">
                      Una columna de la clave sin asignar queda en comodín
                      (<code className="font-mono">*</code>) en todas las filas.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {table.keyColumns.map((column, index) => (
                        <Select
                          key={column}
                          label={varLabelOf(column)}
                          value={mapping.key[index] === null || mapping.key[index] === undefined
                            ? '' : String(mapping.key[index])}
                          onChange={(e) => setKeyColumn(index, e.target.value)}
                          options={columnOptions}
                        />
                      ))}
                      <Select
                        label="Importe *"
                        value={mapping.amount === null ? '' : String(mapping.amount)}
                        onChange={(e) => setMapping({
                          ...mapping,
                          amount: e.target.value === '' ? null : Number(e.target.value),
                        })}
                        options={columnOptions}
                      />
                    </div>
                  </div>

                  {/* ── Qué se va a hacer con lo que ya está ─────────────────────────────── */}
                  <div className="border border-slate-200 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">
                      Qué hacer con las filas que ya tiene el tarifario
                    </h3>
                    <div className="space-y-2">
                      <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          checked={mode === 'merge'}
                          onChange={() => setMode('merge')}
                          className="mt-1 text-teal-600 focus:ring-teal-500"
                        />
                        <span>
                          <strong>Actualizar</strong> — se conservan las que están y se pisa el
                          importe de las que coincidan en clave.
                          <span className="block text-xs text-slate-500">
                            Es lo que se quiere al recibir una lista de correcciones.
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          checked={mode === 'replace'}
                          onChange={() => setMode('replace')}
                          className="mt-1 text-teal-600 focus:ring-teal-500"
                        />
                        <span>
                          <strong>Reemplazar todo</strong> — se borran todas las filas actuales y
                          queda solo lo del archivo.
                          <span className="block text-xs text-slate-500">
                            Es lo que se quiere al recibir el tarifario nuevo completo.
                          </span>
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* ── Vista previa ────────────────────────────────────────────────────── */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-slate-700">Vista previa</h3>
                      <Badge variant={parsed.rows.length > 0 ? 'success' : 'default'}>
                        {parsed.rows.length} fila{parsed.rows.length === 1 ? '' : 's'}
                      </Badge>
                      {parsed.skipped.length > 0 && (
                        <Badge variant="warning">{parsed.skipped.length} con problemas</Badge>
                      )}
                      {duplicadas.length > 0 && (
                        <Badge variant="danger">{duplicadas.length} clave{duplicadas.length === 1 ? '' : 's'} repetida{duplicadas.length === 1 ? '' : 's'}</Badge>
                      )}
                    </div>

                    {duplicadas.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-3 mb-3">
                        <i className="ri-alert-line mr-1"></i>
                        El archivo repite estas combinaciones:{' '}
                        {duplicadas.slice(0, 5).map((k) => k.join(' | ')).join(' · ')}
                        {duplicadas.length > 5 && ` y ${duplicadas.length - 5} más`}. Va a quedar la
                        <strong> última</strong> de cada una: dos filas con la misma clave son igual
                        de específicas y el motor elegiría una por orden.
                      </div>
                    )}

                    {parsed.rows.length > 0 && (
                      <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-slate-50">
                            <tr className="text-left text-slate-500 uppercase">
                              {table.keyColumns.map((c) => (
                                <th key={c} className="py-2 px-3 font-medium">{varLabelOf(c)}</th>
                              ))}
                              <th className="py-2 px-3 font-medium text-right">Importe</th>
                              <th className="py-2 px-3 font-medium">En el archivo</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {parsed.rows.slice(0, 50).map((row) => (
                              <tr key={row.sourceRow}>
                                {row.key.map((value, i) => (
                                  <td key={table.keyColumns[i] ?? i} className="py-1.5 px-3 font-mono">
                                    {value === RATE_TABLE_WILDCARD
                                      ? <span className="text-slate-400">*</span>
                                      : value}
                                  </td>
                                ))}
                                <td className="py-1.5 px-3 text-right font-medium text-slate-800">{row.amount}</td>
                                <td className="py-1.5 px-3 text-slate-400">{row.rawAmount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {parsed.rows.length > 50 && (
                          <p className="text-xs text-slate-500 px-3 py-2">
                            y {parsed.rows.length - 50} más…
                          </p>
                        )}
                      </div>
                    )}

                    {parsed.skipped.length > 0 && (
                      <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                        <p className="text-xs font-medium text-amber-800 mb-1">
                          Filas que no se van a importar
                        </p>
                        <ul className="text-xs text-amber-700 space-y-0.5">
                          {parsed.skipped.slice(0, 8).map((s) => (
                            <li key={s.sourceRow}>
                              Fila {s.sourceRow + 1} ({s.key.join(' | ')}): {s.reason}
                            </li>
                          ))}
                          {parsed.skipped.length > 8 && (
                            <li>y {parsed.skipped.length - 8} más…</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <Button variant="secondary" onClick={handleClose} disabled={busy}>
            {done ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!done && (
            <Button onClick={() => void handleImport()} disabled={!canImport || busy}>
              <i className="ri-upload-2-line mr-1"></i>
              {busy ? 'Importando…' : `Importar ${parsed.rows.length} fila${parsed.rows.length === 1 ? '' : 's'}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
