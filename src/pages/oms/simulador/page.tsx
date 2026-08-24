import { useState } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import PriorityBadge from '../components/PriorityBadge';
import { mockQueueOrders } from '../mockData';
import type { OmsOrder } from '../mockData';

const BOOST_RULE_LABEL = 'Producto perecedero';
const BOOST_POINTS = 25;

function sortByScore(orders: OmsOrder[]) {
  return [...orders].sort((a, b) => b.priority_score - a.priority_score);
}

export default function OmsSimulador() {
  const [boostActive, setBoostActive] = useState(false);

  const actual = sortByScore(mockQueueOrders);
  const simulada = sortByScore(
    mockQueueOrders.map((order) =>
      boostActive && order.matched_rules.includes(BOOST_RULE_LABEL)
        ? { ...order, priority_score: Math.min(100, order.priority_score + BOOST_POINTS) }
        : order
    )
  );

  const renderList = (list: OmsOrder[], title: string) => (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900 mb-4">{title}</h2>
      <div className="space-y-2">
        {list.map((order, index) => (
          <div
            key={order.id}
            className="flex items-center justify-between py-2 px-3 rounded-lg border border-slate-100"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400 w-5">{index + 1}</span>
              <div>
                <p className="text-sm font-medium text-slate-900">{order.order_number}</p>
                <p className="text-xs text-slate-500">{order.customer_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">{order.priority_score}</span>
              <PriorityBadge tier={order.priority_tier} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Simulador de Reglas</h1>
          <p className="text-sm text-slate-600 mt-1">
            Previsualiza el efecto de un cambio de regla antes de activarlo en producción
          </p>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">Cambio a simular</p>
            <p className="text-xs text-slate-500 mt-1">
              Subir +{BOOST_POINTS} puntos a pedidos marcados como "{BOOST_RULE_LABEL}"
            </p>
          </div>
          <Button
            variant={boostActive ? 'primary' : 'secondary'}
            onClick={() => setBoostActive(!boostActive)}
          >
            {boostActive ? 'Simulación activa' : 'Activar simulación'}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderList(actual, 'Cola actual')}
        {renderList(simulada, 'Cola simulada')}
      </div>
    </div>
  );
}
