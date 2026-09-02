import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import OmsPageHeader from '../components/OmsPageHeader';
import PriorityBadge from '../components/PriorityBadge';
import OverrideModal from './OverrideModal';
import { useColaController } from './useColaController';

// Pantalla Cola de Priorización (FR2/FR3): tabla ordenada por score +
// panel lateral de detalle + override manual (única intervención humana).
export default function OmsColaPage() {
  const {
    country, setCountry, orders, loading, error,
    selectedId, setSelectedId, selected,
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2" padding={false}>
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
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Tier</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Pedido</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Cliente</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Ruta</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">RTP</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => setSelectedId(o.id)}
                      className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${selectedId === o.id ? 'bg-teal-50' : ''}`}
                    >
                      <td className="py-3 px-4"><PriorityBadge tier={o.tier} /></td>
                      <td className="py-3 px-4 text-sm font-medium text-slate-900">{o.id}</td>
                      <td className="py-3 px-4 text-sm text-slate-700">{o.customer}</td>
                      <td className="py-3 px-4 text-sm text-slate-700">{o.route}</td>
                      <td className="py-3 px-4 text-sm text-slate-700">{o.readyToPrepDate}</td>
                      <td className="py-3 px-4 text-sm font-semibold text-slate-900">{o.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 text-xs text-slate-500 border-t border-slate-100">
                Mostrando {orders.length} pedido{orders.length > 1 ? 's' : ''} · orden por score desc.
              </div>
            </div>
          )}
        </Card>

        <Card>
          {!selected ? (
            <div className="text-center py-12 text-slate-500">
              <i className="ri-side-bar-line text-3xl"></i>
              <p className="mt-2 text-sm">Selecciona un pedido para ver el detalle.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">{selected.id}</h2>
                <PriorityBadge tier={selected.tier} />
              </div>
              <dl className="text-sm space-y-1">
                <div className="flex justify-between"><dt className="text-slate-500">Cliente</dt><dd className="text-slate-900">{selected.customer}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Ruta</dt><dd className="text-slate-900">{selected.route}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Ingreso</dt><dd className="text-slate-900">{selected.intakeTime}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">RTP</dt><dd className="text-slate-900">{selected.readyToPrepDate}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Estado</dt><dd className="text-slate-900">{selected.status}</dd></div>
              </dl>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-2">Reglas aplicadas</h3>
                {selected.appliedRules.length === 0 ? (
                  <p className="text-sm text-slate-500">Sin reglas aplicables · score 0 · tier más bajo.</p>
                ) : (
                  <ul className="text-sm space-y-1">
                    {selected.appliedRules.map((r) => (
                      <li key={r.name} className="flex justify-between">
                        <span className="text-slate-600">{r.name}</span>
                        <span className="font-medium text-slate-900">+{r.weight}</span>
                      </li>
                    ))}
                    <li className="flex justify-between border-t border-slate-100 pt-1 mt-1">
                      <span className="text-slate-500">Suma = score</span>
                      <span className="font-semibold text-slate-900">{selected.score}</span>
                    </li>
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-2">Historial</h3>
                <ul className="text-xs space-y-1 text-slate-600">
                  {selected.history.map((h, i) => (
                    <li key={i}>
                      {h.at} · {h.from} → {h.to} ({h.type}){h.reason ? ` — ${h.reason}` : ''}
                    </li>
                  ))}
                </ul>
              </div>

              <Button className="w-full" icon={<i className="ri-edit-line"></i>} onClick={() => setOverrideOpen(true)}>
                Alterar prioridad
              </Button>
            </div>
          )}
        </Card>
      </div>

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
