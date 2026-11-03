import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import { usePermissions } from '../../../hooks/usePermissions';
import { cambiarFechaEntrega, type BandejaOrder } from './bandeja-api';
import KindBadge from './KindBadge';

interface BandejaDetailModalProps {
  order: BandejaOrder;
  onClose: () => void;
  onDateChanged: () => void;
}

// Detalle del pedido en Bandeja. A diferencia del detalle de la Cola, no muestra
// prioridad/score/estado/situación ni el override: en la bandeja el pedido todavía
// no está priorizado. Lo único editable es la fecha de entrega, solo para un admin
// y solo en pedidos (no devoluciones) que el OMS aún no liberó a eFlow.
export default function BandejaDetailModal({ order, onClose, onDateChanged }: BandejaDetailModalProps) {
  const { t } = useTranslation();
  const { isAdmin } = usePermissions();
  const [fecha, setFecha] = useState(order.dispatchDate);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const puedeCambiar = isAdmin && order.kind === 'delivery' && !order.released;

  async function guardarFecha() {
    setGuardando(true); setError(null);
    const err = await cambiarFechaEntrega(order.id, fecha);
    setGuardando(false);
    if (err) { setError(err); return; }
    onDateChanged();
  }

  const dato = (label: string, value: string | number) => (
    <div className="flex justify-between gap-3"><span className="text-slate-500">{label}</span><span className="text-slate-900 text-right">{value}</span></div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40" role="dialog" aria-modal="true" aria-label={`Detalle del pedido ${order.ref}`}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto scrollbar-hide">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">{order.ref}</h3>
            <KindBadge order={order} />
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {order.kind === 'pickup' && (
          <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            {t('omsBandeja.returnReason')} <span className="font-medium">{order.returnReason}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-5">
          {dato('ID Almacén', order.warehouseId)}
          {dato('ID Compañía', order.companyId)}
          {dato('ID Sucursal', order.branchId)}
          {dato('Cliente', order.customer)}
          {dato('Zona', order.route)}
          {order.kind === 'delivery' && dato('Monto Total', order.totalAmount.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
          {order.kind === 'delivery' && dato('Peso (kg)', order.weight.toFixed(1))}
          {order.kind === 'delivery' && dato('Volumen (m³)', order.volume.toFixed(1))}
          {dato(order.kind === 'pickup' ? 'Cantidad' : 'Artículos', order.itemCount)}
          {dato(order.kind === 'pickup' ? 'Fecha devolución' : 'Fecha entrega', order.dispatchDate)}
          {order.dateChanges > 0 && dato(t('omsBandeja.eflowDate'), order.eflowDate)}
          {dato('Fecha creación', order.createdDate)}
        </div>

        <div className="mb-6">
          <span className="text-sm text-slate-500">Observaciones</span>
          <p className="text-sm text-slate-900 mt-1">{order.observations}</p>
        </div>

        {puedeCambiar && (
          <div className="mb-6 rounded-md border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-900 mb-2">{t('omsBandeja.changeDateTitle')}</p>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input type="date" label={t('omsBandeja.newDate')} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <Button onClick={guardarFecha} disabled={guardando || !fecha || fecha === order.dispatchDate}>
                {guardando ? t('omsBandeja.saving') : t('omsBandeja.changeDate')}
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-2">{t('omsBandeja.changeDateHint')}</p>
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </div>
        )}
        {isAdmin && order.kind === 'delivery' && order.released && (
          <p className="mb-6 text-xs text-slate-500">{t('omsBandeja.changeDateReleased')}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}
