// Table of orders emitted in a settlement.

import { MARK_LABELS, deliveryLabel } from '../../../lib/tarifas/tripOrders';
import { formatMoney } from '../../../lib/tarifas/format';
import { toDecimal } from '../../../lib/tarifas/money';
import type { SettlementOrder } from '../../../lib/tarifas/types';

interface Props {
  orders: SettlementOrder[] | null;
  currency: string;
}

export function PedidosEmitidos({ orders, currency }: Props) {
  if (!orders || orders.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        Esta liquidación no guardó pedidos (el viaje no los tenía cargados).
      </p>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="py-1 pr-3 font-medium">Guía</th>
          <th className="py-1 pr-3 font-medium">Pedido</th>
          <th className="py-1 pr-3 font-medium">Casa comercial</th>
          <th className="py-1 pr-3 font-medium text-right">Valor</th>
          <th className="py-1 pr-3 font-medium">Entrega</th>
          <th className="py-1 pr-3 font-medium">En la liquidación</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o, i) => (
          <tr key={`${o.orderId ?? 'x'}-${i}`} className="border-t border-slate-100">
            <td className="py-1 pr-3 font-mono">{o.guideNumber ?? '—'}</td>
            <td className="py-1 pr-3 font-mono">{o.orderNumber ?? '—'}</td>
            <td className="py-1 pr-3">{o.customerName ?? '—'}</td>
            <td className="py-1 pr-3 text-right">
              {toDecimal(o.value).greaterThan(0) ? formatMoney(o.value, currency) : '—'}
            </td>
            <td className="py-1 pr-3">{deliveryLabel(o.deliveryStatus)}</td>
            <td className="py-1 pr-3">
              {MARK_LABELS[o.status]}
              {o.reason && <span className="text-slate-400"> · {o.reason}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
