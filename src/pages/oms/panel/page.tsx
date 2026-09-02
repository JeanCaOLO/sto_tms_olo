import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import StatCard from '../../../components/feature/StatCard';
import OmsPageHeader from '../components/OmsPageHeader';
import { TIER_LABEL, type PriorityTier } from '../types';
import { usePanelController } from './usePanelController';

// Colores por tier para la distribución (paleta del design system, tema claro).
const TIER_BAR: Record<PriorityTier, { dot: string; bar: string; text: string }> = {
  critico: { dot: 'bg-red-500', bar: 'bg-red-500', text: 'text-red-600' },
  alto: { dot: 'bg-amber-500', bar: 'bg-amber-500', text: 'text-amber-600' },
  medio: { dot: 'bg-teal-500', bar: 'bg-teal-500', text: 'text-teal-600' },
  bajo: { dot: 'bg-slate-400', bar: 'bg-slate-400', text: 'text-slate-600' },
};

// Pantalla Panel OMS — dashboard de salud del motor (FR4).
export default function OmsPanelPage() {
  const { country, setCountry, kpis, alerts, distribution, loading, error } = usePanelController();

  const maxCount = Math.max(1, ...distribution.map((d) => d.count));

  return (
    <div className="space-y-6">
      <OmsPageHeader
        title="Panel OMS"
        subtitle="Salud del motor de priorización e indicadores operativos"
        country={country}
        onCountryChange={setCountry}
      />

      {loading && (
        <div className="flex items-center justify-center h-64">
          <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
        </div>
      )}

      {!loading && error && (
        <Card className="border-amber-200 bg-amber-50">
          <div className="flex items-center gap-3 text-amber-800">
            <i className="ri-wifi-off-line text-xl"></i>
            <div>
              <p className="text-sm font-medium">{error}</p>
              <p className="text-xs mt-1">Mostrando los últimos datos disponibles. Reintentando…</p>
            </div>
          </div>
        </Card>
      )}

      {!loading && !error && kpis && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Pendientes" value={kpis.pendientes} icon="ri-stack-line" color="teal" />
            <StatCard title="Vencidos" value={kpis.vencidos} icon="ri-alarm-warning-line" color="red" />
            <StatCard title="% override (24 h)" value={`${kpis.overridePct}%`} icon="ri-hand-coin-line" color="amber" />
            <StatCard title="Sin ruta configurada" value={kpis.sinRuta} icon="ri-question-line" color="blue" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-slate-900">Alertas activas</h2>
                <span className="text-xs text-slate-500">Actualizado hace 12 s · cada 60 s</span>
              </div>
              {alerts.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <i className="ri-checkbox-circle-line text-3xl text-emerald-500"></i>
                  <p className="mt-2 text-sm">Sin alertas activas. El motor opera con normalidad.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Severidad</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Tipo de alerta</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Pedido</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.map((a) => (
                        <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <Badge variant={a.severity === 'critica' ? 'danger' : 'warning'}>
                              {a.severity === 'critica' ? 'Crítica' : 'Atención'}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-700">{a.type}</td>
                          <td className="py-3 px-4 text-sm font-medium text-slate-900">{a.orderId}</td>
                          <td className="py-3 px-4 text-sm text-slate-500">{a.timestamp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card>
              <div className="flex items-center gap-2 mb-6">
                <i className="ri-pie-chart-2-line text-teal-600 text-lg"></i>
                <h2 className="text-lg font-semibold text-slate-900">Distribución por Prioridad</h2>
              </div>
              <div className="space-y-4">
                {distribution.map((d) => {
                  const c = TIER_BAR[d.tier];
                  return (
                    <div key={d.tier} className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-sm ${c.dot}`} aria-hidden="true"></span>
                      <span className="text-sm text-slate-600 w-16">{TIER_LABEL[d.tier]}</span>
                      <span className={`text-sm font-bold w-10 text-right ${c.text}`}>{d.count}</span>
                      <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${c.bar}`}
                          style={{ width: `${Math.round((d.count / maxCount) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500">
                Total pedidos: {distribution.reduce((s, d) => s + d.count, 0)}
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
