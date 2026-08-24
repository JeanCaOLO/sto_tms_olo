import { useState } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import Badge from '../../../components/base/Badge';
import PriorityBadge from '../components/PriorityBadge';
import QueueSidePanel from '../components/QueueSidePanel';
import { mockQueueOrders } from '../mockData';
import type { OmsOrder, PriorityTier } from '../mockData';

export default function OmsCola() {
  const [orders, setOrders] = useState<OmsOrder[]>(mockQueueOrders);
  const [filters, setFilters] = useState({ search: '', tier: 'all' });
  const [selected, setSelected] = useState<OmsOrder | null>(null);

  const filtered = orders
    .filter((order) => filters.tier === 'all' || order.priority_tier === filters.tier)
    .filter(
      (order) =>
        order.order_number.toLowerCase().includes(filters.search.toLowerCase()) ||
        order.customer_name.toLowerCase().includes(filters.search.toLowerCase())
    )
    .sort((a, b) => b.priority_score - a.priority_score);

  const handleOverride = (orderId: string, tier: PriorityTier, reason: string) => {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? { ...order, priority_tier: tier, overridden: true, override_reason: reason, override_by: 'Tú' }
          : order
      )
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cola de Priorización</h1>
          <p className="text-sm text-slate-600 mt-1">Pedidos pendientes ordenados según el motor de reglas</p>
        </div>
      </div>

      <Card>
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <Input
              placeholder="Buscar por número de pedido o cliente..."
              icon={<i className="ri-search-line"></i>}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
          <div className="w-48">
            <Select
              options={[
                { value: 'all', label: 'Todos los niveles' },
                { value: 'alta', label: 'Alta' },
                { value: 'media', label: 'Media' },
                { value: 'baja', label: 'Baja' },
              ]}
              value={filters.tier}
              onChange={(e) => setFilters({ ...filters, tier: e.target.value })}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">#</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Pedido</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Cliente</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Entrega</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Score</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Prioridad</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order, index) => (
                <tr
                  key={order.id}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setSelected(order)}
                >
                  <td className="py-3 px-4 text-sm text-slate-500">{index + 1}</td>
                  <td className="py-3 px-4">
                    <p className="text-sm font-medium text-slate-900">{order.order_number}</p>
                    {order.overridden && <p className="text-xs text-blue-600">Override manual</p>}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-700">{order.customer_name}</td>
                  <td className="py-3 px-4 text-sm text-slate-700">
                    {new Date(order.delivery_date).toLocaleDateString('es-CL')}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-700">{order.priority_score}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <PriorityBadge tier={order.priority_tier} />
                      {order.sla_at_risk && <Badge variant="warning" size="sm">SLA</Badge>}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
                      <i className="ri-arrow-right-s-line text-slate-500 w-4 h-4 flex items-center justify-center"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-200">
          <p className="text-sm text-slate-600">
            Mostrando {filtered.length} de {orders.length} pedidos
          </p>
          <Button variant="secondary" size="sm" icon={<i className="ri-refresh-line"></i>}>
            Recalcular
          </Button>
        </div>
      </Card>

      <QueueSidePanel order={selected} onClose={() => setSelected(null)} onOverride={handleOverride} />
    </div>
  );
}
