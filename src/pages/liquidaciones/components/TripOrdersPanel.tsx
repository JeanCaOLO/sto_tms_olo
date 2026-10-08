// Los pedidos de un viaje (una guía de despacho = un pedido).
//
// Sirve para dos cosas:
//   - Auditar: ver qué pedidos lleva el viaje y cuáles faltan por entregar (solo lectura).
//   - Liquidar por partes: anular un pedido (no entra en el reparto) o dejarlo para liquidar después
//     (sigue repartiéndose su parte, pero su proforma queda pendiente). Ninguna de las dos cambia lo
//     que se le paga al transportista.

import { useCallback, useEffect, useState } from 'react';
import Badge from '../../../components/base/Badge';
import Button from '../../../components/base/Button';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import { listTripOrders, setOrderMark } from '../../../lib/tarifas/tripsDataSource';
import { deliveryLabel, isDelivered, MARK_LABELS } from '../../../lib/tarifas/tripOrders';
import { formatMoney } from '../../../lib/tarifas/format';
import type { OrderMark, TripOrder, TripRecord } from '../../../lib/tarifas/types';

interface Props {
  trip: Pick<TripRecord, 'id' | 'countryId'>;
  currency: string;
  /** Con permiso de liquidar y viaje liquidable: muestra las acciones de cada pedido. */
  editable?: boolean;
  /**
   * Pedidos ya leídos por quien usa el panel (el modal de liquidar los trae con el cálculo). Con esto el
   * panel NO vuelve a pedirlos: antes cada apertura del modal leía pedidos y marcas dos o tres veces.
   * Tras cambiar una marca, `onChanged` debe recalcular y devolver nuevos `orders`.
   */
  orders?: TripOrder[];
  /** Se llama después de cambiar una marca, para que quien la usa recalcule. Si devuelve una promesa, se espera. */
  onChanged?: () => void | Promise<unknown>;
  /** Texto de arriba (cambia entre la fila extendida y el modal). */
  intro?: string;
}

const MARK_VARIANT: Record<string, 'default' | 'warning' | 'danger'> = {
  ANULADO: 'danger', DIFERIDO: 'warning',
};

