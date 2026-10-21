import type { Articulo } from '../../planificacion/types';
import type { PlanStop } from '../../planificacion/planes-types';
import { fmtKg, totalesDeGuia, type Guia } from '../guia-model';
import ArticulosTabla from './ArticulosTabla';

const DASH = '—';

// Documento imprimible de la guía de despacho (el papel que se lleva el chofer).
// Oculto en pantalla (`hidden`), visible solo al imprimir vía el CSS @media print
// del modal (aislado por #guia-imprimible). Carta/A4, blanco y negro.
interface Props {
  guia: Guia;
  porPedido: Map<string, Articulo[]>;
  impresoEl: string;
}

export default function GuiaImprimible({ guia, porPedido, impresoEl }: Props) {
  const stops = [...guia.trip.stops].sort((a, b) => a.stop_order - b.stop_order);
  const t = totalesDeGuia(guia);

  return (
    <div id="guia-imprimible" className="hidden text-black pb-12">
      <header className="mb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest">Guía de Despacho</p>
            <p className="text-2xl font-bold font-mono">{guia.guide_number}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm mt-3">
          <Dato k="Fecha" v={new Date(`${guia.plan_date}T12:00:00`).toLocaleDateString('es-ES')} />
          <Dato k="Ruta / Zona" v={guia.zona || DASH} />
          <Dato k="Conductor" v={guia.conductor} />
          <Dato k="Vehículo" v={guia.vehiculo} />
        </div>
        <div className="flex gap-6 border border-black rounded mt-3 px-3 py-2 text-sm font-semibold">
          <span>Paradas: {t.paradas}</span>
          <span>Pedidos: {t.pedidos}</span>
          <span>Peso total: {fmtKg(t.peso)}</span>
          {t.volumen != null && <span>Volumen: {t.volumen} m³</span>}
        </div>
      </header>

      {stops.map((s) => (
        <ParadaBloque key={s.id || s.order_id} stop={s} articulos={porPedido.get(s.order_id) ?? []} />
      ))}

      <footer className="fixed bottom-0 left-0 right-0 text-[10px] text-black/70 pt-1">
        Impreso el {impresoEl} — {guia.guide_number}
      </footer>
    </div>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-black/60">{k}</span>
      <span className="font-medium text-right">{v}</span>
    </div>
  );
}

function ParadaBloque({ stop, articulos }: { stop: PlanStop; articulos: Articulo[] }) {
  const ubic = [stop.delivery_city, stop.delivery_zone].filter(Boolean).join(' · ');
  return (
    <section className="break-inside-avoid border-t border-black py-3">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold">#{stop.stop_order}</span>
          <span className="font-semibold">{stop.customer_name || DASH}</span>
          <span className="font-mono text-xs text-black/60">{stop.order_number || ''}</span>
        </div>
        <span className="text-sm">{stop.total_weight != null ? fmtKg(stop.total_weight) : ''}</span>
      </div>
      <p className="text-sm mt-0.5">{stop.delivery_address || DASH}</p>
      {ubic && <p className="text-xs text-black/60">{ubic}</p>}
      <div className="mt-2">
        <ArticulosTabla articulos={articulos} />
      </div>
      <div className="mt-2 text-xs">
        <p>Recibí conforme: _______________________________  Firma: ______________</p>
        <p className="mt-1">Observaciones: ________________________________________________</p>
      </div>
    </section>
  );
}
