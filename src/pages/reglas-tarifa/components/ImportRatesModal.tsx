// Importación masiva de tarifas base por tipo de vehículo, desde CSV o Excel.
//
// El archivo aporta SOLO dos columnas: tipo de vehículo y precio. A qué transportista van, en qué
// país y en qué moneda se elige acá — son datos que las planillas casi nunca traen, y adivinarlos
// sería inventar.
//
// El precio se acepta como venga: "20", "20$", "20 $", "$ 1.200,50". De la celda sale el número.

import { useMemo, useState } from 'react';
import Button from '../../../components/base/Button';
import Select from '../../../components/base/Select';
import Badge from '../../../components/base/Badge';
import { readSheets, type LoadedSheet } from '../../../lib/tarifas/sheetReader';
import { analyzeRateSheet, parseRateRows, type RateColumnMapping } from '../../../lib/tarifas/rateImport';
import type { NumberFormat } from '../../../lib/tarifas/costSheetParser';
import { importOutsourcedRates } from '../../../lib/tarifas/localRulesDataSource';
import { registrarEvento } from '../../../lib/liquidador/auditLog';
import { obtenerRolActivo } from '../../../lib/liquidador/rbac';

interface Props {
  isOpen: boolean;
  organizationId: string;
  countryId: string;
  countryName: string;
  /** Moneda del país: los precios del archivo se interpretan en ella. */
  currency: string;
  carriers: { id: string; name: string }[];
  onClose: () => void;
  onImported: () => void;
}

const NUMBER_FORMAT_OPTIONS: { value: NumberFormat; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'es', label: 'Español — 1.234,56' },
  { value: 'en', label: 'Inglés — 1,234.56' },
];

