// Tarifarios: la mitad TABULAR del motor.
//
// El caso que resuelve: 5 zonas × 4 camiones son 20 combinaciones. Con una regla por combinación
// son 20 reglas para mantener; acá son 20 FILAS de una planilla, que es como el tarifario llega
// del transportista y como la gente lo piensa.
//
// El comodín `*` es lo que evita cargar la matriz completa: se escriben las excepciones y una fila
// general al final. Gana siempre la fila MÁS ESPECÍFICA —la que resuelve más columnas con un valor
// exacto—, así que el orden de carga no cambia el resultado.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '../../../components/base/Card';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Badge from '../../../components/base/Badge';
import HelpButton from './HelpButton';
import RateTableModal from './RateTableModal';
import ImportRateTableModal from './ImportRateTableModal';
import { VAR_KEY_LABELS } from '../../../lib/tarifas/format';
import {
  deleteRateRow, deleteRateTable, isRangeKeyVar, listRateTableRows, listRateTables, saveRateRow,
  setRateTableActive, type RateRowErrors,
} from '../../../lib/tarifas/rateTablesDataSource';
import { listCarrierProfiles } from '../../../lib/tarifas/partiesDataSource';
import { listTruckTypes } from '../../../lib/tarifas/vehiclesDataSource';
import { RATE_TABLE_WILDCARD, type RateTable, type RateTableRow, type VarKey } from '../../../lib/tarifas/types';
import type { CarrierProfile } from '../../../lib/tarifas/parties';
import { useModulePermissions } from '../../../hooks/use-module-permissions';

interface Props {
  /** País activo del módulo. El ámbito es global. */
  countryId: string;
  /** Moneda del país, para rotular los importes. */
  currency?: string;
  /** Zonas del país, para sugerir valores en las columnas de zona. */
  zones: { id: string; code: string; name: string; zone_groups?: { name: string | null } | null }[];
  /**
   * Acota la vista a los tarifarios de UNA compañía.
   *
   * Existe porque cada transportista cubre sus rutas a sus propios precios: abierto desde su ficha,
   * no tiene sentido mostrarle los de los demás ni pedirle que elija el alcance en cada alta.
   */
  partyId?: string;
}

const varLabelOf = (key: VarKey) => VAR_KEY_LABELS[key as keyof typeof VAR_KEY_LABELS] ?? key;

