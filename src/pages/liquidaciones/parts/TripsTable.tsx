// Tabla «Por liquidar»: un botón Liquidar por viaje y, marcando varios listos, «Liquidar N viajes» de una vez.

import { useState } from 'react';
import Button from '../../../components/base/Button';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import { notLiquidableReason } from '../../../lib/tarifas/tripContext';
import { notify } from '../../../lib/notify';
import { tripProgress } from '../../../lib/tarifas/tripOrders';
import { listOrdersForTrips } from '../../../lib/tarifas/tripsDataSource';
import { downloadTripsWorkbook } from '../exportTripsWithOrders';
import TripOrdersPanel from '../components/TripOrdersPanel';
import { tripColumns } from './tripColumns';
import type { TripRecord } from '../../../lib/tarifas/types';

/** Excel con cada viaje (filtrado y ordenado como se ve) y sus pedidos, leídos de una vez. */
async function exportTripsWithOrders(trips: TripRecord[], columns: DataTableColumn<TripRecord>[]): Promise<void> {
  try {
    const ordersByTrip = await listOrdersForTrips(trips.map((t) => t.id));
    await downloadTripsWorkbook(trips, ordersByTrip, columns, 'viajes_por_liquidar');
  } catch (e) {
    notify(e instanceof Error ? e.message : 'No se pudo exportar los viajes con sus pedidos.', 'error');
    throw e;
  }
}

/** Tope del lote: cada viaje calcula por su cuenta contra el backend, y diez ya son mucho para revisar. */
export const MAX_LOTE = 10;

interface Props {
  trips: TripRecord[];
  loading: boolean;
  extendida: boolean;
  canCreate: boolean;
  currency: string;
  prefetchProps: (t: TripRecord, disabled: boolean) => object;
  onLiquidar: (t: TripRecord) => void;
  onLiquidarLote: (trips: TripRecord[]) => void;
}

export function TripsTable({
  trips, loading, extendida, canCreate, currency, prefetchProps, onLiquidar, onLiquidarLote,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Para el lote solo sirven los viajes listos: los que tienen pedidos por decidir se liquidan aparte.
  const motivoLote = (t: TripRecord): string | null => {
    const motivo = notLiquidableReason(t);
    if (motivo) return motivo;
    if (!tripProgress(t).complete) return 'Tiene pedidos sin entregar: liquídalo aparte para decidir qué hacer con ellos';
    if (selected.size >= MAX_LOTE && !selected.has(t.id)) return `El lote admite hasta ${MAX_LOTE} viajes`;
    return null;
  };

  return (
    <DataTable
      maxVisibleRows={5}
      data={trips}
      columns={tripColumns}
      getRowId={(t) => t.id}
      loading={loading}
      columnsKey={`liquidaciones.viajes.${extendida ? 'extendida' : 'simple'}`}
      defaultHidden={extendida ? [] : ['fleet', 'driver', 'vehicle', 'weight', 'zone']}
      renderExpanded={(t) => (
        <TripOrdersPanel
          trip={t}
          currency={currency}
          intro="Pedidos que lleva el viaje, uno por guía de despacho. Se liquidan juntos; desde Liquidar se puede anular alguno o dejarlo para después."
        />
      )}
      searchHidden
      searchPlaceholder="Buscar por viaje, transportista, conductor o placa"
      exportFileName="viajes_por_liquidar"
      exportHandler={exportTripsWithOrders}
      emptyMessage="No hay viajes completados pendientes de liquidar"
      pageSize={25}
      selection={canCreate ? {
        selected,
        onChange: (next) => setSelected(new Set([...next].slice(0, MAX_LOTE))),
        disabledReason: motivoLote,
        bar: (ids) => (
          <Button
            size="sm"
            onClick={() => onLiquidarLote(trips.filter((t) => ids.includes(t.id)))}
          >
            <i className="ri-calculator-line mr-1" />
            Liquidar {ids.length === 1 ? '1 viaje' : `${ids.length} viajes`}
          </Button>
        ),
      } : undefined}
      actions={(t) => {
        if (!canCreate) return null;
        const motivo = notLiquidableReason(t);
        const parcial = !tripProgress(t).complete;
        return (
          <Button
            size="sm"
            variant={parcial ? 'secondary' : 'primary'}
            disabled={!!motivo}
            onClick={() => onLiquidar(t)}
            {...prefetchProps(t, !!motivo)}
            title={motivo ?? (parcial ? 'Tiene pedidos sin entregar: podés anularlos o dejarlos para después' : 'Liquidar este viaje')}
          >
            <i className="ri-calculator-line mr-1" />
            Liquidar
          </Button>
        );
      }}
    />
  );
}
