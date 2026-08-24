import { useEffect, useState } from 'react';
import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import PriorityBadge from './PriorityBadge';
import type { OmsOrder, PriorityTier } from '../mockData';

interface QueueSidePanelProps {
  order: OmsOrder | null;
  onClose: () => void;
  onOverride: (orderId: string, tier: PriorityTier, reason: string) => void;
}

export default function QueueSidePanel({ order, onClose, onOverride }: QueueSidePanelProps) {
  const [tier, setTier] = useState<PriorityTier>(order?.priority_tier ?? 'media');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (order) {
      setTier(order.priority_tier);
      setReason('');
    }
  }, [order]);

  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{order.order_number}</h2>
            <p className="text-sm text-slate-500">{order.customer_name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <i className="ri-close-line text-slate-500 text-lg"></i>
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center gap-2">
            <PriorityBadge tier={order.priority_tier} />
            <span className="text-sm text-slate-500">Score: {order.priority_score}</span>
            {order.sla_at_risk && <Badge variant="warning" size="sm">SLA en riesgo</Badge>}
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Reglas que aplicaron</p>
            <div className="flex flex-wrap gap-1.5">
              {order.matched_rules.length === 0 && (
                <span className="text-xs text-slate-400">Ninguna regla coincidió</span>
              )}
              {order.matched_rules.map((rule) => (
                <span key={rule} className="text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded-full">
                  {rule}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-slate-500">Tienda</p>
              <p className="text-slate-900 font-medium">{order.store_name}</p>
            </div>
            <div>
              <p className="text-slate-500">Entrega</p>
              <p className="text-slate-900 font-medium">
                {new Date(order.delivery_date).toLocaleDateString('es-CL')}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Peso / Volumen</p>
              <p className="text-slate-900 font-medium">{order.total_weight} kg / {order.total_volume} m³</p>
            </div>
            <div>
              <p className="text-slate-500">Monto</p>
              <p className="text-slate-900 font-medium">${order.total_amount.toLocaleString('es-CL')}</p>
            </div>
          </div>

          {order.overridden && (
            <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
              Prioridad forzada manualmente por {order.override_by}: "{order.override_reason}"
            </div>
          )}

          <Card padding={false} className="p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-900">Forzar prioridad manualmente</p>
            <Select
              label="Nuevo nivel"
              value={tier}
              onChange={(e) => setTier(e.target.value as PriorityTier)}
              options={[
                { value: 'alta', label: 'Alta' },
                { value: 'media', label: 'Media' },
                { value: 'baja', label: 'Baja' },
              ]}
            />
            <Input
              label="Motivo (obligatorio)"
              placeholder="Ej: cliente escaló el caso por teléfono"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              variant="primary"
              className="w-full"
              disabled={!reason.trim()}
              onClick={() => {
                onOverride(order.id, tier, reason.trim());
                onClose();
              }}
            >
              Aplicar override
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