export default function TarifariosTab({ countryId, currency, zones, partyId }: Props) {
  const { canCreate, canEdit, canDelete } = useModulePermissions('tarifas.config');
  const [tables, setTables] = useState<RateTable[]>([]);
  const [parties, setParties] = useState<CarrierProfile[]>([]);
  const [truckCodes, setTruckCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<RateTableRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);

  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<RateTable | null>(null);

  const [draftKey, setDraftKey] = useState<string[]>([]);
  const [draftAmount, setDraftAmount] = useState('');
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<RateRowErrors>({});
  const [generalError, setGeneralError] = useState('');

  const selected = useMemo(
    () => tables.find((t) => t.id === selectedId) ?? null,
    [tables, selectedId],
  );

  const loadTables = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const todos = await listRateTables(countryId, { includeInactive: true });
      // Dentro de la ficha de una compañía: los suyos MÁS los del país, que también la alcanzan.
      setTables(partyId ? todos.filter((t) => t.partyId === partyId || !t.partyId) : todos);
    } catch (error) {
      console.error('Error cargando tarifarios:', error);
      setLoadError('No se pudieron cargar los tarifarios.');
    } finally {
      setLoading(false);
    }
  }, [countryId, partyId]);

  const loadRows = useCallback(async (tableId: string) => {
    setLoadingRows(true);
    try {
      setRows(await listRateTableRows(tableId));
    } catch (error) {
      console.error('Error cargando filas del tarifario:', error);
      setGeneralError('No se pudieron cargar las filas del tarifario.');
    } finally {
      setLoadingRows(false);
    }
  }, []);

  useEffect(() => { void loadTables(); }, [loadTables]);

  useEffect(() => {
    void listCarrierProfiles({ countryId, includeInactive: true }).then(setParties).catch((error) => {
      console.error('Error cargando compañías:', error);
      setParties([]);
    });
  }, [countryId]);

  // El tarifario cambió: se limpia el borrador para no arrastrar la clave del anterior.
  useEffect(() => {
    if (!selected) { setRows([]); return; }
    setDraftKey(selected.keyColumns.map(() => ''));
    setDraftAmount('');
    setEditingRowId(null);
    setRowErrors({});
    void loadRows(selected.id);
  }, [selected, loadRows]);

  // Tipos de camión del catálogo de vehículos (los de la compañía dueña si el tarifario es suyo).
  useEffect(() => {
    if (!selected) { setTruckCodes([]); return; }
    const carrierId = parties.find((p) => p.partyId && p.partyId === selected.partyId)?.carrierId;
    void listTruckTypes(carrierId ? { carrierId } : undefined)
      .then((v) => setTruckCodes(v.map((t) => t.code)))
      .catch((error) => {
        console.error('Error cargando tipos de camión:', error);
        setTruckCodes([]);
      });
  }, [selected, parties]);

  const partyName = (id: string | null) => parties.find((p) => p.partyId === id)?.name ?? id;

  /**
   * Valores que tienen sentido en una columna. No restringe —un tarifario puede nombrar algo que
   * todavía no está cargado— pero evita el error más común, que es teclear el código mal.
   */
  const sugerenciasDe = (column: VarKey): string[] => {
    switch (column) {
      case 'originZone':
      case 'destZone':
        return zones.map((z) => z.code);
      case 'originZoneGroup':
      case 'destZoneGroup':
        return [...new Set(zones.map((z) => z.zone_groups?.name).filter(Boolean) as string[])];
      case 'truckTypeId':
        return truckCodes;
      case 'carrierId':
        return parties.map((p) => p.carrierId);
      case 'fleetType':
        return ['PROPIA', 'TERCERO'];
      default:
        return [];
    }
  };

  const resetDraft = () => {
    setDraftKey(selected ? selected.keyColumns.map(() => '') : []);
    setDraftAmount('');
    setEditingRowId(null);
    setRowErrors({});
  };

  const startEditRow = (row: RateTableRow) => {
    if (!selected) return;
    setEditingRowId(row.id);
    setRowErrors({});
    setGeneralError('');
    setDraftKey(selected.keyColumns.map((_c, i) => {
      const value = row.key[i] ?? '';
      return value === RATE_TABLE_WILDCARD ? '' : value;
    }));
    setDraftAmount(row.amount);
  };

  const handleSaveRow = async () => {
    if (!selected) return;
    setGeneralError('');
    const result = await saveRateRow(
      { tableId: selected.id, key: draftKey, amount: draftAmount, active: true },
      editingRowId ?? undefined,
    );

    if (result.status === 'invalid') { setRowErrors(result.errors); return; }
    if (result.status === 'failed') { setGeneralError(result.error.message); return; }
    resetDraft();
    await loadRows(selected.id);
  };

  const comodines = (row: RateTableRow) =>
    row.key.filter((v) => v === RATE_TABLE_WILDCARD).length;

  const handleToggleTable = async (t: RateTable) => {
    try {
      await setRateTableActive(t.id, !t.active);
      await loadTables();
    } catch (error) {
      console.error('Error cambiando estado del tarifario:', error);
      setLoadError('No se pudo cambiar el estado del tarifario.');
    }
  };

  const handleDeleteTable = async (t: RateTable) => {
    if (!window.confirm(
      `¿Eliminar "${t.code}" y todas sus filas? Las reglas que lo nombren van a usar su importe de respaldo.`,
    )) return;
    try {
      await deleteRateTable(t.id);
      if (selectedId === t.id) setSelectedId(null);
      await loadTables();
    } catch (error) {
      console.error('Error eliminando tarifario:', error);
      setLoadError('No se pudo eliminar el tarifario.');
    }
  };

  const handleDeleteRow = async (row: RateTableRow) => {
    if (!selected) return;
    try {
      await deleteRateRow(row.id);
      if (editingRowId === row.id) resetDraft();
      await loadRows(selected.id);
    } catch (error) {
      console.error('Error eliminando fila:', error);
      setGeneralError('No se pudo eliminar la fila.');
    }
  };

  const tableColumns: DataTableColumn<RateTable>[] = [
    {
      key: 'code', header: 'Código', accessor: (t) => t.code, sortable: true,
      render: (t) => <span className="font-mono text-teal-700">{t.code}</span>,
    },
    { key: 'name', header: 'Nombre', accessor: (t) => t.name, sortable: true },
    {
      key: 'key', header: 'Clave', accessor: (t) => t.keyColumns.map(varLabelOf).join(' · '),
      render: (t) => <span className="text-xs text-slate-600">{t.keyColumns.map(varLabelOf).join(' · ')}</span>,
    },
    {
      key: 'scope', header: 'Alcance', sortable: true, filterable: true,
      accessor: (t) => (t.partyId ? String(partyName(t.partyId)) : 'Todo el país'),
      render: (t) => (t.partyId
        ? <Badge variant="info">{partyName(t.partyId)}</Badge>
        : <Badge variant="default">Todo el país</Badge>),
    },
    {
      key: 'active', header: 'Estado', sortable: true, filterable: true,
      accessor: (t) => (t.active ? 'Activo' : 'Inactivo'),
      render: (t) => <Badge variant={t.active ? 'success' : 'default'}>{t.active ? 'Activo' : 'Inactivo'}</Badge>,
    },
  ];

  const rowColumns: DataTableColumn<RateTableRow>[] = selected ? [
    ...selected.keyColumns.map((c, i): DataTableColumn<RateTableRow> => ({
      key: `k${i}`, header: varLabelOf(c), sortable: true, filterable: true,
      accessor: (r) => r.key[i] ?? RATE_TABLE_WILDCARD,
      render: (r) => {
        const value = r.key[i] ?? RATE_TABLE_WILDCARD;
        return value === RATE_TABLE_WILDCARD
          ? <span className="text-slate-400 font-mono" title="Cualquier valor">*</span>
          : <span className="font-mono text-xs text-slate-700">{value}</span>;
      },
    })),
    {
      key: 'amount', header: 'Importe', align: 'right', sortable: true,
      accessor: (r) => Number(r.amount),
      render: (r) => <span className="font-medium text-slate-800">{r.amount}</span>,
    },
    {
      key: 'scope', header: 'Alcance', filterable: true,
      accessor: (r) => (comodines(r) === 0 ? 'Exacta'
        : comodines(r) === selected.keyColumns.length ? 'Todos los casos' : 'Parcial'),
      render: (r) => (comodines(r) === 0 ? (
        <Badge variant="info">Exacta</Badge>
      ) : comodines(r) === selected.keyColumns.length ? (
        <Badge variant="warning">Todos los casos</Badge>
      ) : (
        <span className="text-xs text-slate-500">
          {selected.keyColumns.length - comodines(r)} de {selected.keyColumns.length} columnas
        </span>
      )),
    },
  ] : [];

  return (
    <div className="space-y-6">
      {/* ── Lista de tarifarios ──────────────────────────────────────────────────────────────── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-700">Tarifarios</h3>
            <HelpButton
              title="Tarifarios"
              steps={[
                'Un tarifario es una planilla: se declara qué variables forman su clave (zona, tipo de camión, tipo de servicio…) y se carga una fila por combinación con su importe.',
                'Para usarlo, una regla tiene que elegirlo con el operador "Tarifa de tabla". La regla define además el importe de respaldo por si el viaje no casa ninguna fila.',
                'El asterisco (*) en una celda significa "cualquier valor". Sirve para escribir solo las excepciones más una fila general al final, en vez de la matriz completa.',
                'Cuando varias filas cubren el mismo viaje gana la MÁS ESPECÍFICA: la que resuelve más columnas con un valor exacto. El orden de carga no cambia el resultado.',
              ]}
            />
          </div>
          <Button onClick={() => { setEditingTable(null); setIsTableModalOpen(true); }} disabled={!canCreate} title={!canCreate ? 'Tu rol no puede crear tarifarios' : undefined}>
            <i className="ri-add-line mr-1"></i>Nuevo tarifario
          </Button>
        </div>

        {loadError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">{loadError}</div>
        )}
        <DataTable
          data={tables}
          columns={tableColumns}
          getRowId={(t) => t.id}
          loading={loading}
          searchPlaceholder="Buscar tarifario..."
          exportFileName="tarifarios"
          emptyMessage="No hay tarifarios en este país. Un tarifario reemplaza a un montón de reglas casi iguales: 5 zonas x 4 camiones son 20 filas de una planilla."
          selectedRowId={selectedId}
          onRowClick={(t) => setSelectedId(t.id === selectedId ? null : t.id)}
          actions={(t) => (
            <>
              <button
                onClick={() => { setEditingTable(t); setIsTableModalOpen(true); }}
                disabled={!canEdit}
                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title={canEdit ? 'Editar' : 'Tu rol no puede editar tarifarios'}
              >
                <i className="ri-edit-line"></i>
              </button>
              <button
                onClick={() => void handleToggleTable(t)}
                disabled={!canEdit}
                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title={!canEdit ? 'Tu rol no puede editar tarifarios' : t.active ? 'Desactivar' : 'Reactivar'}
              >
                <i className={t.active ? 'ri-forbid-line' : 'ri-refresh-line'}></i>
              </button>
              <button
                onClick={() => void handleDeleteTable(t)}
                disabled={!canDelete}
                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title={canDelete ? 'Eliminar' : 'Tu rol no puede eliminar tarifarios'}
              >
                <i className="ri-delete-bin-line"></i>
              </button>
            </>
          )}
        />
        {!selected && tables.length > 0 && (
          <p className="text-xs text-slate-500 mt-3">
            <i className="ri-cursor-line mr-1"></i>
            Tocá un tarifario para ver y cargar sus filas.
          </p>
        )}
      </Card>

      {/* ── Filas del tarifario elegido ──────────────────────────────────────────────────────── */}
      {selected && (
        <Card>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-slate-700">
              Filas de <span className="font-mono text-teal-700">{selected.code}</span>
            </h3>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setIsImportOpen(true)}>
                <i className="ri-file-excel-2-line mr-1"></i>Importar planilla
              </Button>
              <button
                onClick={() => setSelectedId(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer w-8 h-8 flex items-center justify-center"
                title="Cerrar"
              >
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Dejá una celda <strong>vacía</strong> para que acepte cualquier valor — se guarda como{' '}
            <code className="font-mono">*</code>. Gana la fila que resuelva más columnas con un valor
            exacto.
          </p>

          {generalError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
              {generalError}
            </div>
          )}

          {/* Alta / edición */}
          <div className="border border-slate-200 rounded-lg p-4 mb-4">
            <h4 className="text-xs font-semibold text-slate-600 uppercase mb-3">
              {editingRowId ? 'Editar fila' : 'Nueva fila'}
            </h4>
            <div className="flex flex-wrap items-end gap-3">
              {selected.keyColumns.map((column, index) => {
                const sugerencias = sugerenciasDe(column);
                const listId = `rt-${selected.id}-${column}`;
                return (
                  <div key={column} className="min-w-[10rem] flex-1">
                    <Input
                      label={varLabelOf(column)}
                      value={draftKey[index] ?? ''}
                      onChange={(e) => {
                        const copia = [...draftKey];
                        copia[index] = e.target.value;
                        setDraftKey(copia);
                        setRowErrors((prev) => ({ ...prev, key: undefined }));
                      }}
                      placeholder={isRangeKeyVar(column) || column.startsWith('custom:') ? 'cualquiera · o rango 101..300' : 'cualquiera'}
                      list={sugerencias.length > 0 ? listId : undefined}
                    />
                    {sugerencias.length > 0 && (
                      <datalist id={listId}>
                        {sugerencias.map((s) => <option key={s} value={s} />)}
                      </datalist>
                    )}
                  </div>
                );
              })}
              <div className="min-w-[8rem]">
                <Input
                  label="Importe *"
                  value={draftAmount}
                  onChange={(e) => {
                    setDraftAmount(e.target.value);
                    setRowErrors((prev) => ({ ...prev, amount: undefined }));
                  }}
                  placeholder="1250.00"
                  error={rowErrors.amount}
                />
              </div>
              <div className="flex gap-2 pb-0.5">
                {editingRowId && (
                  <Button variant="secondary" onClick={resetDraft}>Cancelar</Button>
                )}
                <Button onClick={() => void handleSaveRow()} disabled={!canEdit} title={!canEdit ? 'Tu rol no puede editar tarifarios' : undefined}>
                  <i className={editingRowId ? 'ri-save-line mr-1' : 'ri-add-line mr-1'}></i>
                  {editingRowId ? 'Guardar' : 'Agregar'}
                </Button>
              </div>
            </div>
            {rowErrors.key && <p className="text-xs text-red-600 mt-2">{rowErrors.key}</p>}
          </div>

          {/* Listado */}
          <DataTable
            data={rows}
            columns={rowColumns}
            getRowId={(r) => r.id}
            loading={loadingRows}
            searchPlaceholder="Buscar fila..."
            exportFileName={`tarifario_${selected.code.toLowerCase()}_filas`}
            emptyMessage="Este tarifario no tiene filas. Mientras esté vacío, una regla que lo use cobra siempre su importe de respaldo."
            selectedRowId={editingRowId}
            actions={(row) => (
              <>
                <button
                  onClick={() => startEditRow(row)}
                  disabled={!canEdit}
                  className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title={canEdit ? 'Editar' : 'Tu rol no puede editar tarifarios'}
                >
                  <i className="ri-edit-line"></i>
                </button>
                <button
                  onClick={() => void handleDeleteRow(row)}
                  disabled={!canDelete}
                  className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title={canDelete ? 'Eliminar' : 'Tu rol no puede eliminar filas'}
                >
                  <i className="ri-delete-bin-line"></i>
                </button>
              </>
            )}
          />
        </Card>
      )}

      <RateTableModal
        isOpen={isTableModalOpen}
        countryId={countryId}
        table={editingTable}
        parties={parties}
        currency={currency}
        onClose={() => setIsTableModalOpen(false)}
        onSaved={async () => {
          await loadTables();
          if (selected) await loadRows(selected.id);
        }}
      />

      {selected && (
        <ImportRateTableModal
          isOpen={isImportOpen}
          table={selected}
          onClose={() => setIsImportOpen(false)}
          onImported={async () => { await loadRows(selected.id); }}
        />
      )}
    </div>
  );
}
