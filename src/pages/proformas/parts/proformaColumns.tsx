import Badge from '../../../components/base/Badge';
import type { DataTableColumn } from '../../../components/base/DataTable';
import { formatMoney } from '../../../lib/tarifas/format';
import { phaseLabel, type ProformaWithPhases } from '../../../lib/tarifas/proformas';
import type { SettlementStatus } from '../../../lib/tarifas/types';

const STATUS_VARIANT: Record<SettlementStatus, 'default' | 'warning' | 'success' | 'info' | 'danger'> = {
  'Borrador': 'default',
  'En Revisión': 'warning',
  'Aprobado': 'success',
  'Pagado': 'info',
  'Anulado': 'danger',
};

const shortDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export function getProformaColumns(): DataTableColumn<ProformaWithPhases>[] {
  return [
    {
      key: 'number', header: 'Nro', sortable: true, accessor: (r) => r.proforma.number,
      render: (r) => <span className="font-mono text-xs text-teal-700">{r.proforma.number}</span>,
    },
    { key: 'carrier', header: 'Transportista', sortable: true, filterable: true, accessor: (r) => r.proforma.carrierName },
    {
      key: 'total', header: 'Total', sortable: true, align: 'right', accessor: (r) => r.proforma.totalAmount,
      render: (r) => <span className="font-medium text-slate-900">{formatMoney(String(r.proforma.totalAmount), r.proforma.currency)}</span>,
    },
    {
      key: 'status', header: 'Estado', sortable: true, filterable: true, accessor: (r) => r.proforma.status,
      render: (r) => (
        <div className="space-y-0.5">
          <Badge variant={STATUS_VARIANT[r.proforma.status]} size="sm">{r.proforma.status}</Badge>
          {r.proforma.status === 'En Revisión' && (
            <div className="text-[11px] text-slate-500">{phaseLabel(r.proforma.status, r.phases)}</div>
          )}
        </div>
      ),
      exportValue: (r) => phaseLabel(r.proforma.status, r.phases),
    },
    { key: 'created', header: 'Creada', sortable: true, accessor: (r) => shortDate(r.proforma.createdAt) },
    {
      key: 'sent', header: 'Correo', filterable: true,
      accessor: (r) => (r.proforma.emailSentAt ? 'Enviado' : r.proforma.status === 'Aprobado' ? 'Por enviar' : '—'),
    },
  ];
}
