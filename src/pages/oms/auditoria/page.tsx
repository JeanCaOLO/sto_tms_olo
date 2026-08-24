import { useState } from 'react';
import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import Select from '../../../components/base/Select';
import { mockAuditLog } from '../mockData';

export default function OmsAuditoria() {
  const [filterType, setFilterType] = useState('all');

  const filtered = mockAuditLog.filter(
    (entry) => filterType === 'all' || entry.change_type === filterType
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Auditoría de Priorización</h1>
          <p className="text-sm text-slate-600 mt-1">
            Historial de cambios de prioridad, automáticos y manuales
          </p>
        </div>
      </div>

      <Card>
        <div className="mb-6 w-48">
          <Select
            options={[
              { value: 'all', label: 'Todos los cambios' },
              { value: 'automatico', label: 'Automáticos' },
              { value: 'manual', label: 'Manuales' },
            ]}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Pedido</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Tipo</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Cambio</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Motivo</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Usuario</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 text-sm font-medium text-slate-900">{entry.order_number}</td>
                  <td className="py-3 px-4">
                    <Badge variant={entry.change_type === 'manual' ? 'info' : 'default'} size="sm">
                      {entry.change_type === 'manual' ? 'Manual' : 'Automático'}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-700">
                    {entry.previous_tier} → {entry.new_tier}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-700">{entry.reason}</td>
                  <td className="py-3 px-4 text-sm text-slate-700">{entry.actor}</td>
                  <td className="py-3 px-4 text-sm text-slate-500">
                    {new Date(entry.created_at).toLocaleString('es-CL')}
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
