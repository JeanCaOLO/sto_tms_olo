// Tabla de las filas de un tarifario con acciones de editar y eliminar.

import { useMemo } from 'react';
import DataTable, { type DataTableColumn } from '../../../../components/base/DataTable';
import Badge from '../../../../components/base/Badge';
import { RATE_TABLE_WILDCARD, type RateTable, type RateTableRow, type VarKey } from '../../../../lib/tarifas/types';
import { VAR_KEY_LABELS } from '../../../../lib/tarifas/format';

interface Props {
  table: RateTable | null;
  rows: RateTableRow[];
  loading: boolean;
  selectedRowId: string | null;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (row: RateTableRow) => void;
  onDelete: (row: RateTableRow) => void;
  customLabels?: Record<string, string>;
}

export default function RateRowsTable({
  table,
  rows,
  loading,
  selectedRowId,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  customLabels = {},
}: Props) {
  const comodines = (row: RateTableRow) =>
    row.key.filter((v) => v === RATE_TABLE_WILDCARD).length;

  const columns: DataTableColumn<RateTableRow>[] = useMemo(
    () => table ? [
      ...table.keyColumns.map((c, i): DataTableColumn<RateTableRow> => ({
        key: `k${i}`,
        header: VAR_KEY_LABELS[c as keyof typeof VAR_KEY_LABELS] ?? customLabels[c] ?? c,
        sortable: true,
        filterable: true,
        accessor: (r) => r.key[i] ?? RATE_TABLE_WILDCARD,
        render: (r) => {
          const value = r.key[i] ?? RATE_TABLE_WILDCARD;
          return value === RATE_TABLE_WILDCARD
            ? <span className="text-slate-400 font-mono" title="Cualquier valor">*</span>
            : <span className="font-mono text-xs text-slate-700">{value}</span>;
        },
      })),
      {
        key: 'amount',
        header: (table.valueColumns ?? []).length > 0 ? 'Importe (principal)' : 'Importe',
        align: 'right',
        sortable: true,
        accessor: (r) => Number(r.amount),
        render: (r) => <span className="font-medium text-slate-800">{r.amount}</span>,
      },
      ...(table.valueColumns ?? []).map((name): DataTableColumn<RateTableRow> => ({
        key: `v:${name}`,
        header: name,
        align: 'right',
        sortable: true,
        accessor: (r) => (r.values?.[name] === undefined ? null : Number(r.values[name])),
        render: (r) => (r.values?.[name] === undefined
          ? <span className="text-slate-300" title="Esta fila no tiene valor en esta columna">—</span>
          : <span className="font-medium text-slate-800">{r.values[name]}</span>),
      })),
      {
        key: 'scope',
        header: 'Alcance',
        filterable: true,
        accessor: (r) => {
          const c = comodines(r);
          if (c === 0) return 'Exacta';
          if (c === table.keyColumns.length) return 'Todos los casos';
          return 'Parcial';
        },
        render: (r) => {
          const c = comodines(r);
          if (c === 0) return <Badge variant="info">Exacta</Badge>;
          if (c === table.keyColumns.length) return <Badge variant="warning">Todos los casos</Badge>;
          return (
            <span className="text-xs text-slate-500">
              {table.keyColumns.length - c} de {table.keyColumns.length} columnas
            </span>
          );
        },
      },
    ] : [],
    [table, customLabels],
  );

  const tableSlug = table?.code?.toLowerCase();

  return (
    <DataTable
      maxVisibleRows={5}
      data={rows}
      columns={columns}
      getRowId={(r) => r.id}
      loading={loading}
      searchPlaceholder="Buscar fila..."
      exportFileName={tableSlug ? `tarifario_${tableSlug}_filas` : 'filas'}
      columnsKey={tableSlug ? `tarifas.tarifario_${tableSlug}_filas` : 'filas'}
      emptyMessage="Este tarifario no tiene filas. Mientras esté vacío, una regla que lo use cobra siempre su importe de respaldo."
      selectedRowId={selectedRowId}
      actions={(row) => (
        <>
          <button
            onClick={() => onEdit(row)}
            disabled={!canEdit}
            className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={canEdit ? 'Editar' : 'Tu rol no puede editar tarifarios'}
          >
            <i className="ri-edit-line"></i>
          </button>
          <button
            onClick={() => onDelete(row)}
            disabled={!canDelete}
            className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={canDelete ? 'Eliminar' : 'Tu rol no puede eliminar filas'}
          >
            <i className="ri-delete-bin-line"></i>
          </button>
        </>
      )}
    />
  );
}
