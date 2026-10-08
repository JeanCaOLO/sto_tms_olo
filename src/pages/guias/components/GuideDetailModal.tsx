import { useState } from 'react';
import Badge from '../../../components/base/Badge';
import Button from '../../../components/base/Button';
import ArticulosTabla from './ArticulosTabla';
import GuiaImprimible from './GuiaImprimible';
import { useArticulosGuia } from '../use-articulos-guia';
import { totalesDeGuia, type Guia } from '../guia-model';
import type { PlanStop } from '../../planificacion/planes-types';
import type { Articulo } from '../../planificacion/types';

interface Props {
  guia: Guia;
  onClose: () => void;
}

const DASH = '—';
const PRINT_CSS = `@media print {
  body { visibility: hidden; }
  #guia-imprimible { visibility: visible; display: block !important; position: absolute; inset: 0; width: 100%; }
  #guia-imprimible * { visibility: visible; }
}
@page { margin: 14mm; }`;

// Detalle de una guía (un viaje) + documento imprimible. Al abrir precarga los
// artículos de todas las paradas (para que el impreso los incluya); mientras
// carga, Imprimir queda deshabilitado. En pantalla las paradas son un acordeón
// (artículos inline); en impreso va GuiaImprimible (todas expandidas).
export default function GuideDetailModal({ guia, onClose }: Props) {
  const stops = [...guia.trip.stops].sort((a, b) => a.stop_order - b.stop_order);
  const { porPedido, cargando } = useArticulosGuia(stops.map((s) => s.order_id));
  const [abierta, setAbierta] = useState<string | null>(null);
  const t = totalesDeGuia(guia);
  const impresoEl = new Date().toLocaleString('es-ES');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <style>{PRINT_CSS}</style>

      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto print:hidden">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800 font-mono">{guia.guide_number}</h2>
            {guia.plan_status === 'completed' ? <Badge variant="success">Completada</Badge> : <Badge variant="info">Confirmada</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => window.print()} disabled={cargando}>
              <i className={`mr-1 ${cargando ? 'ri-loader-4-line animate-spin' : 'ri-printer-line'}`}></i>
              {cargando ? 'Cargando…' : 'Imprimir'}
            </Button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer" aria-label="Cerrar">
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {([['Fecha', new Date(`${guia.plan_date}T12:00:00`).toLocaleDateString('es-ES')], ['Ruta / Zona', guia.zona || DASH], ['Conductor', guia.conductor], ['Vehículo', guia.vehiculo]] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-slate-100 py-1">
                <span className="text-slate-500">{k}</span><span className="text-slate-900 font-medium text-right">{v}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 bg-slate-50 rounded-lg px-4 py-2 text-sm font-semibold text-slate-700">
            <span>Paradas: {t.paradas}</span><span>Pedidos: {t.pedidos}</span><span>Peso: {t.peso} kg</span>
            {t.volumen != null && <span>Volumen: {t.volumen} m³</span>}
          </div>

          <div aria-busy={cargando}>
            <p className="text-[11px] uppercase tracking-wide text-slate-400 font-medium mb-2">Paradas de la ruta</p>
            {stops.length === 0 && <p className="text-sm text-slate-400">Sin paradas</p>}
            {stops.map((s) => (
              <ParadaFila key={s.id || s.order_id} stop={s} articulos={porPedido.get(s.order_id) ?? []} cargando={cargando}
                abierta={abierta === (s.id || s.order_id)} onToggle={() => setAbierta(abierta === (s.id || s.order_id) ? null : (s.id || s.order_id))} />
            ))}
          </div>
        </div>
      </div>

      <GuiaImprimible guia={guia} porPedido={porPedido} impresoEl={impresoEl} />
    </div>
  );
}

function ParadaFila({ stop, articulos, cargando, abierta, onToggle }: {
  stop: PlanStop; articulos: Articulo[]; cargando: boolean; abierta: boolean; onToggle: () => void;
}) {
  const ubic = [stop.delivery_city, stop.delivery_zone].filter(Boolean).join(' · ') || DASH;
  return (
    <div className="border-b border-slate-100">
      <button onClick={onToggle} aria-expanded={abierta} className="w-full flex items-center gap-2 py-2 text-left cursor-pointer hover:bg-slate-50 rounded">
        <span className="w-5 h-5 flex items-center justify-center text-white rounded-full text-[11px] font-semibold bg-teal-600 shrink-0">{stop.stop_order}</span>
        <span className="text-slate-800 font-medium truncate max-w-[10rem]">{stop.customer_name || DASH}</span>
        <span className="text-slate-400 font-mono text-xs hidden sm:inline">{stop.order_number || ''}</span>
        <span className="text-slate-500 text-xs ml-auto truncate max-w-[9rem]">{ubic}</span>
        <span className="text-slate-600 text-sm">{stop.total_weight != null ? `${stop.total_weight} kg` : ''}</span>
        <i className={`ri-arrow-down-s-line text-slate-400 transition-transform ${abierta ? 'rotate-180' : ''}`}></i>
      </button>
      {abierta && (
        <div className="pb-3 pl-7 pr-2">
          <p className="text-sm text-slate-700">{stop.delivery_address || DASH}</p>
          {stop.delivery_latitude != null && stop.delivery_longitude != null && (
            <p className="text-xs text-slate-400 mb-2">{stop.delivery_latitude}, {stop.delivery_longitude}</p>
          )}
          {cargando ? (
            <p className="text-sm text-slate-400 flex items-center gap-2"><i className="ri-loader-4-line animate-spin"></i>Cargando artículos…</p>
          ) : (
            <ArticulosTabla articulos={articulos} />
          )}
        </div>
      )}
    </div>
  );
}
