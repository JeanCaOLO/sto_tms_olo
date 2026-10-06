// Estructura de costos de una compañía: la tabla editable, fila por fila, con importación.
//
// Reemplaza al modelo de tres campos que había en Reglas de Tarifa → Costos. Una estructura real
// tiene decenas de conceptos y cada uno se prorratea distinto; eso es una tabla, no tres casillas.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import ImportSheetWizard from './ImportSheetWizard';
import CostTemplateModal, { downloadCostTemplate } from '../../../components/tarifas/CostTemplateModal';
import { CostRowsTable, TruckSummaryTable } from '../../../components/tarifas/CostStructureParts';
import { summarize } from '../../../lib/tarifas/costTemplate';
import { listTruckTypes } from '../../../lib/tarifas/vehiclesDataSource';
import { listPartyVariables } from '../../../lib/tarifas/partyVariablesDataSource';
import {
  activeStructure, addRow, deleteRow, importRows, saveStructure, updateRow,
  listRows, type CostRowInput,
} from '../../../lib/tarifas/costStructureDataSource';
import { COST_DRIVER_LABELS } from '../../../lib/tarifas/cost';
import type { CostDriver, CostStructure, CostStructureRow, PartyVariable } from '../../../lib/tarifas/types';
import { ensurePartyProfile } from '../../../lib/tarifas/partiesDataSource';
import type { CarrierProfile } from '../../../lib/tarifas/parties';
import { registrarEvento } from '../../../lib/liquidador/auditLog';
import { getActorRole } from '../../../lib/tarifas/actor';
import { useModulePermissions } from '../../../hooks/use-module-permissions';

interface Props {
  isOpen: boolean;
  party: CarrierProfile | null;
  /** Moneda local del país de la compañía, para rotular los importes. */
  /** Moneda del país: los importes de la estructura están escritos en ella. */
  currency: string;
  onClose: () => void;
  /** Se llama cuando se creó el perfil de cálculo del transportista, para refrescar la lista. */
  onProfileCreated?: () => void;
}

