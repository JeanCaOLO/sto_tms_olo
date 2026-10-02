import { useTranslation } from 'react-i18next';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Select from '../../../components/base/Select';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import PriorityBadge from '../components/PriorityBadge';
import { TIER_LABEL, type PriorityTier, type QueueOrder } from '../types';
import OrderDetailModal from './OrderDetailModal';
import OverrideModal from './OverrideModal';
import { useColaController } from './useColaController';

const money = (n: number) => n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Pantalla Cola de Priorización (FR2/FR3): tabla completa + filtros.
// El detalle del pedido se muestra en un modal (con el botón de override dentro).
// El país queda fijo internamente (ver useColaController); el filtro visible es
// Compañía, dentro del bloque de filtros (no hay selector de país en el header).
// La lista es un DataTable (estándar del sistema: búsqueda, filtros por columna,
// orden, paginación y export .xlsx integrados).
export default function OmsColaPage() {
  const { t } = useTranslation();
  const {
    orders, loading, error,
    filters, setFilter, resetFilters, filtersActive, options,
    selectedId, setSelectedId, selected,
    detailOpen, setDetailOpen,
    overrideOpen, setOverrideOpen, applyOverride,
  } = useColaController();

  const opt = (all: string[], allLabel: string) => [
    { value: 'todos', label: allLabel },
    ...all.map((v) => ({ value: v, label: v })),
  ];

  const columns: DataTableColumn<QueueOrder>[] = [
    { key: 'tier', header: t('omsQueue.colPriority'), accessor: (o) => o.tier, sortable: true, render: (o) => <PriorityBadge tier={o.tier} /> },
    { key: 'ref', header: t('omsQueue.colOrder'), accessor: (o) => o.ref, sortable: true, render: (o) => <span className="font-medium text-slate-900">{o.ref}</span> },
    { key: 'warehouseId', header: t('omsQueue.colWarehouseId'), accessor: (o) => o.warehouseId, sortable: true, filterable: true },
    { key: 'companyId', header: t('omsQueue.colCompanyId'), accessor: (o) => o.companyId, sortable: true, filterable: true },
    { key: 'branchId', header: t('omsQueue.colBranchId'), accessor: (o) => o.branchId, sortable: true, filterable: true },
    { key: 'orderType', header: t('omsQueue.colOrderType'), accessor: (o) => o.orderType, sortable: true, filterable: true },
    { key: 'customer', header: t('omsQueue.colCustomer'), accessor: (o) => o.customer, sortable: true, filterable: true },
    { key: 'route', header: t('omsQueue.colRoute'), accessor: (o) => o.route, sortable: true, filterable: true },
    { key: 'totalAmount', header: t('omsQueue.colTotalAmount'), accessor: (o) => o.totalAmount, sortable: true, align: 'right', render: (o) => money(o.totalAmount) },
    { key: 'weight', header: t('omsQueue.colWeight'), accessor: (o) => o.weight, sortable: true, align: 'right', render: (o) => o.weight.toFixed(1) },
    { key: 'volume', header: t('omsQueue.colVolume'), accessor: (o) => o.volume, sortable: true, align: 'right', render: (o) => o.volume.toFixed(1) },
    { key: 'itemCount', header: t('omsQueue.colItemCount'), accessor: (o) => o.itemCount, sortable: true, align: 'right' },
    {
      key: 'observations',
      header: t('omsQueue.colObservations'),
      accessor: (o) => o.observations,
      render: (o) => <span className="max-w-[220px] truncate block" title={o.observations}>{o.observations}</span>,
    },
    { key: 'dispatchDate', header: t('omsQueue.colDispatchDate'), accessor: (o) => o.dispatchDate, sortable: true },
    { key: 'createdDate', header: t('omsQueue.colCreatedDate'), accessor: (o) => o.createdDate, sortable: true },
    { key: 'readyToPrepDate', header: t('omsQueue.colReadyDate'), accessor: (o) => o.readyToPrepDate, sortable: true },
    { key: 'score', header: t('omsQueue.colScore'), accessor: (o) => o.score, sortable: true, align: 'right', render: (o) => <span className="font-semibold text-slate-900">{o.score}</span> },
    { key: 'status', header: t('omsQueue.colStatus'), accessor: (o) => o.status, filterable: true },
    { key: 'situation', header: t('omsQueue.colSituation'), accessor: (o) => o.situation, filterable: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('omsQueue.title')}</h1>
        <p className="text-sm text-slate-600 mt-1">{t('omsQueue.subtitle')}</p>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <div className="sm:w-40">
            <Select label={t('omsQueue.warehouse')} value={filters.warehouse} onChange={(e) => setFilter('warehouse', e.target.value)} options={opt(options.warehouses, t('omsQueue.allMasc'))} />
          </div>
          <div className="sm:w-40">
            <Select label={t('omsQueue.company')} value={filters.company} onChange={(e) => setFilter('company', e.target.value)} options={opt(options.companies, t('omsQueue.allFem'))} />
          </div>
          <div className="sm:w-40">
            <Select label={t('omsQueue.branch')} value={filters.branch} onChange={(e) => setFilter('branch', e.target.value)} options={opt(options.branches, t('omsQueue.allFem'))} />
          </div>
          <div className="sm:w-44">
            <Select label={t('omsQueue.route')} value={filters.route} onChange={(e) => setFilter('route', e.target.value)} options={opt(options.routes, t('omsQueue.allFem'))} />
          </div>
          <div className="sm:w-40">
            <Select
              label={t('omsQueue.priority')}
              value={filters.tier}
              onChange={(e) => setFilter('tier', e.target.value)}
              options={[{ value: 'todos', label: t('omsQueue.allFem') }, ...options.tiers.map((tier) => ({ value: tier, label: TIER_LABEL[Number(tier) as PriorityTier] }))]}
            />
          </div>
          <div className="sm:w-40">
            <Select label={t('omsQueue.status')} value={filters.status} onChange={(e) => setFilter('status', e.target.value)} options={opt(options.statuses, t('omsQueue.allMasc'))} />
          </div>
          <div className="sm:w-40">
            <Select label={t('omsQueue.situation')} value={filters.situation} onChange={(e) => setFilter('situation', e.target.value)} options={opt(options.situations, t('omsQueue.allFem'))} />
          </div>
          {filtersActive && (
            <div className="col-span-2 sm:w-auto">
              <Button variant="ghost" onClick={resetFilters}>{t('omsQueue.clear')}</Button>
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
          searchPlaceholder={t('omsQueue.search')}
          exportFileName="cola_priorizacion"
          emptyMessage={filtersActive ? t('omsQueue.emptyFiltered') : t('omsQueue.emptyNoOrders')}
        />
      )}

      {detailOpen && selected && (
        <OrderDetailModal
          order={selected}
          onOverride={() => { setDetailOpen(false); setOverrideOpen(true); }}
          onClose={() => { setDetailOpen(false); setSelectedId(null); }}
        />
      )}

      {overrideOpen && selected && (
        <OverrideModal
          orderId={selected.ref}
          currentTier={selected.tier}
          onConfirm={applyOverride}
          onCancel={() => setOverrideOpen(false)}
        />
      )}
    </div>
  );
}

