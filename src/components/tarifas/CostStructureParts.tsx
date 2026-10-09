// Piezas de presentación compartidas de la estructura de costos: la tabla de filas y el resumen por
// tipo de camión. Las usan Reglas de Tarifa (flota propia del país) y la ficha de la compañía.

import type { ReactNode } from 'react';
import Badge from '../base/Badge';
import DataTable, { type DataTableColumn } from '../base/DataTable';
import { COST_DRIVER_LABELS } from '../../lib/tarifas/cost';
import type { TruckSummary } from '../../lib/tarifas/costTemplate';
import type { CostGroup, CostStructureRow } from '../../lib/tarifas/types';

export const GROUP_LABELS: Record<CostGroup, string> = {
  conductor: 'Conductor',
  ayudante: 'Ayudante',
  depreciacion: 'Depreciación',
  mantenimiento: 'Mantenimiento',
  otros: 'Otros',
};

const FREQUENCY_UNITS: Record<string, string> = { km: 'km', year: 'años', month: 'meses' };

export function driverLabel(driver: string, custom: Record<string, string> = {}): string {
  return (COST_DRIVER_LABELS as Record<string, string>)[driver] ?? custom[driver] ?? driver;
}

function frequencyLabel(r: CostStructureRow): string {
  if (!r.frequency) return 'Mensual (prorrateado por día)';
  return `Se repite cada ${r.frequencyQty ?? '?'} ${FREQUENCY_UNITS[r.frequency]}`;
}

interface RowsTableProps {
  rows: CostStructureRow[];
  loading?: boolean;
  /** Etiquetas de los drivers `custom:*` de la compañía. */
  customLabels?: Record<string, string>;
  exportFileName: string;
  emptyMessage: string;
  actions?: (row: CostStructureRow) => ReactNode;
}

export function CostRowsTable({
  rows, loading, customLabels, exportFileName, emptyMessage, actions,
}: RowsTableProps) {
  const columns: DataTableColumn<CostStructureRow>[] = [
    {
      key: 'label', header: 'Componente', sortable: true,
      accessor: (r) => r.label,
      render: (r) => (
        <div className={r.active ? '' : 'opacity-50'}>
          <div className="text-slate-800">{r.label}</div>
          <div className="text-[11px] font-mono text-slate-400">{r.code}</div>
        </div>
      ),
    },
    {
      key: 'group', header: 'Grupo', sortable: true, filterable: true,
      accessor: (r) => (r.group ? GROUP_LABELS[r.group] : 'Sin grupo'),
    },
    {
      key: 'truck', header: 'Tipo de camión', sortable: true, filterable: true,
      accessor: (r) => r.truckType ?? 'Todos',
    },
    {
      key: 'frequency', header: 'Frecuencia', filterable: true,
      accessor: (r) => (r.frequency ? 'Por repetición' : driverLabel(r.driver, customLabels)),
    },
    { key: 'every', header: 'Cada cuánto', accessor: (r) => frequencyLabel(r) },
    {
      key: 'amount', header: 'Costo', align: 'right', sortable: true,
      accessor: (r) => (r.sign === 'SUBTRACT' ? -Number(r.amount) : Number(r.amount)),
      render: (r) => (
        <span className="font-mono">
          {r.sign === 'SUBTRACT' && '− '}{r.amount}
          {!r.active && <Badge size="sm" className="ml-2">De baja</Badge>}
        </span>
      ),
    },
    {
      key: 'unitQty', header: 'Unidades', align: 'right', sortable: true,
      accessor: (r) => r.unitQty,
      render: (r) => r.unitQty ?? '—',
    },
    {
      key: 'costPerKm', header: 'Costo por km', align: 'right', sortable: true,
      accessor: (r) => (r.costPerKm === null ? null : Number(r.costPerKm)),
      render: (r) => <span className="font-mono">{r.costPerKm ?? '—'}</span>,
    },
  ];

  return (
    <DataTable
      maxVisibleRows={5}
      data={rows}
      columns={columns}
      getRowId={(r) => r.id}
      loading={loading}
      searchPlaceholder="Buscar componente, grupo o tipo de camión..."
      exportFileName={exportFileName}
      columnsKey={`tarifas.${exportFileName}`}
      emptyMessage={emptyMessage}
      actions={actions}
    />
  );
}

const summaryColumns: DataTableColumn<TruckSummary>[] = [
  {
    key: 'truck', header: 'Tipo de camión', sortable: true,
    accessor: (r) => r.truckType ?? 'Todos los camiones',
  },
  { key: 'fixedMonthly', header: 'Fijo mensual', align: 'right', sortable: true, accessor: (r) => Number(r.fixedMonthly) },
  { key: 'fixedDaily', header: 'Fijo diario', align: 'right', sortable: true, accessor: (r) => Number(r.fixedDaily) },
  { key: 'variablePerKm', header: 'Variable por km', align: 'right', sortable: true, accessor: (r) => Number(r.variablePerKm) },
  {
    key: 'fuelPerKm', header: 'Combustible por km', align: 'right', sortable: true,
    accessor: (r) => (r.fuelPerKm === null ? null : Number(r.fuelPerKm)),
    render: (r) => r.fuelPerKm ?? '—',
  },
];

export function TruckSummaryTable({ summary, exportFileName }: { summary: TruckSummary[]; exportFileName: string }) {
  return (
    <DataTable
      maxVisibleRows={5}
      data={summary}
      columns={summaryColumns}
      getRowId={(r) => r.truckType ?? '__todos__'}
      searchPlaceholder="Buscar tipo de camión..."
      exportFileName={exportFileName}
      columnsKey={`tarifas.${exportFileName}`}
      emptyMessage="Sin filas."
    />
  );
}