const SYSTEM_DRIVER_OPTIONS = (Object.keys(COST_DRIVER_LABELS) as CostDriver[])
  .map((d) => ({ value: d as string, label: COST_DRIVER_LABELS[d as keyof typeof COST_DRIVER_LABELS] }));

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
  isOpen, party, currency, onClose, onProfileCreated,
}: Props) {
  const { canCreate, canEdit, canDelete } = useModulePermissions('tarifas.config');
  const [structure, setStructure] = useState<CostStructure | null>(null);
  const [rows, setRows] = useState<CostStructureRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [newRow, setNewRow] = useState<CostRowInput>(emptyRow());
  const [partyId, setPartyId] = useState<string | null>(null);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [editing, setEditing] = useState<CostStructureRow | null>(null);
  const [truckTypes, setTruckTypes] = useState<string[]>([]);
  const [variables, setVariables] = useState<PartyVariable[]>([]);
  // La estructura del país, que la compañía usa mientras no tenga una propia.
  const [inherited, setInherited] = useState<{ structure: CostStructure; rows: CostStructureRow[] } | null>(null);
  const [copying, setCopying] = useState(false);

  const [meta, setMeta] = useState({
    name: 'Estructura de costos',
    operatingDaysPerMonth: 30,
  });

  const load = useCallback(async () => {
    if (!party) return;
    setLoading(true);
    setError('');
    try {
      let existing: CostStructure | null = null;
      if (partyId) {
        // Variables NUMBER activas: pueden ser el driver de una fila (`custom:*`).
        const vars = await listPartyVariables(partyId);
        setVariables(vars.filter((v) => v.kind === 'NUMBER'));
        existing = await activeStructure(partyId);
      } else {
        setVariables([]);
      }
      setStructure(existing);
      setRows(existing ? await listRows(existing.id) : []);
      if (existing) {
        setMeta({
          name: existing.name,
          operatingDaysPerMonth: existing.operatingDaysPerMonth,
        });
      }

      // Sin estructura propia vale la del país (la que se carga en Reglas de Tarifa → Costos): se
      // muestra para que se vea qué se liquida hoy.
      if (!existing && party.countryId) {
        const base = await activeStructure(null, party.countryId);
        setInherited(base ? { structure: base, rows: await listRows(base.id) } : null);
      } else {
        setInherited(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [party, partyId]);

  useEffect(() => {
    if (!isOpen || !party) return;
    setNewRow(emptyRow());
    setEditing(null);
    setPartyId(party.partyId);
  }, [isOpen, party]);

  useEffect(() => {
    if (isOpen && party) void load();
  }, [isOpen, party, load]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    listTruckTypes()
      .then((t) => { if (!cancelled) setTruckTypes(t.map((x) => x.code)); })
      .catch(() => { if (!cancelled) setTruckTypes([]); });
    return () => { cancelled = true; };
  }, [isOpen]);

  const driverOptions = useMemo(() => [
    ...SYSTEM_DRIVER_OPTIONS,
    ...variables.map((v) => ({ value: v.key as string, label: `${v.label} (variable de la compañía)` })),
  ], [variables]);
  const customLabels = useMemo(
    () => Object.fromEntries(variables.map((v) => [v.key, v.label])) as Record<string, string>,
    [variables],
  );
  const shown = structure
    ? { structure, rows }
    : inherited
      ? { structure: inherited.structure, rows: inherited.rows }
      : null;
  const summary = useMemo(
    () => (shown ? summarize(shown.rows.filter((r) => r.active), shown.structure.params, shown.structure.operatingDaysPerMonth) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structure, rows, inherited],
  );

  const currencyLabel = currency;

  if (!isOpen || !party) return null;

  const ensureStructure = async (): Promise<CostStructure | null> => {
    if (structure) return structure;

    let targetId = partyId;
    if (!targetId) {
      const profile = await ensurePartyProfile(party.carrierId);
      if (profile.status === 'failed') { setError(profile.error.message); return null; }
      targetId = profile.partyId;
      setPartyId(targetId);
      if (profile.created) onProfileCreated?.();
    }

    const result = await saveStructure({
      partyId: targetId,
      countryId: party.countryId ?? '',
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

  // Parte de la estructura del país: la copia como propia para poder cambiarla sin tocar la del país.
  const handleCopyFromCountry = async () => {
    if (!inherited || !party) return;
    setError('');
    setCopying(true);
    try {
      let targetId = partyId;
      if (!targetId) {
        const profile = await ensurePartyProfile(party.carrierId);
        if (profile.status === 'failed') { setError(profile.error.message); return; }
        targetId = profile.partyId;
        setPartyId(targetId);
        if (profile.created) onProfileCreated?.();
      }
      const saved = await saveStructure({
        partyId: targetId,
        countryId: party.countryId ?? '',
        name: `${inherited.structure.name} (propia)`,
        operatingDaysPerMonth: inherited.structure.operatingDaysPerMonth,
        params: inherited.structure.params,
        effectiveFrom: null,
        active: true,
        notes: 'Copiada de la estructura del país',
      });
      if (saved.status !== 'saved') {
        setError(saved.status === 'invalid' ? Object.values(saved.errors).join(' ') : saved.error.message);
        return;
      }
      const copied = await importRows(saved.structure.id, inherited.rows.map((r) => ({
        code: r.code, label: r.label, driver: r.driver, amount: r.amount, sign: r.sign,
        appliesWhen: r.appliesWhen, unit: r.unit, active: r.active, group: r.group,
        frequency: r.frequency, frequencyQty: r.frequencyQty, unitQty: r.unitQty,
        costPerKm: r.costPerKm, truckType: r.truckType,
      })), 'replace');
      if (copied.error) { setError(copied.error); return; }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCopying(false);
    }
  };

  const handleSaveMeta = async () => {
    setError('');
    try {
      const target = structure ?? await ensureStructure();
      if (!target) return;
      const result = await saveStructure({
        partyId: target.partyId,
        countryId: party.countryId ?? '',
        name: meta.name,
        operatingDaysPerMonth: meta.operatingDaysPerMonth,
        params: target.params,
        effectiveFrom: target.effectiveFrom ?? null,
        active: true,
        notes: target.notes ?? null,
      }, target.id);

      if (result.status === 'invalid') { setError(Object.values(result.errors).join(' ')); return; }
      if (result.status === 'failed') { setError(result.error.message); return; }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const startEdit = (row: CostStructureRow) => {
    setEditing(row);
    setNewRow({
      code: row.code, label: row.label, driver: row.driver, amount: row.amount, sign: row.sign,
      appliesWhen: row.appliesWhen, unit: row.unit, active: row.active, group: row.group,
      frequency: row.frequency, frequencyQty: row.frequencyQty, unitQty: row.unitQty,
      costPerKm: row.costPerKm, truckType: row.truckType,
    });
  };

  const cancelEdit = () => { setEditing(null); setNewRow(emptyRow()); };

  // Crear una estructura propia con una sola fila taparía a la del país y dejaría el costo casi en cero.
  const blockedByInherited = !structure && !!inherited && party.classification === 'OWN';
  const INHERITED_MESSAGE = 'Esta compañía usa la estructura del país. Antes de agregar conceptos, creá una propia a '
    + 'partir de la del país (botón de arriba) o subí la plantilla completa.';

  const handleSubmitRow = async () => {
    setError('');
    if (blockedByInherited && !editing) { setError(INHERITED_MESSAGE); return; }
    if (!newRow.label.trim()) { setError('La fila necesita un concepto.'); return; }
    const amount = newRow.amount.trim();
    if (amount === '' || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
      setError('El importe debe ser un número de cero o más.');
      return;
    }
    const truckType = newRow.truckType || null;

    try {
      if (editing) {
        const truckChanged = (editing.truckType ?? null) !== truckType;
        if (truckChanged) {
          // `updateRow` no cambia el tipo de camión: se recrea la fila con el valor nuevo.
          const removed = await deleteRow(editing.id);
          if (removed.error) { setError(removed.error); return; }
          const created = await addRow(editing.structureId, { ...newRow, amount, truckType });
          if (created.error) { setError(created.error); return; }
        } else {
          const result = await updateRow(editing.id, {
            label: newRow.label.trim(), driver: newRow.driver, amount, sign: newRow.sign,
          });
          if (result.error) { setError(result.error); return; }
        }
        cancelEdit();
        await load();
        return;
      }

      const target = await ensureStructure();
      if (!target) return;
      const code = newRow.code.trim()
        || newRow.label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 40);
      const result = await addRow(target.id, { ...newRow, amount, code, truckType });
      if (result.error) { setError(result.error); return; }
      setNewRow(emptyRow());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRowAction = async (action: () => Promise<{ error: string | null }>) => {
    setError('');
    try {
      const result = await action();
      if (result.error) { setError(result.error); return; }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Subir plantilla necesita el perfil de cálculo de la compañía (puede no existir todavía).
  const handleOpenTemplate = async () => {
    setError('');
    try {
      if (!partyId) {
        const profile = await ensurePartyProfile(party.carrierId);
        if (profile.status === 'failed') { setError(profile.error.message); return; }
        setPartyId(profile.partyId);
        if (profile.created) onProfileCreated?.();
      }
      setIsTemplateOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleImport = async (imported: CostRowInput[], mode: 'replace' | 'append') => {
    if (blockedByInherited) throw new Error(INHERITED_MESSAGE);
    const target = await ensureStructure();
    if (!target) throw new Error('No se pudo crear la estructura de costos.');

    const result = await importRows(target.id, imported, mode);
    if (result.error) throw new Error(result.error);

    await registrarEvento({
      entidad: 'cost_structure',
      entidadId: target.id,
      accion: 'UPDATE',
      usuario: 'Usuario simulado',
      rol: getActorRole(),
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
              {party.classification === 'OWN'
                ? 'Los gastos de operar un viaje de esta flota propia. Se acumulan y es lo que se liquida y se envía a cuentas por pagar.'
                : 'Un tercero se liquida con reglas y tarifarios, no con una estructura de costos. Esta pantalla solo la muestra como referencia.'}
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

          {!structure && !loading && (
            inherited ? (
              <div className="bg-teal-50 border border-teal-200 text-teal-800 text-sm rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
                <i className="ri-global-line text-lg"></i>
                <div className="flex-1 min-w-[260px]">
                  <strong>
                    {party.classification === 'OWN'
                      ? 'Esta compañía usa la estructura de costos del país'
                      : 'Estructura de costos del país (solo referencia)'}
                  </strong>
                  {` «${inherited.structure.name}», con ${inherited.rows.filter((r) => r.active).length} conceptos activos. `}
                  {party.classification === 'OWN'
                    ? 'Es la que se liquida hoy. Si esta compañía necesita otra, copiala y ajustala.'
                    : 'Los terceros no se liquidan con ella.'}
                </div>
                {party.classification === 'OWN' && (
                  <Button variant="secondary" onClick={() => void handleCopyFromCountry()} disabled={!canEdit || copying}
                    title={!canEdit ? 'Tu rol no puede editar costos' : 'Crea una estructura propia con los mismos conceptos'}>
                    <i className="ri-file-copy-line mr-1"></i>{copying ? 'Copiando…' : 'Crear una propia a partir de la del país'}
                  </Button>
                )}
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
                <i className="ri-error-warning-line mr-1"></i>
                Ni esta compañía ni el país tienen estructura de costos cargada.
                {party.classification === 'OWN' && ' Hasta que se cargue una, no se puede liquidar a la flota propia.'}
              </div>
            )
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
            <Button onClick={() => void handleOpenTemplate()} disabled={!canEdit} title={!canEdit ? 'Tu rol no puede editar costos' : undefined}>
              <i className="ri-file-upload-line mr-1"></i> Subir plantilla
            </Button>
            <Button variant="secondary" onClick={downloadCostTemplate}>
              <i className="ri-download-2-line mr-1"></i> Descargar plantilla
            </Button>
            <Button variant="secondary" onClick={() => setIsImportOpen(true)}>
              <i className="ri-file-excel-2-line mr-1"></i> Importar una hoja suelta
            </Button>
            <p className="text-xs text-slate-500 basis-full">
              La plantilla reemplaza toda la estructura de esta compañía. La hoja suelta agrega o reemplaza
              conceptos de un solo tipo de cobro (por ejemplo, una lista de importes fijos).
            </p>
          </div>

          {/* ── Alta / edición manual ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end bg-slate-50 rounded-lg p-3">
            <div className="md:col-span-2">
              <Input
                label={editing ? 'Concepto (editando)' : 'Concepto'}
                value={newRow.label}
                onChange={(e) => setNewRow({ ...newRow, label: e.target.value })}
                placeholder="Salario del chofer"
              />
            </div>
            <Select
              label="Cómo se cobra"
              value={newRow.driver}
              disabled={!!editing?.frequency}
              onChange={(e) => setNewRow({ ...newRow, driver: e.target.value as CostDriver })}
              options={driverOptions}
            />
            <Input
              label={`Importe (${currencyLabel})`}
              value={newRow.amount}
              disabled={!!editing?.frequency}
              onChange={(e) => setNewRow({ ...newRow, amount: e.target.value })}
            />
            <Select
              label="Efecto"
              value={newRow.sign}
              onChange={(e) => setNewRow({ ...newRow, sign: e.target.value as 'ADD' | 'SUBTRACT' })}
              options={[{ value: 'ADD', label: 'Suma' }, { value: 'SUBTRACT', label: 'Resta' }]}
            />
            <Select
              label="Aplica cuando"
              value={newRow.truckType ?? ''}
              onChange={(e) => setNewRow({ ...newRow, truckType: e.target.value || null })}
              options={[
                { value: '', label: 'Siempre' },
                ...truckTypes.map((t) => ({ value: t, label: `Solo para ${t}` })),
                ...(newRow.truckType && !truckTypes.includes(newRow.truckType)
                  ? [{ value: newRow.truckType, label: `Solo para ${newRow.truckType}` }] : []),
              ]}
            />
            <div className="md:col-span-6 flex items-center gap-2">
              <Button variant="secondary" onClick={() => void handleSubmitRow()} disabled={editing ? !canEdit : !canCreate} title={(editing ? !canEdit : !canCreate) ? 'Tu rol no puede modificar costos' : undefined}>
                <i className={`${editing ? 'ri-save-line' : 'ri-add-line'} mr-1`}></i> {editing ? 'Guardar cambios' : 'Agregar'}
              </Button>
              {editing && <Button variant="ghost" onClick={cancelEdit}>Cancelar</Button>}
              {editing?.frequency && (
                <span className="text-xs text-slate-500">
                  Esta fila se repite cada cierto tiempo: para cambiar su importe o frecuencia, volvé a subir la plantilla.
                </span>
              )}
            </div>
          </div>

          {/* ── Filas ──────────────────────────────────────────────────────────────────── */}
          <CostRowsTable
            rows={structure ? rows : inherited?.rows ?? []}
            loading={loading}
            customLabels={customLabels}
            exportFileName="estructura_costos_compania"
            emptyMessage="Todavía no hay conceptos cargados: subí la plantilla o cargalos a mano."
            actions={!structure ? undefined : (row) => (
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => startEdit(row)} disabled={!canEdit} title={canEdit ? 'Editar' : 'Tu rol no puede editar costos'}>
                  <i className="ri-edit-line"></i>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleRowAction(() => updateRow(row.id, { active: !row.active }))}
                  disabled={!canEdit}
                  title={!canEdit ? 'Tu rol no puede editar costos' : row.active ? 'Dar de baja' : 'Reactivar'}
                >
                  <i className={row.active ? 'ri-forbid-line' : 'ri-refresh-line'}></i>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!window.confirm(`¿Eliminar "${row.label}"?`)) return;
                    void handleRowAction(() => deleteRow(row.id));
                  }}
                  disabled={!canDelete}
                  title={canDelete ? 'Eliminar' : 'Tu rol no puede eliminar costos'}
                >
                  <i className="ri-delete-bin-line"></i>
                </Button>
              </div>
            )}
          />

          {summary.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Resumen por tipo de camión ({currencyLabel})</h3>
              <TruckSummaryTable summary={summary} exportFileName="resumen_costos_por_camion" />
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white flex justify-end px-6 py-4 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>

      <CostTemplateModal
        isOpen={isTemplateOpen}
        partyId={partyId}
        countryId={party.countryId ?? ''}
        structureName={structure?.name ?? meta.name}
        scopeLabel={`la estructura de costos de ${party.name}`}
        currency={currencyLabel}
        onClose={() => setIsTemplateOpen(false)}
        onApplied={() => { void load(); }}
      />

      <ImportSheetWizard
        isOpen={isImportOpen}
        structureName={meta.name}
        onClose={() => setIsImportOpen(false)}
        onImport={handleImport}
      />
    </div>
  );
}
