import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AdminModal from '../../configuracion/components/AdminModal';
import Button from '../../../components/base/Button';
import type { PlanStop } from '../planes-types';
import type { Articulo } from '../types';
import { fetchArticulosDePedido } from '../plan-pedidos-api';

interface Props {
  parada: PlanStop | null;
  onClose: () => void;
}

const DASH = '—';

// Detalle de una parada (el pedido que se entrega ahí). Reutiliza AdminModal del
// design system. Una sola instancia vive en PlanTripCard; aquí solo renderiza.
export default function ParadaModal({ parada, onClose }: Props) {
  const { t } = useTranslation();
  const [articulos, setArticulos] = useState<Articulo[] | null>(null);

  // Carga las líneas del pedido al abrir (GET .../pedidos/{id}/articulos).
  useEffect(() => {
    if (!parada) {
      setArticulos(null);
      return;
    }
    let vivo = true;
    setArticulos(null);
    fetchArticulosDePedido(parada.order_id).then((a) => {
      if (vivo) setArticulos(a);
    });
    return () => {
      vivo = false;
    };
  }, [parada]);

  if (!parada) return null;

  const ubicacion = [parada.delivery_city, parada.delivery_zone].filter(Boolean).join(' · ') || DASH;
  const coords =
    parada.delivery_latitude != null && parada.delivery_longitude != null
      ? `${parada.delivery_latitude}, ${parada.delivery_longitude}`
      : DASH;
  const peso = parada.total_weight != null ? `${parada.total_weight} kg` : DASH;
  const volumen = parada.total_volume != null ? `${parada.total_volume} m³` : DASH;

  const filas: [string, string][] = [
    [t('planning.customer'), parada.customer_name || DASH],
    [t('planning.orderNumber'), parada.order_number || DASH],
    [t('planning.location'), ubicacion],
    [t('planning.coordinates'), coords],
    [t('planning.weight'), peso],
    [t('planning.volume'), volumen],
  ];

  return (
    <AdminModal title={t('planning.stopDetail')} onClose={onClose}>
      <dl className="px-6 py-4 space-y-3">
        {filas.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 text-sm">
            <dt className="text-slate-500 shrink-0">{label}</dt>
            <dd className="text-slate-800 font-medium text-right break-words">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="px-6 pb-4">
        <p className="text-[11px] uppercase tracking-wide text-slate-400 font-medium mb-2">
          {t('planning.articles')}
        </p>
        {articulos === null ? (
          <p className="text-sm text-slate-400 flex items-center gap-2">
            <i className="ri-loader-4-line animate-spin"></i>
            {t('planning.loadingArticles')}
          </p>
        ) : articulos.length === 0 ? (
          <p className="text-sm text-slate-400">{t('planning.noArticles')}</p>
        ) : (
          <div className="max-h-56 overflow-auto rounded-lg border border-slate-100">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-1.5 px-2 font-medium">{t('planning.product')}</th>
                  <th className="py-1.5 px-2 font-medium text-right">{t('planning.quantity')}</th>
                  <th className="py-1.5 px-2 font-medium text-right">{t('planning.weight')}</th>
                  <th className="py-1.5 px-2 font-medium">{t('planning.guia')}</th>
                </tr>
              </thead>
              <tbody>
                {articulos.map((a, i) => (
                  <tr key={`${a.product_code}-${i}`} className="border-t border-slate-50">
                    <td className="py-1.5 px-2 text-slate-800">
                      <span className="font-mono text-xs text-slate-400 mr-1">{a.product_code}</span>
                      {a.product_name}
                    </td>
                    <td className="py-1.5 px-2 text-right text-slate-600">{a.quantity}</td>
                    <td className="py-1.5 px-2 text-right text-slate-600">
                      {a.weight != null ? `${a.weight} kg` : DASH}
                    </td>
                    <td className="py-1.5 px-2 text-slate-500 font-mono text-xs">{a.guia_fiscal || DASH}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          {t('planning.close')}
        </Button>
      </div>
    </AdminModal>
  );
}
