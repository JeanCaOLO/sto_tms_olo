import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import OmsPageHeader from '../components/OmsPageHeader';
import PriorityBadge from '../components/PriorityBadge';
import { TIER_LABEL, type PriorityTier } from '../types';
import OrderDetailModal from './OrderDetailModal';
import OverrideModal from './OverrideModal';
import { useColaController } from './useColaController';

const money = (n: number) => n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Pantalla Cola de Priorización (FR2/FR3): tabla completa + filtros.
// El detalle del pedido se muestra en un modal (con el botón de override dentro).
export default function OmsColaPage() {
  const {
    country, setCountry, orders, filteredCount, loading, error,
    filters, setFilter, resetFilters, filtersActive, options,
    page, pageSize, setPageSize, goToPage, totalPages, pageStart,
    selectedId, setSelectedId, selected,
    detailOpen, setDetailOpen,
    overrideOpen, setOverrideOpen, applyOverride,
  } = useColaController();

  const opt = (all: string[], allLabel: string) => [
    { value: 'todos', label: allLabel },
    ...all.map((v) => ({ value: v, label: v })),
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
          <div className="w-64">
            <Input label="Buscar" icon="ri-search-line" placeholder="Pedido, ref., cliente…" value={filters.query} onChange={(e) => setFilter('query', e.target.value)} />
          </div>
          {filtersActive && (
            <Button variant="ghost" onClick={resetFilters}>Limpiar</Button>
          )}
        </div>
      </Card>

      <Card padding={false}>
        {loading && (
          <div className="flex items-center justify-center h-64">
            <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
          </div>
        )}
        {!loading && error && <div className="p-6 text-sm text-red-600">{error}</div>}
        {!loading && !error && filteredCount === 0 && (
          <div className="text-center py-12 text-slate-500">
            <i className="ri-inbox-line text-3xl"></i>
            <p className="mt-2 text-sm">
              {filtersActive ? 'Ningún pedido cumple los filtros.' : 'No hay pedidos pendientes para este país.'}
            </p>
          </div>
        )}
        {!loading && !error && filteredCount > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Prioridad</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Pedido</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">ID Almacén</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">ID Compañía</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">ID Sucursal</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Tipo de Orden</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Cliente</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Ruta</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Monto Total</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Peso (kg)</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Volumen (m³)</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">N.º artículos</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Observaciones</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Fecha Despacho</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Fecha creación</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Fecha Alisto</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Score</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Estado</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Situación</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => { setSelectedId(o.id); setDetailOpen(true); }}
                    className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${selectedId === o.id ? 'bg-teal-50' : ''}`}
                  >
                    <td className="py-3 px-4"><PriorityBadge tier={o.tier} /></td>
                    <td className="py-3 px-4 text-sm font-medium text-slate-900">{o.id}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{o.warehouseId}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{o.companyId}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{o.branchId}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{o.orderType}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{o.customer}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{o.route}</td>
                    <td className="py-3 px-4 text-sm text-slate-700 text-right">{money(o.totalAmount)}</td>
                    <td className="py-3 px-4 text-sm text-slate-700 text-right">{o.weight.toFixed(1)}</td>
                    <td className="py-3 px-4 text-sm text-slate-700 text-right">{o.volume.toFixed(1)}</td>
                    <td className="py-3 px-4 text-sm text-slate-700 text-right">{o.itemCount}</td>
                    <td className="py-3 px-4 text-sm text-slate-600 max-w-[220px] truncate" title={o.observations}>{o.observations}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{o.dispatchDate}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{o.createdDate}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{o.readyToPrepDate}</td>
                    <td className="py-3 px-4 text-sm font-semibold text-slate-900 text-right">{o.score}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">{o.status}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">{o.situation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-t border-slate-100">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span>Mostrar</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2 py-1 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                  aria-label="Pedidos por página"
                >
                  {[5, 10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span>por página · {filteredCount} pedidos</span>
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="hidden sm:inline">
                  {pageStart + 1}–{Math.min(pageStart + orders.length, filteredCount)} de {filteredCount}
                </span>
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Página anterior"
                >
                  <i className="ri-arrow-left-s-line"></i>
                </button>
                <div className="flex items-center gap-1.5">
                  <span>Página</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={page}
                    onChange={(e) => goToPage(Number(e.target.value))}
                    className="w-14 px-2 py-1 text-sm text-center border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    aria-label="Número de página"
                  />
                  <span>de {totalPages}</span>
                </div>
                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Página siguiente"
                >
                  <i className="ri-arrow-right-s-line"></i>
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {detailOpen && selected && (
        <OrderDetailModal
          order={selected}
          onOverride={() => { setDetailOpen(false); setOverrideOpen(true); }}
          onClose={() => { setDetailOpen(false); setSelectedId(null); }}
        />
      )}

      {overrideOpen && selected && (
        <OverrideModal
          orderId={selected.id}
          currentTier={selected.tier}
          onConfirm={applyOverride}
          onCancel={() => setOverrideOpen(false)}
        />
      )}
    </div>
  );
}
