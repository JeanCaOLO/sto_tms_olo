import { useTranslation } from 'react-i18next';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Select from '../../../components/base/Select';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import type { QueueOrder } from '../types';
import BandejaDetailModal from './BandejaDetailModal';
import { useBandejaController } from './useBandejaController';

const money = (n: number) => n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Solo la fecha (YYYY-MM-DD), sin la hora: sirve para date ('2026-10-25') y para
// timestamp ('2026-10-16T13:25:...' o '2026-10-16 13:25:...').
const soloFecha = (v: string) => (v ? v.slice(0, 10) : '');

// Pantalla Pedidos en Bandeja: copia de la Cola de Priorización SIN las columnas
// Prioridad, Score, Estado y Situación (en la bandeja el pedido todavía no está
// priorizado). El detalle del pedido se muestra en un modal de solo lectura.
// El país queda fijo internamente; el filtro visible es Sucursal/Zona/Estado/
// Situación. La lista es un DataTable (estándar del sistema).
export default function OmsBandejaPage() {
  const { t } = useTranslation();
  const {
    orders, loading, error,
    filters, setFilter, resetFilters, filtersActive, options,
    selectedId, setSelectedId, selected,
    detailOpen, setDetailOpen,
  } = useBandejaController();

  const opt = (all: string[], allLabel: string) => [
    { value: 'todos', label: allLabel },
    ...all.map((v) => ({ value: v, label: v })),
  ];

  const columns: DataTableColumn<QueueOrder>[] = [
    { key: 'ref', header: t('omsBandeja.colOrder'), accessor: (o) => o.ref, sortable: true, render: (o) => <span className="font-medium text-slate-900">{o.ref}</span> },
    { key: 'warehouseId', header: t('omsBandeja.colWarehouseId'), accessor: (o) => o.warehouseId, sortable: true, filterable: true },
    { key: 'companyId', header: t('omsBandeja.colCompanyId'), accessor: (o) => o.companyId, sortable: true, filterable: true },
    { key: 'branchId', header: t('omsBandeja.colBranchId'), accessor: (o) => o.branchId, sortable: true, filterable: true },
    { key: 'orderType', header: t('omsBandeja.colOrderType'), accessor: (o) => o.orderType, sortable: true, filterable: true },
    { key: 'customer', header: t('omsBandeja.colCustomer'), accessor: (o) => o.customer, sortable: true, filterable: true },
    { key: 'route', header: t('omsBandeja.colRoute'), accessor: (o) => o.route, sortable: true, filterable: true },
    { key: 'totalAmount', header: t('omsBandeja.colTotalAmount'), accessor: (o) => o.totalAmount, sortable: true, align: 'right', render: (o) => money(o.totalAmount) },
    { key: 'weight', header: t('omsBandeja.colWeight'), accessor: (o) => o.weight, sortable: true, align: 'right', render: (o) => o.weight.toFixed(1) },
    { key: 'volume', header: t('omsBandeja.colVolume'), accessor: (o) => o.volume, sortable: true, align: 'right', render: (o) => o.volume.toFixed(1) },
    { key: 'itemCount', header: t('omsBandeja.colItemCount'), accessor: (o) => o.itemCount, sortable: true, align: 'right' },
    {
      key: 'observations',
      header: t('omsBandeja.colObservations'),
      accessor: (o) => o.observations,
      render: (o) => <span className="max-w-[220px] truncate block" title={o.observations}>{o.observations}</span>,
    },
    { key: 'dispatchDate', header: t('omsBandeja.colDispatchDate'), accessor: (o) => o.dispatchDate, sortable: true, render: (o) => soloFecha(o.dispatchDate) },
    { key: 'createdDate', header: t('omsBandeja.colCreatedDate'), accessor: (o) => o.createdDate, sortable: true, render: (o) => soloFecha(o.createdDate) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('omsBandeja.title')}</h1>
        <p className="text-sm text-slate-600 mt-1">{t('omsBandeja.subtitle')}</p>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <div className="sm:w-40">
            <Select label={t('omsBandeja.branch')} value={filters.branch} onChange={(e) => setFilter('branch', e.target.value)} options={opt(options.branches, t('omsBandeja.allFem'))} />
          </div>
          <div className="sm:w-44">
            <Select label={t('omsBandeja.route')} value={filters.route} onChange={(e) => setFilter('route', e.target.value)} options={opt(options.routes, t('omsBandeja.allFem'))} />
          </div>
          {filtersActive && (
            <div className="col-span-2 sm:w-auto">
              <Button variant="ghost" onClick={resetFilters}>{t('omsBandeja.clear')}</Button>
            </div>
          )}
        </div>
      </Card>

      {!loading && error && (
        <Card padding={false}>
          <div className="p-6 text-sm text-red-600">{error}</div>
        </Card>
      )}

      {(loading || !error) && (
        <DataTable
          data={orders}
          columns={columns}
          getRowId={(o) => o.id}
          loading={loading}
          pageSize={10}
          selectedRowId={selectedId}
          onRowClick={(o) => { setSelectedId(o.id); setDetailOpen(true); }}
          searchPlaceholder={t('omsBandeja.search')}
          exportFileName="pedidos_bandeja"
          emptyMessage={filtersActive ? t('omsBandeja.emptyFiltered') : t('omsBandeja.emptyNoOrders')}
        />
      )}

      {detailOpen && selected && (
        <BandejaDetailModal
          order={selected}
          onClose={() => { setDetailOpen(false); setSelectedId(null); }}
        />
      )}
    </div>
  );
}
