import Card from '../../../components/base/Card';
import OmsPageHeader from '../components/OmsPageHeader';
import PriorityBadge from '../components/PriorityBadge';
import OrderDetailModal from './OrderDetailModal';
import OverrideModal from './OverrideModal';
import { useColaController } from './useColaController';

// Pantalla Cola de Priorización (FR2/FR3): tabla completa ordenada por score.
// El detalle del pedido se muestra en un modal (con el botón de override dentro).
export default function OmsColaPage() {
  const {
    country, setCountry, orders, loading, error,
    selectedId, setSelectedId, selected,
    detailOpen, setDetailOpen,
    overrideOpen, setOverrideOpen, applyOverride,
  } = useColaController();

  return (
    <div className="space-y-6">
      <OmsPageHeader
        title="Cola de Priorización"
        subtitle="Pedidos pendientes ordenados por prioridad calculada"
        country={country}
        onCountryChange={setCountry}
      />

      <Card padding={false}>
        {loading && (
          <div className="flex items-center justify-center h-64">
            <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
          </div>
        )}
        {!loading && error && <div className="p-6 text-sm text-red-600">{error}</div>}
        {!loading && !error && orders.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <i className="ri-inbox-line text-3xl"></i>
            <p className="mt-2 text-sm">No hay pedidos pendientes para este país.</p>
          </div>
        )}
        {!loading && !error && orders.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Prioridad</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Pedido</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Ref.</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Cliente</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Ruta</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">N.º artículos</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Fecha despacho</th>
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
                    <td className="py-3 px-4 text-sm text-slate-500">{o.ref}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{o.customer}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{o.route}</td>
                    <td className="py-3 px-4 text-sm text-slate-700 text-right">{o.itemCount}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{o.dispatchDate}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{o.readyToPrepDate}</td>
                    <td className="py-3 px-4 text-sm font-semibold text-slate-900 text-right">{o.score}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">{o.status}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">{o.situation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 text-xs text-slate-500 border-t border-slate-100">
              Mostrando {orders.length} pedido{orders.length > 1 ? 's' : ''} · orden por score desc. · Prioridad 1 = más urgente
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
