import { useState } from 'react';
import Badge from '../../../components/base/Badge';
import Button from '../../../components/base/Button';
import ParadaModal from '../../planificacion/components/ParadaModal';
import type { PlanStop } from '../../planificacion/planes-types';
import type { Guia } from '../guia-model';

interface Props {
  guia: Guia;
  onClose: () => void;
}

const DASH = '—';
const fecha = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES');

// Detalle de una guía de despacho = un viaje con sus paradas en secuencia.
// Informativo + imprimible (window.print, aislado con #guia-imprimible). Clic
// en una parada abre su detalle con los artículos (ParadaModal, reutilizado).
export default function GuideDetailModal({ guia, onClose }: Props) {
  const [parada, setParada] = useState<PlanStop | null>(null);
  const stops = [...guia.trip.stops].sort((a, b) => a.stop_order - b.stop_order);

  const datos: [string, string][] = [
    ['Fecha', fecha(guia.plan_date)],
    ['Ruta / Zona', guia.zona || DASH],
    ['Conductor', guia.conductor],
    ['Vehículo', guia.vehiculo],
    ['Paradas', String(guia.paradas)],
    ['Peso total', guia.peso != null ? `${guia.peso} kg` : DASH],
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #guia-imprimible, #guia-imprimible * { visibility: visible !important; }
        #guia-imprimible { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
        .no-print { display: none !important; }
      }`}</style>

      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between no-print">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800 font-mono">{guia.guide_number}</h2>
            {guia.plan_status === 'completed' ? (
              <Badge variant="success">Completada</Badge>
            ) : (
              <Badge variant="info">Confirmada</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => window.print()}>
              <i className="ri-printer-line mr-1"></i>Imprimir
            </Button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              aria-label="Cerrar"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>
        </div>

        <div id="guia-imprimible" className="p-6">
          <div className="hidden print:block mb-4">
            <h1 className="text-2xl font-bold">Guía de Despacho {guia.guide_number}</h1>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-5">
            {datos.map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-500">{k}</span>
                <span className="text-slate-900 font-medium text-right">{v}</span>
              </div>
            ))}
          </div>

          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-medium mb-2">Paradas de la ruta</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                <th className="py-1.5 pr-2 font-medium w-8">#</th>
                <th className="py-1.5 pr-2 font-medium">Cliente</th>
                <th className="py-1.5 pr-2 font-medium">Pedido</th>
                <th className="py-1.5 pr-2 font-medium">Ubicación</th>
                <th className="py-1.5 pl-2 font-medium text-right">Peso</th>
              </tr>
            </thead>
            <tbody>
              {stops.map((s) => (
                <tr
                  key={s.id || s.order_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setParada(s)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setParada(s);
                    }
                  }}
                  className="border-b border-slate-50 cursor-pointer hover:bg-slate-50 print:cursor-auto"
                  title="Ver artículos del pedido"
                >
                  <td className="py-2 pr-2 font-semibold text-teal-600">{s.stop_order}</td>
                  <td className="py-2 pr-2 text-slate-800 font-medium">{s.customer_name || DASH}</td>
                  <td className="py-2 pr-2 text-slate-500 font-mono text-xs">{s.order_number || DASH}</td>
                  <td className="py-2 pr-2 text-slate-600">
                    {[s.delivery_city, s.delivery_zone].filter(Boolean).join(' · ') || DASH}
                  </td>
                  <td className="py-2 pl-2 text-right text-slate-600">
                    {s.total_weight != null ? `${s.total_weight} kg` : DASH}
                  </td>
                </tr>
              ))}
              {stops.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-400">Sin paradas</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-400 mt-2 no-print">Tocá una parada para ver los artículos del pedido.</p>
        </div>
      </div>

      {parada && <ParadaModal parada={parada} onClose={() => setParada(null)} />}
    </div>
  );
}
