// DataTable columns and related UI for settlements in the settlements module.

import Badge from '../../../components/base/Badge';
import { type DataTableColumn } from '../../../components/base/DataTable';
import { formatMoney } from '../../../lib/tarifas/format';
import type { SettlementRecord, SettlementStatus } from '../../../lib/tarifas/types';

const MARGIN_BADGE: Record<string, 'success' | 'warning' | 'danger'> = {
  OK: 'success',
  WARN: 'warning',
  CRITICAL: 'danger',
  LOSS: 'danger',
};

const MARGIN_LABEL: Record<string, string> = {
  OK: 'OK',
  WARN: 'Atención',
  CRITICAL: 'Crítico',
  LOSS: 'Pérdida',
};

const STATUS_CLASSES: Record<string, string> = {
  'Borrador': 'bg-slate-100 text-slate-700',
  'En Revisión': 'bg-amber-100 text-amber-700',
  'Aprobado': 'bg-emerald-100 text-emerald-700',
  'Pagado': 'bg-teal-100 text-teal-700',
  'Anulado': 'bg-red-100 text-red-700',
};

const ESTADOS: SettlementStatus[] = ['Borrador', 'En Revisión', 'Aprobado', 'Pagado', 'Anulado'];

export function getSettlementColumns(
  numeroDe: Map<string, string>,
  canEdit: boolean,
  onStatusChange: (s: SettlementRecord, status: SettlementStatus) => void,
): DataTableColumn<SettlementRecord>[] {
  return [
    {
      key: 'number',
      header: 'Nro',
      sortable: true,
      accessor: (s) => s.number,
      render: (s) => (
        <div>
          <span className="font-mono text-xs text-teal-700">{s.number}</span>
          {s.supersededBy && (
            <div className="text-[11px] text-slate-400">
              reemplazada por {numeroDe.get(s.supersededBy) ?? s.supersededBy}
            </div>
          )}
        </div>
      ),
    },
    { key: 'trip', header: 'Viaje', sortable: true, accessor: (s) => s.tripNumber },
    { key: 'date', header: 'Fecha', sortable: true, accessor: (s) => s.settlementDate },
    {
      key: 'carrier',
      header: 'Transportista',
      sortable: true,
      filterable: true,
      accessor: (s) => s.tripInfo.carrierName ?? '',
    },
    {
      key: 'total',
      header: 'Total',
      sortable: true,
      align: 'right',
      accessor: (s) => Number(s.totalAmount),
      render: (s) => <span className="font-medium text-slate-900">{formatMoney(s.totalAmount, s.currency)}</span>,
    },
    {
      key: 'orders',
      header: 'Pedidos',
      sortable: true,
      accessor: (s) => (s.orders ? s.orders.filter((o) => o.status !== 'ANULADO').length : 0),
      render: (s) => {
        if (!s.orders) return <span className="text-slate-300">—</span>;
        const diferidos = s.orders.filter((o) => o.status === 'DIFERIDO').length;
        const anulados = s.orders.filter((o) => o.status === 'ANULADO').length;
        return (
          <div className="text-xs">
            <span>{s.orders.length - anulados} en el reparto</span>
            {diferidos > 0 && <Badge variant="warning" size="sm" className="ml-1">{diferidos} para después</Badge>}
            {anulados > 0 && <Badge variant="danger" size="sm" className="ml-1">{anulados} anulados</Badge>}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Estado',
      sortable: true,
      filterable: true,
      accessor: (s) => s.status,
      render: (s) => (
        <select
          value={s.status}
          onChange={(e) => onStatusChange(s, e.target.value as SettlementStatus)}
          disabled={!canEdit || !!s.supersededBy}
          title={s.supersededBy ? 'Reemplazada al re-liquidar: no se puede reactivar' : undefined}
          className={`text-xs rounded-full px-2.5 py-1 border-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${STATUS_CLASSES[s.status] ?? ''}`}
        >
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      ),
    },
  ];
}

export function getSettlementColumnsExtended(
  numeroDe: Map<string, string>,
  canEdit: boolean,
  onStatusChange: (s: SettlementRecord, status: SettlementStatus) => void,
): DataTableColumn<SettlementRecord>[] {
  const baseCols = getSettlementColumns(numeroDe, canEdit, onStatusChange);
  const marginCol: DataTableColumn<SettlementRecord> = {
    key: 'margin',
    header: 'Ganancia (auditoría)',
    filterable: true,
    accessor: (s) => (s.cargoValue && s.marginStatus ? MARGIN_LABEL[s.marginStatus] ?? s.marginStatus : ''),
    exportValue: (s) => (s.cargoValue && s.marginAmount ? Number(s.marginAmount) : ''),
    render: (s) =>
      s.cargoValue && s.marginStatus ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-700">{formatMoney(s.marginAmount ?? '0', s.currency)}</span>
          <Badge variant={MARGIN_BADGE[s.marginStatus] ?? 'default'} size="sm">
            {MARGIN_LABEL[s.marginStatus] ?? s.marginStatus}
          </Badge>
        </div>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  };

  return [...baseCols.slice(0, 5), marginCol, ...baseCols.slice(5)];
}
