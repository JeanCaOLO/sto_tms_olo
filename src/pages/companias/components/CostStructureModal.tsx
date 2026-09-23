// Estructura de costos de una compañía: la tabla editable, fila por fila, con importación.
//
// Reemplaza al modelo de tres campos que había en Reglas de Tarifa → Costos. Una estructura real
// tiene decenas de conceptos y cada uno se prorratea distinto; eso es una tabla, no tres casillas.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import Badge from '../../../components/base/Badge';
import ImportSheetWizard from './ImportSheetWizard';
import {
  activeStructure, addRow, deleteRow, importRows, saveStructure, updateRow,
  listRows, type CostRowInput,
} from '../../../lib/tarifas/costStructureDataSource';
import { COST_DRIVER_LABELS } from '../../../lib/tarifas/cost';
import type { CostDriver, CostStructure, CostStructureRow } from '../../../lib/tarifas/types';
import type { SettlementPartyRow } from '../../../lib/tarifas/parties';
import { registrarEvento } from '../../../lib/liquidador/auditLog';
import { obtenerRolActivo } from '../../../lib/liquidador/rbac';

interface Props {
  isOpen: boolean;
  party: SettlementPartyRow | null;
  /** Moneda local del país de la compañía, para rotular los importes. */
  /** Moneda del país: los importes de la estructura están escritos en ella. */
  currency: string;
  onClose: () => void;
}

const DRIVER_OPTIONS = (Object.keys(COST_DRIVER_LABELS) as CostDriver[])
  .map((d) => ({ value: d, label: COST_DRIVER_LABELS[d] }));

const emptyRow = (): CostRowInput => ({
  code: '',
  label: '',
  driver: 'FIXED',
  amount: '0',
  sign: 'ADD',
  appliesWhen: null,
  unit: null,
  active: true,
});

