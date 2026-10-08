// DataTable columns for pending trips in settlements module.

import Badge from '../../../components/base/Badge';
import { type DataTableColumn } from '../../../components/base/DataTable';
import { tripProgress } from '../../../lib/tarifas/tripOrders';
import type { TripRecord } from '../../../lib/tarifas/types';

export const tripColumns: DataTableColumn<TripRecord>[] = [
  {
    key: 'routeNumber',
    header: 'Viaje',
    sortable: true,
    accessor: (t) => t.routeNumber,
    render: (t) => <span className="font-mono text-xs text-teal-700">{t.routeNumber}</span>,
  },
  { key: 'routeDate', header: 'Fecha', sortable: true, accessor: (t) => t.routeDate },
  {
    key: 'progress',
    header: 'Avance',
    sortable: true,
    filterable: true,
    accessor: (t) => tripProgress(t).label,
    render: (t) => {
      const p = tripProgress(t);
      return <Badge variant={p.complete ? 'success' : 'warning'} size="sm">{p.label}</Badge>;
    },
  },
  {
    key: 'carrier',
    header: 'Transportista',
    sortable: true,
    filterable: true,
    accessor: (t) => t.carrierName ?? '',
    cellClassName: 'max-w-[160px] truncate',
    render: (t) => <span title={t.carrierName ?? ''}>{t.carrierName ?? '—'}</span>,
  },
  {
    key: 'fleet',
    header: 'Flota',
    filterable: true,
    accessor: (t) => (t.isOwnFleet ? 'Propia' : 'Externa'),
  },
  {
    key: 'driver',
    header: 'Conductor',
    sortable: true,
    filterable: true,
    accessor: (t) => t.driverName ?? '',
    cellClassName: 'max-w-[160px] truncate',
    render: (t) => <span title={t.driverName ?? ''}>{t.driverName ?? '—'}</span>,
  },
  {
    key: 'vehicle',
    header: 'Vehículo',
    sortable: true,
    accessor: (t) => `${t.vehiclePlate ?? ''} ${t.vehicleType ?? ''}`.trim(),
    cellClassName: 'max-w-[150px] truncate',
    render: (t) => {
      const v = `${t.vehiclePlate ?? '—'} · ${t.vehicleType ?? '—'}`;
      return <span title={v}>{v}</span>;
    },
  },
  {
    key: 'zone',
    header: 'Zona destino',
    sortable: true,
    filterable: true,
    accessor: (t) => (t.destZoneCode ? `${t.destZoneCode} · ${t.destZoneName ?? ''}` : ''),
    cellClassName: 'max-w-[160px] truncate',
    render: (t) => {
      const z = t.destZoneCode ? `${t.destZoneCode} · ${t.destZoneName ?? ''}` : '—';
      return <span title={z}>{z}</span>;
    },
  },
  { key: 'km', header: 'Km', sortable: true, align: 'right', accessor: (t) => t.km },
  {
    key: 'stops',
    header: 'Paradas',
    sortable: true,
    align: 'right',
    accessor: (t) => t.completedStops,
    render: (t) => `${t.completedStops} / ${t.totalStops}`,
  },
  { key: 'weight', header: 'Peso (kg)', sortable: true, align: 'right', accessor: (t) => t.weightKg },
];
