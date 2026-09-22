import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Select from '../../../components/base/Select';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import OmsPageHeader from '../components/OmsPageHeader';
import PriorityBadge from '../components/PriorityBadge';
import { TIER_LABEL, type PriorityTier, type QueueOrder } from '../types';
import OrderDetailModal from './OrderDetailModal';
import OverrideModal from './OverrideModal';
import { useColaController } from './useColaController';

const money = (n: number) => n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Pantalla Cola de Priorización (FR2/FR3): tabla completa + filtros.
// El detalle del pedido se muestra en un modal (con el botón de override dentro).
export default function OmsColaPage() {
  const {
    country, setCountry, orders, loading, error,
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
    { key: 'tier', header: 'Prioridad', accessor: (o) => o.tier, sortable: true, render: (o) => <PriorityBadge tier={o.tier} /> },
    { key: 'ref', header: 'Pedido', accessor: (o) => o.ref, sortable: true, render: (o) => <span className="font-medium text-slate-900">{o.ref}</span> },
    { key: 'warehouseId', header: 'ID Almacén', accessor: (o) => o.warehouseId, sortable: true, filterable: true },
    { key: 'companyId', header: 'ID Compañía', accessor: (o) => o.companyId, sortable: true, filterable: true },
    { key: 'branchId', header: 'ID Sucursal', accessor: (o) => o.branchId, sortable: true, filterable: true },
    { key: 'orderType', header: 'Tipo de Orden', accessor: (o) => o.orderType, sortable: true, filterable: true },
    { key: 'customer', header: 'Cliente', accessor: (o) => o.customer, sortable: true, filterable: true },
    { key: 'route', header: 'Ruta', accessor: (o) => o.route, sortable: true, filterable: true },
    { key: 'totalAmount', header: 'Monto Total', accessor: (o) => o.totalAmount, sortable: true, align: 'right', render: (o) => money(o.totalAmount) },
    { key: 'weight', header: 'Peso (kg)', accessor: (o) => o.weight, sortable: true, align: 'right', render: (o) => o.weight.toFixed(1) },
    { key: 'volume', header: 'Volumen (m³)', accessor: (o) => o.volume, sortable: true, align: 'right', render: (o) => o.volume.toFixed(1) },
    { key: 'itemCount', header: 'N.º artículos', accessor: (o) => o.itemCount, sortable: true, align: 'right' },
    {
      key: 'observations',
      header: 'Observaciones',
      accessor: (o) => o.observations,
      render: (o) => <span className="max-w-[220px] truncate block" title={o.observations}>{o.observations}</span>,
    },
    { key: 'dispatchDate', header: 'Fecha Despacho', accessor: (o) => o.dispatchDate, sortable: true },
    { key: 'createdDate', header: 'Fecha creación', accessor: (o) => o.createdDate, sortable: true },
    { key: 'readyToPrepDate', header: 'Fecha Alisto', accessor: (o) => o.readyToPrepDate, sortable: true },
    { key: 'score', header: 'Score', accessor: (o) => o.score, sortable: true, align: 'right', render: (o) => <span className="font-semibold text-slate-900">{o.score}</span> },
    { key: 'status', header: 'Estado', accessor: (o) => o.status, filterable: true },
    { key: 'situation', header: 'Situación', accessor: (o) => o.situation, filterable: true },
  ];

  return (
    <div className="space-y-6">
      <OmsPageHeader
        title="Cola de Priorización"
        subtitle="Pedidos pendientes ordenados por prioridad calculada"
        country={country}
        onCountryChange={setCountry}
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Select label="Almacén" value={filters.warehouse} onChange={(e) => setFilter('warehouse', e.target.value)} options={opt(options.warehouses, 'Todos')} />
          </div>
          <div className="w-40">
            <Select label="Compañía" value={filters.company} onChange={(e) => setFilter('company', e.target.value)} options={opt(options.companies, 'Todas')} />
          </div>
          <div className="w-40">
            <Select label="Sucursal" value={filters.branch} onChange={(e) => setFilter('branch', e.target.value)} options={opt(options.branches, 'Todas')} />
          </div>
          <div className="w-44">
            <Select label="Ruta" value={filters.route} onChange={(e) => setFilter('route', e.target.value)} options={opt(options.routes, 'Todas')} />
          </div>
          <div className="w-40">
            <Select
              label="Prioridad"
              value={filters.tier}
              onChange={(e) => setFilter('tier', e.target.value)}
              options={[{ value: 'todos', label: 'Todas' }, ...options.tiers.map((t) => ({ value: t, label: TIER_LABEL[Number(t) as PriorityTier] }))]}
            />
          </div>
          <div className="w-40">
            <Select label="Estado" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} options={opt(options.statuses, 'Todos')} />
          </div>
          <div className="w-40">
            <Select label="Situación" value={filters.situation} onChange={(e) => setFilter('situation', e.target.value)} options={opt(options.situations, 'Todas')} />
          </div>
          {filtersActive && (
            <Button variant="ghost" onClick={resetFilters}>Limpiar</Button>
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
          searchPlaceholder="Pedido, ref., cliente..."
          exportFileName="cola_priorizacion"
          emptyMessage={filtersActive ? 'Ningún pedido cumple los filtros.' : 'No hay pedidos pendientes para este país.'}
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
