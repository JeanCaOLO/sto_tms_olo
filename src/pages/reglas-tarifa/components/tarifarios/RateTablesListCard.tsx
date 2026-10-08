// Tarjeta con la lista de tarifarios disponibles.

import { useMemo } from 'react';
import Card from '../../../../components/base/Card';
import DataTable, { type DataTableColumn } from '../../../../components/base/DataTable';
import Button from '../../../../components/base/Button';
import HelpButton from '../HelpButton';
import { rateTablesColumns } from './rateTablesColumns';
import { RateTableActions } from './RateTableActions';
import type { RateTable } from '../../../../lib/tarifas/types';
import type { CarrierProfile } from '../../../../lib/tarifas/parties';

interface Props {
  tables: RateTable[];
  parties: CarrierProfile[];
  loading: boolean;
  error: string;
  selectedId: string | null;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onSelectTable: (id: string | null) => void;
  onNewTable: () => void;
  onEditTable: (table: RateTable) => void;
  onToggle: (table: RateTable) => void;
  onDelete: (table: RateTable) => void;
}

export default function RateTablesListCard({
  tables,
  parties,
  loading,
  error,
  selectedId,
  canCreate,
  canEdit,
  canDelete,
  onSelectTable,
  onNewTable,
  onEditTable,
  onToggle,
  onDelete,
}: Props) {
  const columns: DataTableColumn<RateTable>[] = useMemo(() => rateTablesColumns(parties), [parties]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Tarifarios</h3>
          <HelpButton
            title="Tarifarios"
            steps={[
              'Un tarifario es una planilla: se declara qué variables forman su clave y se carga una fila por combinación con su importe.',
              'El asterisco (*) significa "cualquier valor". Sirve para escribir solo las excepciones más una fila general al final.',
              'Gana la MÁS ESPECÍFICA: la que resuelve más columnas con un valor exacto.',
            ]}
          />
        </div>
        <Button
          onClick={onNewTable}
          disabled={!canCreate}
          title={!canCreate ? 'Tu rol no puede crear tarifarios' : undefined}
        >
          <i className="ri-add-line mr-1"></i>Nuevo tarifario
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <DataTable
        maxVisibleRows={5}
        data={tables}
        columns={columns}
        getRowId={(t) => t.id}
        loading={loading}
        searchPlaceholder="Buscar tarifario..."
        exportFileName="tarifarios"
        columnsKey="tarifas.tarifarios"
        emptyMessage="No hay tarifarios en este país. Un tarifario reemplaza a un montón de reglas casi iguales: 5 zonas x 4 camiones son 20 filas de una planilla."
        selectedRowId={selectedId}
        onRowClick={(t) => onSelectTable(t.id === selectedId ? null : t.id)}
        actions={(t) => (
          <RateTableActions
            table={t} canEdit={canEdit} canDelete={canDelete}
            onEdit={onEditTable} onToggle={onToggle} onDelete={onDelete}
          />
        )}
      />

      {!selectedId && tables.length > 0 && (
        <p className="text-xs text-slate-500 mt-3">
          <i className="ri-cursor-line mr-1"></i>
          Tocá un tarifario para ver y cargar sus filas.
        </p>
      )}
    </Card>
  );
}
