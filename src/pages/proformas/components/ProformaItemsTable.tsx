// Liquidaciones de la proforma: se pueden excluir las que no convencen y aprobar el resto.

import Badge from '../../../components/base/Badge';
import Button from '../../../components/base/Button';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import { formatMoney } from '../../../lib/tarifas/format';
import type { IrregularFlag, ProformaDetail } from '../../../lib/tarifas/proformas';
import IrregularBadge from './IrregularBadge';

type Item = ProformaDetail['items'][number];

interface Props {
  detail: ProformaDetail;
  canToggle: boolean;
  busy: boolean;
  onInclude: (settlementId: string) => void;
  onExclude: (settlementId: string) => void;
  /** Clic en una línea: abre el desglose de esa liquidación. */
  onOpen: (settlementId: string) => void;
  /** Alertas de irregularidad por liquidación (vacío = típica). */
  flags?: Map<string, IrregularFlag[]>;
}

export default function ProformaItemsTable({ detail, canToggle, busy, onInclude, onExclude, onOpen, flags }: Props) {
  const currency = detail.proforma.currency;
  const columns: DataTableColumn<Item>[] = [
    {
      key: 'number', header: 'Liquidación', sortable: true,
      accessor: (i) => detail.settlements.get(i.settlementId)?.number ?? i.settlementId,
      render: (i) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-mono text-xs text-teal-700">{detail.settlements.get(i.settlementId)?.number ?? i.settlementId}</span>
          <IrregularBadge flags={flags?.get(i.settlementId) ?? []} />
        </span>
      ),
    },
    { key: 'trip', header: 'Viaje', sortable: true, accessor: (i) => detail.settlements.get(i.settlementId)?.tripNumber ?? '' },
    { key: 'date', header: 'Fecha', sortable: true, accessor: (i) => detail.settlements.get(i.settlementId)?.settlementDate ?? '' },
    {
      key: 'amount', header: 'Total', sortable: true, align: 'right', accessor: (i) => i.amount,
      render: (i) => <span className={i.included ? 'font-medium' : 'text-slate-400 line-through'}>{formatMoney(String(i.amount), currency)}</span>,
    },
    {
      key: 'state', header: 'En la proforma', filterable: true, accessor: (i) => (i.included ? 'Incluida' : 'Excluida'),
      render: (i) => (
        <div>
          <Badge variant={i.included ? 'success' : 'danger'} size="sm">{i.included ? 'Incluida' : 'Excluida'}</Badge>
          {i.exclusionReason && <div className="text-[11px] text-slate-500">{i.exclusionReason}</div>}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      data={detail.items}
      columns={columns}
      getRowId={(i) => i.id}
      maxVisibleRows={6}
      pageSize={10}
      emptyMessage="La proforma no tiene liquidaciones"
      exportFileName={`proforma_${detail.proforma.number}`}
      onRowClick={(i) => onOpen(i.settlementId)}
      actions={(i) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" title="Ver el desglose de la liquidación" onClick={() => onOpen(i.settlementId)}>
            <i className="ri-eye-line" />
          </Button>
          {canToggle && (
            <Button
              variant="ghost" size="sm" disabled={busy}
              title={i.included ? 'Excluir de esta proforma' : 'Volver a incluir'}
              onClick={() => (i.included ? onExclude(i.settlementId) : onInclude(i.settlementId))}
            >
              {i.included ? 'Excluir' : 'Incluir'}
            </Button>
          )}
        </div>
      )}
    />
  );
}
