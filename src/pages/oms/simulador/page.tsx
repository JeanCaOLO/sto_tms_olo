import { useState } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import PriorityBadge from '../components/PriorityBadge';
import { queueOrders } from '../mockData';
import type { PriorityTier } from '../types';

// Pantalla Simulador de Reglas (FR6): comparación cola actual vs. simulada.
// Mock: la "simulación" baja un nivel a los pedidos de tier alto para ilustrar.
export default function OmsSimuladorPage() {
  const [ran, setRan] = useState(false);
  const [running, setRunning] = useState(false);

  const demote: Record<PriorityTier, PriorityTier> = { critico: 'alto', alto: 'medio', medio: 'bajo', bajo: 'bajo' };
  const scoreForTier: Record<PriorityTier, number> = { critico: 950, alto: 650, medio: 350, bajo: 50 };

  const current = queueOrders.slice().sort((a, b) => b.score - a.score);
  const simulated = current
    .map((o) => ({ ...o, tier: demote[o.tier], score: scoreForTier[demote[o.tier]] }))
    .sort((a, b) => b.score - a.score);

  const changed = simulated.filter((s) => {
    const c = current.find((o) => o.id === s.id);
    return c && c.tier !== s.tier;
  }).length;

  const run = () => {
    setRunning(true);
    setTimeout(() => { setRunning(false); setRan(true); }, 700);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Simulador de Reglas</h1>
          <p className="text-sm text-slate-600 mt-1">Previsualiza el efecto de un cambio de reglas antes de aplicarlo</p>
        </div>
        <Button icon={<i className="ri-play-line"></i>} onClick={run} disabled={running}>
          {running ? 'Simulando…' : 'Simular'}
        </Button>
      </div>

      {!ran && !running && (
        <Card>
          <div className="text-center py-12 text-slate-500">
            <i className="ri-flask-line text-3xl"></i>
            <p className="mt-2 text-sm">Pulsa "Simular" para previsualizar cómo se reordenaría la cola.</p>
          </div>
        </Card>
      )}

      {running && (
        <Card>
          <div className="flex items-center justify-center h-40 gap-3 text-slate-500">
            <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
            <span className="text-sm">Recalculando hasta 10.000 pedidos…</span>
          </div>
        </Card>
      )}

      {ran && !running && (
        <>
          <Card className="bg-amber-50 border-amber-200">
            <p className="text-sm text-amber-800">
              <i className="ri-alert-line mr-1"></i>
              Resumen: {simulated.length} pedidos afectados · {changed} cambian de tier ·
              {' '}{Math.round((changed / simulated.length) * 100)}% cambia de posición.
            </p>
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[{ title: 'Cola ACTUAL', rows: current }, { title: 'Cola SIMULADA', rows: simulated }].map((col) => (
              <Card key={col.title} padding={false}>
                <h2 className="text-sm font-semibold text-slate-900 p-4 pb-2">{col.title}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">Pedido</th>
                        <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">Tier</th>
                        <th className="text-left py-2 px-4 text-sm font-semibold text-slate-700">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {col.rows.map((o) => (
                        <tr key={o.id} className="border-b border-slate-100">
                          <td className="py-2 px-4 text-sm font-medium text-slate-900">{o.id}</td>
                          <td className="py-2 px-4"><PriorityBadge tier={o.tier} /></td>
                          <td className="py-2 px-4 text-sm text-slate-700">{o.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
          <div className="flex justify-end">
            <Button variant="success" icon={<i className="ri-check-line"></i>}>Aplicar como reglas activas</Button>
          </div>
        </>
      )}
    </div>
  );
}
