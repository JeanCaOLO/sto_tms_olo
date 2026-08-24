import Card from '../../../components/base/Card';
import StatCard from '../../../components/feature/StatCard';
import PriorityBadge from '../components/PriorityBadge';
import { mockKpis, mockQueueOrders } from '../mockData';

export default function OmsPanel() {
  const slaAtRisk = mockQueueOrders.filter((order) => order.sla_at_risk);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Panel OMS</h1>
          <p className="text-sm text-slate-600 mt-1">Salud del motor de priorización de pedidos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Pedidos pendientes"
          value={mockKpis.pendientes}
          icon="ri-file-list-3-line"
          color="teal"
        />
        <StatCard
          title="SLA en riesgo"
          value={mockKpis.slaEnRiesgo}
          icon="ri-alarm-warning-line"
          color="amber"
        />
        <StatCard
          title="Re-priorizados manual"
          value={`${mockKpis.reprioritizadosManualPct}%`}
          icon="ri-hand-coin-line"
          color="blue"
        />
        <StatCard
          title="Antigüedad promedio"
          value={`${mockKpis.antiguedadPromedioHoras} h`}
          icon="ri-time-line"
          color="red"
        />
      </div>

      <Card>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-900">Pedidos con SLA en riesgo</h2>
          <a href="/oms/cola" className="text-sm text-teal-600 hover:text-teal-700 font-medium cursor-pointer">
            Ver cola completa
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Pedido</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Cliente</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Entrega</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Prioridad</th>
              </tr>
            </thead>
            <tbody>
              {slaAtRisk.map((order) => (
                <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 text-sm font-medium text-slate-900">{order.order_number}</td>
                  <td className="py-3 px-4 text-sm text-slate-700">{order.customer_name}</td>
                  <td className="py-3 px-4 text-sm text-slate-700">
                    {new Date(order.delivery_date).toLocaleDateString('es-CL')}
                  </td>
                  <td className="py-3 px-4">
                    <PriorityBadge tier={order.priority_tier} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