export default function ImportRatesModal({
  isOpen, organizationId, countryId, countryName, currency, carriers,
  onClose, onImported,
}: Props) {
  const [carrierId, setCarrierId] = useState('');
  const [numberFormat, setNumberFormat] = useState<NumberFormat>('auto');
  const [onDuplicate, setOnDuplicate] = useState<'update' | 'skip'>('update');

  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<LoadedSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<RateColumnMapping>({ truckType: null, price: null });
  const [headerRow, setHeaderRow] = useState(0);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ created: number; updated: number } | null>(null);

  const reset = () => {
    setFileName('');
    setSheets([]);
    setSheetIndex(0);
    setMapping({ truckType: null, price: null });
    setHeaderRow(0);
    setError('');
    setDone(null);
  };

  const handleClose = () => { reset(); onClose(); };

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

  const applySheet = (loaded: LoadedSheet[], index: number) => {
    const analysis = analyzeRateSheet(loaded[index]?.matrix ?? []);
    setSheetIndex(index);
    setHeaderRow(analysis.headerRow);
    setMapping(analysis.mapping);
  };

  const matrix = sheets[sheetIndex]?.matrix ?? [];
  const analysis = useMemo(() => analyzeRateSheet(matrix), [matrix]);

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
    () => parseRateRows(matrix, headerRow + 1, mapping, numberFormat),
    [matrix, headerRow, mapping, numberFormat],
  );

  const columnOptions = [
    { value: '', label: 'Sin asignar' },
    ...headers.map((h, i) => ({ value: String(i), label: `${i + 1} · ${h}` })),
  ];

  const canImport = !!carrierId
    && mapping.truckType !== null
    && mapping.price !== null
    && parsed.rates.length > 0;

  const handleImport = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await importOutsourcedRates(
        organizationId,
        countryId,
        carrierId,
        parsed.rates.map((r) => ({ truckTypeId: r.truckType, flatRate: r.price })),
        onDuplicate,
      );

      if (result.error) { setError(result.error); return; }

      await registrarEvento({
        entidad: 'outsourced_cost_rates',
        entidadId: carrierId,
        accion: 'CREATE',
        usuario: 'Usuario simulado',
        rol: obtenerRolActivo(),
        despues: {
          archivo: fileName,
          pais: countryId,
          creadas: result.created,
          actualizadas: result.updated,
        },
        motivo: `Importación de tarifas desde ${fileName}`,
      });

      setDone({ created: result.created, updated: result.updated });
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Importar tarifas por vehículo</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              País: <strong>{countryName}</strong> · El archivo solo necesita dos columnas: tipo de
              vehículo y precio.
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

          {done && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-3">
              <i className="ri-check-line mr-1"></i>
              Listo: <strong>{done.created}</strong> tarifas nuevas
              {done.updated > 0 && <> y <strong>{done.updated}</strong> actualizadas</>}.
            </div>
          )}

          {/* ── Destino ─────────────────────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">¿A dónde van estas tarifas?</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select
                label="Transportista *"
                value={carrierId}
                onChange={(e) => setCarrierId(e.target.value)}
                options={[
                  { value: '', label: 'Elegir transportista...' },
                  ...carriers.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
              <Select
                label="Formato de los números"
                value={numberFormat}
                onChange={(e) => setNumberFormat(e.target.value as NumberFormat)}
                options={NUMBER_FORMAT_OPTIONS}
              />
            </div>
            {carriers.length === 0 && (
              <p className="text-xs text-amber-700">
                No hay transportistas activos en este país. Cargalos en Tarifas → Transportistas a Liquidar.
              </p>
            )}
          </section>

          {/* ── Archivo ─────────────────────────────────────────────────────────────────── */}
          <section className="space-y-3 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-700">Archivo</h3>
            <input
              type="file"
              accept=".csv,.txt,.tsv,.xlsx,.xls"
              onChange={(e) => void handleFile(e.target.files?.[0])}
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-teal-600 file:text-white file:cursor-pointer"
            />
            <p className="text-xs text-slate-500">
              Acepta <strong>CSV</strong> (coma, punto y coma o tabulador) y <strong>Excel</strong>{' '}
              (.xlsx / .xls). De un Excel con varias hojas, elegís cuál.
            </p>
          </section>

          {/* ── Mapeo y vista previa ────────────────────────────────────────────────────── */}
          {sheets.length > 0 && (
            <>
              <section className="space-y-3 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Columnas</h3>
                  <span className="text-xs text-slate-500">{fileName}</span>
                </div>

                {analysis.notes.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-2 space-y-1">
                    {analysis.notes.map((n, i) => <p key={i}>{n}</p>)}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {sheets.length > 1 && (
                    <Select
                      label="Hoja"
                      value={String(sheetIndex)}
                      onChange={(e) => applySheet(sheets, Number(e.target.value))}
                      options={sheets.map((s, i) => ({ value: String(i), label: s.name }))}
                    />
                  )}
                  <Select
                    label="Fila del encabezado"
                    value={String(headerRow)}
                    onChange={(e) => setHeaderRow(Number(e.target.value))}
                    options={matrix.slice(0, 12).map((row, i) => ({
                      value: String(i),
                      label: `Fila ${i + 1}: ${row.filter(Boolean).slice(0, 2).join(' | ').slice(0, 28) || '(vacía)'}`,
                    }))}
                  />
                  <Select
                    label="Tipo de vehículo *"
                    value={mapping.truckType === null ? '' : String(mapping.truckType)}
                    onChange={(e) => setMapping((m) => ({
                      ...m, truckType: e.target.value === '' ? null : Number(e.target.value),
                    }))}
                    options={columnOptions}
                  />
                  <Select
                    label="Precio *"
                    value={mapping.price === null ? '' : String(mapping.price)}
                    onChange={(e) => setMapping((m) => ({
                      ...m, price: e.target.value === '' ? null : Number(e.target.value),
                    }))}
                    options={columnOptions}
                  />
                </div>
              </section>

              <section className="space-y-3 border-t border-slate-100 pt-4">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span className="text-emerald-700">
                    <i className="ri-check-line mr-1"></i>
                    <strong>{parsed.rates.length}</strong> tarifas se importan
                  </span>
                  {parsed.skipped.length > 0 && (
                    <span className="text-amber-700">
                      <i className="ri-error-warning-line mr-1"></i>
                      <strong>{parsed.skipped.length}</strong> se descartan
                    </span>
                  )}
                  <div className="ml-auto w-full md:w-64">
                    <Select
                      label="Si el vehículo ya tenía tarifa"
                      value={onDuplicate}
                      onChange={(e) => setOnDuplicate(e.target.value as 'update' | 'skip')}
                      options={[
                        { value: 'update', label: 'Actualizar con la del archivo' },
                        { value: 'skip', label: 'Dejar la que ya estaba' },
                      ]}
                    />
                  </div>
                </div>

                {parsed.rates.length > 0 && (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-60">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr className="text-left text-xs font-medium text-slate-500 uppercase">
                          <th className="px-3 py-2">Fila</th>
                          <th className="px-3 py-2">Tipo de vehículo</th>
                          <th className="px-3 py-2">En el archivo</th>
                          <th className="px-3 py-2 text-right">Se guarda como</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsed.rates.map((r) => (
                          <tr key={r.truckType}>
                            <td className="px-3 py-1.5 text-xs text-slate-400">{r.sourceRow}</td>
                            <td className="px-3 py-1.5 text-slate-800">{r.truckType}</td>
                            <td className="px-3 py-1.5 text-xs text-slate-500">{r.rawPrice}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-slate-700">
                              {r.price}{' '}
                              <span className="text-xs text-slate-400">{currency}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {parsed.skipped.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-amber-700 uppercase mb-1">No se importan</h4>
                    <ul className="space-y-1 max-h-28 overflow-y-auto">
                      {parsed.skipped.map((s, i) => (
                        <li key={i} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
                          Fila {s.sourceRow} · <strong>{s.truckType}</strong> — {s.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!carrierId && parsed.rates.length > 0 && (
                  <Badge variant="warning">Elegí el transportista antes de importar</Badge>
                )}
              </section>
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <Button variant="secondary" onClick={handleClose} disabled={busy}>
            {done ? 'Cerrar' : 'Cancelar'}
          </Button>
          <Button onClick={() => void handleImport()} disabled={!canImport || busy}>
            {busy ? 'Importando…' : `Importar ${parsed.rates.length} tarifas`}
          </Button>
        </div>
      </div>
    </div>
  );
}