export default function CostStructureModal({
  isOpen, party, currency, onClose,
}: Props) {
  const [structure, setStructure] = useState<CostStructure | null>(null);
  const [rows, setRows] = useState<CostStructureRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [newRow, setNewRow] = useState<CostRowInput>(emptyRow());

  const [meta, setMeta] = useState({
    name: 'Estructura de costos',
    operatingDaysPerMonth: 30,
  });

  const load = useCallback(async () => {
    if (!party) return;
    setLoading(true);
    setError('');
    try {
      const existing = await activeStructure(party.id);
      setStructure(existing);
      setRows(existing ? await listRows(existing.id) : []);
      if (existing) {
        setMeta({
          name: existing.name,
          operatingDaysPerMonth: existing.operatingDaysPerMonth,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [party]);

  useEffect(() => {
    if (!isOpen || !party) return;
    setNewRow(emptyRow());
    void load();
  }, [isOpen, party, load]);

  const currencyLabel = currency;

  // Suma informativa por driver: es lo que se compara contra los totales de la planilla original.
  const totals = useMemo(() => {
    const byDriver = new Map<CostDriver, number>();
    for (const row of rows) {
      if (!row.active) continue;
      const signed = row.sign === 'SUBTRACT' ? -Number(row.amount) : Number(row.amount);
      byDriver.set(row.driver, (byDriver.get(row.driver) ?? 0) + signed);
    }
    return [...byDriver.entries()];
  }, [rows]);

  if (!isOpen || !party) return null;

  const ensureStructure = async (): Promise<CostStructure | null> => {
    if (structure) return structure;

    const result = await saveStructure({
      partyId: party.id,
      countryId: party.country_id,
      name: meta.name,
      operatingDaysPerMonth: meta.operatingDaysPerMonth,
      effectiveFrom: null,
      active: true,
      notes: null,
    });

    if (result.status !== 'saved') {
      setError(result.status === 'invalid'
        ? Object.values(result.errors).join(' ')
        : result.error.message);
      return null;
    }
    setStructure(result.structure);
    return result.structure;
  };

  const handleSaveMeta = async () => {
    setError('');
    const result = await saveStructure({
      partyId: party.id,
      countryId: party.country_id,
      name: meta.name,
      operatingDaysPerMonth: meta.operatingDaysPerMonth,
      effectiveFrom: structure?.effectiveFrom ?? null,
      active: true,
      notes: structure?.notes ?? null,
    }, structure?.id);

    if (result.status === 'invalid') { setError(Object.values(result.errors).join(' ')); return; }
    if (result.status === 'failed') { setError(result.error.message); return; }
    await load();
  };

  const handleAddRow = async () => {
    setError('');
    if (!newRow.label.trim()) { setError('La fila necesita un concepto.'); return; }

    const target = await ensureStructure();
    if (!target) return;

    const code = newRow.code.trim()
      || newRow.label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 40);

    const result = await addRow(target.id, { ...newRow, code });
    if (result.error) { setError(result.error); return; }
    setNewRow(emptyRow());
    await load();
  };

  const handleImport = async (imported: CostRowInput[], mode: 'replace' | 'append') => {
    const target = await ensureStructure();
    if (!target) throw new Error('No se pudo crear la estructura de costos.');

    const result = await importRows(target.id, imported, mode);
    if (result.error) throw new Error(result.error);

    await registrarEvento({
      entidad: 'cost_structure',
      entidadId: target.id,
      accion: 'UPDATE',
      usuario: 'Usuario simulado',
      rol: obtenerRolActivo(),
      despues: { filas_importadas: result.inserted, modo: mode },
      motivo: `Importación de planilla (${mode === 'replace' ? 'reemplazo' : 'agregado'})`,
    });

    await load();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Estructura de costos — {party.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cuánto le cuesta a la empresa operar un viaje de esta compañía. No se le cobra al
              transportista: se usa para el margen.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
          )}

          {/* ── Parámetros ─────────────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <Input
              label="Nombre"
              value={meta.name}
              onChange={(e) => setMeta({ ...meta, name: e.target.value })}
            />
            <Input
              label="Días operativos por mes"
              type="number"
              value={String(meta.operatingDaysPerMonth)}
              onChange={(e) => setMeta({ ...meta, operatingDaysPerMonth: Number(e.target.value) })}
            />
            <Button variant="secondary" onClick={() => void handleSaveMeta()}>
              <i className="ri-save-line mr-1"></i> Guardar parámetros
            </Button>
          </div>
          <p className="text-xs text-slate-500 -mt-3">
            Los días operativos son el divisor de los conceptos <strong>mensuales</strong>: un salario
            mensual se reparte entre ellos y se cobran los días que dura el viaje.
          </p>

          {/* ── Acciones ───────────────────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3 border-y border-slate-100 py-3">
            <Button onClick={() => setIsImportOpen(true)}>
              <i className="ri-file-excel-2-line mr-1"></i> Importar planilla
            </Button>
            {totals.length > 0 && (
              <div className="flex flex-wrap gap-2 ml-auto text-xs">
                {totals.map(([driver, sum]) => (
                  <Badge key={driver} variant="default" size="sm">
                    {COST_DRIVER_LABELS[driver]}: {sum.toLocaleString('es-CR', { minimumFractionDigits: 2 })} {currencyLabel}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* ── Alta manual ────────────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end bg-slate-50 rounded-lg p-3">
            <div className="md:col-span-2">
              <Input
                label="Concepto"
                value={newRow.label}
                onChange={(e) => setNewRow({ ...newRow, label: e.target.value })}
                placeholder="Salario del chofer"
              />
            </div>
            <Select
              label="Cómo se cobra"
              value={newRow.driver}
              onChange={(e) => setNewRow({ ...newRow, driver: e.target.value as CostDriver })}
              options={DRIVER_OPTIONS}
            />
            <Input
              label={`Importe (${currencyLabel})`}
              value={newRow.amount}
              onChange={(e) => setNewRow({ ...newRow, amount: e.target.value })}
            />
            <Select
              label="Efecto"
              value={newRow.sign}
              onChange={(e) => setNewRow({ ...newRow, sign: e.target.value as 'ADD' | 'SUBTRACT' })}
              options={[{ value: 'ADD', label: 'Suma' }, { value: 'SUBTRACT', label: 'Resta' }]}
            />
            <Button variant="secondary" onClick={() => void handleAddRow()}>
              <i className="ri-add-line mr-1"></i> Agregar
            </Button>
          </div>

          {/* ── Filas ──────────────────────────────────────────────────────────────────── */}
          {loading ? (
            <p className="text-sm text-slate-500 py-8 text-center">Cargando…</p>
          ) : rows.length === 0 ? (
            <div className="text-center py-10">
              <i className="ri-table-line text-4xl text-slate-300"></i>
              <p className="mt-2 text-sm text-slate-600 font-medium">Todavía no hay conceptos cargados</p>
              <p className="text-xs text-slate-500">
                Importá la planilla que ya usás, o cargá los conceptos a mano.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500 uppercase">
                    <th className="px-3 py-2">Concepto</th>
                    <th className="px-3 py-2">Cómo se cobra</th>
                    <th className="px-3 py-2 text-right">Importe</th>
                    <th className="px-3 py-2">Efecto</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id} className={row.active ? '' : 'bg-slate-50/60'}>
                      <td className="px-3 py-2">
                        <div className="text-slate-800">{row.label}</div>
                        <div className="text-[11px] font-mono text-slate-400">{row.code}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={row.driver}
                          onChange={async (e) => {
                            await updateRow(row.id, { driver: e.target.value as CostDriver });
                            await load();
                          }}
                          options={DRIVER_OPTIONS}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          defaultValue={row.amount}
                          onBlur={async (e) => {
                            if (e.target.value === row.amount) return;
                            await updateRow(row.id, { amount: e.target.value });
                            await load();
                          }}
                          className="w-28 text-right px-2 py-1 border border-slate-200 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                        {row.unit && <div className="text-[11px] text-slate-400">{row.unit}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={row.sign === 'SUBTRACT' ? 'warning' : 'default'} size="sm">
                          {row.sign === 'SUBTRACT' ? 'Resta' : 'Suma'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={row.active ? 'success' : 'default'} size="sm">
                          {row.active ? 'Activa' : 'De baja'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => { await updateRow(row.id, { active: !row.active }); await load(); }}
                            title={row.active ? 'Dar de baja' : 'Reactivar'}
                          >
                            <i className={row.active ? 'ri-forbid-line' : 'ri-refresh-line'}></i>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (!window.confirm(`¿Eliminar "${row.label}"?`)) return;
                              await deleteRow(row.id);
                              await load();
                            }}
                            title="Eliminar"
                          >
                            <i className="ri-delete-bin-line"></i>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white flex justify-end px-6 py-4 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>

      <ImportSheetWizard
        isOpen={isImportOpen}
        structureName={meta.name}
        onClose={() => setIsImportOpen(false)}
        onImport={handleImport}
      />
    </div>
  );
}