export default function TripOrdersPanel({ trip, currency, editable = false, orders: given, onChanged, intro }: Props) {
  const controlled = given !== undefined;
  const [ownOrders, setOrders] = useState<TripOrder[]>([]);
  const [ownLoading, setLoading] = useState(!controlled);
  const orders = controlled ? given : ownOrders;
  const loading = controlled ? false : ownLoading;
  const [error, setError] = useState('');
  // Pedido al que se le está pidiendo el motivo de la anulación.
  const [annulling, setAnnulling] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (controlled) return;
    setLoading(true);
    try {
      setOrders(await listTripOrders(trip.id));
      setError('');
    } catch (e) {
      setOrders([]);
      setError(e instanceof Error ? e.message : 'No se pudieron leer los pedidos del viaje.');
    } finally {
      setLoading(false);
    }
  }, [trip.id, controlled]);

  useEffect(() => { void load(); }, [load]);

  const apply = async (order: TripOrder, mark: OrderMark | null, why?: string) => {
    if (!order.orderId) return;
    setBusy(true);
    setError('');
    const { error: err } = await setOrderMark({ trip, orderId: order.orderId, mark, reason: why });
    setBusy(false);
    if (err) { setError(err); return; }
    setAnnulling(null);
    setReason('');
    if (controlled) {
      // Quien usa el panel recalcula y con eso trae los pedidos nuevos: una sola lectura.
      setBusy(true);
      try { await onChanged?.(); } finally { setBusy(false); }
      return;
    }
    // Sin pedidos dados, el recálculo de quien lo usa y la recarga de la tabla van a la vez.
    onChanged?.();
    await load();
  };

  const pendientes = orders.filter((o) => !isDelivered(o) && o.mark !== 'ANULADO').length;

  const columns: DataTableColumn<TripOrder>[] = [
    { key: 'seq', header: '#', sortable: true, accessor: (o) => o.sequence },
    { key: 'guide', header: 'Guía', sortable: true, accessor: (o) => o.guideNumber ?? '', render: (o) => <span className="font-mono text-xs">{o.guideNumber ?? '—'}</span> },
    { key: 'order', header: 'Pedido', sortable: true, accessor: (o) => o.orderNumber ?? '', render: (o) => <span className="font-mono text-xs">{o.orderNumber ?? '—'}</span> },
    { key: 'customer', header: 'Casa comercial', sortable: true, filterable: true, accessor: (o) => o.customerName ?? 'Sin casa comercial' },
    {
      key: 'value', header: 'Valor', sortable: true, align: 'right',
      accessor: (o) => Number(o.value),
      render: (o) => (Number(o.value) > 0 ? formatMoney(o.value, currency) : <span className="text-slate-300">—</span>),
    },
    { key: 'weight', header: 'Peso (kg)', sortable: true, align: 'right', accessor: (o) => o.weightKg },
    {
      key: 'delivery', header: 'Entrega', sortable: true, filterable: true,
      accessor: (o) => deliveryLabel(o.deliveryStatus),
      render: (o) => (
        <Badge variant={isDelivered(o) ? 'success' : 'warning'} size="sm">{deliveryLabel(o.deliveryStatus)}</Badge>
      ),
    },
    {
      key: 'mark', header: 'En la liquidación', sortable: true, filterable: true,
      accessor: (o) => MARK_LABELS[o.mark ?? 'INCLUIDO'],
      render: (o) => (
        <div>
          <Badge variant={o.mark ? MARK_VARIANT[o.mark] : 'default'} size="sm">{MARK_LABELS[o.mark ?? 'INCLUIDO']}</Badge>
          {o.markReason && <div className="text-[11px] text-slate-400 mt-0.5 max-w-[200px] truncate" title={o.markReason}>{o.markReason}</div>}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-2">
      {intro && <p className="text-xs text-slate-500">{intro}</p>}
      {pendientes > 0 && (
        <p className="text-xs text-amber-700">
          <i className="ri-error-warning-line mr-1"></i>
          {pendientes} pedido{pendientes === 1 ? '' : 's'} sin entregar en este viaje.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <DataTable
        data={orders}
        columns={columns}
        getRowId={(o) => o.guideId}
        loading={loading}
        columnsKey="liquidaciones.pedidos"
        searchPlaceholder="Buscar pedido, guía o casa comercial"
        exportFileName="pedidos_del_viaje"
        emptyMessage="Este viaje no tiene pedidos cargados en sus guías de despacho"
        actions={editable ? (o) => (
          annulling === o.guideId ? (
            <div className="flex items-center gap-1">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo de la anulación"
                aria-label="Motivo de la anulación"
                className="w-44 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <Button size="sm" variant="danger" disabled={busy || !reason.trim()} onClick={() => void apply(o, 'ANULADO', reason)}>
                Anular
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setAnnulling(null); setReason(''); }}>
                <i className="ri-close-line"></i>
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {o.mark && (
                <Button size="sm" variant="secondary" disabled={busy || !o.orderId} onClick={() => void apply(o, null)} title="Volver a incluir el pedido">
                  Incluir
                </Button>
              )}
              {o.mark !== 'DIFERIDO' && (
                <Button size="sm" variant="secondary" disabled={busy || !o.orderId} onClick={() => void apply(o, 'DIFERIDO')} title="Se reparte su parte, pero su proforma queda pendiente">
                  Liquidar después
                </Button>
              )}
              {o.mark !== 'ANULADO' && (
                <Button size="sm" variant="ghost" disabled={busy || !o.orderId} onClick={() => { setAnnulling(o.guideId); setReason(''); }} title="Sacar el pedido del reparto">
                  <i className="ri-prohibited-line"></i>
                </Button>
              )}
            </div>
          )
        ) : undefined}
        actionsHeader="Acciones"
      />
    </div>
  );
}
