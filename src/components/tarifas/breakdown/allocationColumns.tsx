import type { DataTableColumn } from '../../base/DataTable';
import { formatMoney } from '../../../lib/tarifas/format';
import { pctToDisplay, toDecimal } from '../../../lib/tarifas/money';
import type { AllocationShare } from '../../../lib/tarifas/types';

const PERCENT_SCALE = 100;

function proformaColumn(): DataTableColumn<AllocationShare> {
  return {
    key: 'proforma', header: 'Proforma', filterable: true,
    accessor: (r) => (r.deferredOrders && r.deferredOrders >= r.orders ? 'Pendiente' : r.deferredOrders ? 'Parcial' : 'Lista'),
    render: (r) => {
      const pendientes = r.deferredOrders ?? 0;
      if (pendientes === 0) return <span className="text-xs text-emerald-700">Lista</span>;
      return (
        <span className="text-xs text-amber-700">
          {pendientes >= r.orders ? 'Pendiente' : `Parcial · ${pendientes} de ${r.orders} pedidos para después`}
        </span>
      );
    },
  };
}

/** Columnas de la tabla de reparto por casa comercial. */
export function allocationColumns(currency: string): DataTableColumn<AllocationShare>[] {
  return [
    {
      key: 'name', header: 'Casa comercial', sortable: true, accessor: (r) => r.name,
      render: (r) => (
        <span>{r.name}{r.code && <span className="ml-1 font-mono text-[11px] text-slate-400">{r.code}</span>}</span>
      ),
    },
    {
      key: 'share', header: '%', sortable: true, align: 'right', accessor: (r) => Number(r.share),
      render: (r) => `${pctToDisplay(r.share)} %`,
      exportValue: (r) => toDecimal(r.share).times(PERCENT_SCALE).toNumber(),
    },
    {
      key: 'amount', header: 'Monto a pagar', sortable: true, align: 'right', accessor: (r) => Number(r.amount),
      render: (r) => <span className="font-medium text-slate-900">{formatMoney(r.amount, currency)}</span>,
    },
    {
      key: 'value', header: 'Valor de la mercancía', sortable: true, align: 'right', accessor: (r) => Number(r.value),
      render: (r) => formatMoney(r.value, currency),
    },
    proformaColumn(),
  ];
}
