import type { ViajePropuesto } from '../plan-automatico';

interface Props {
  viaje: ViajePropuesto;
  indice: number;
  /** Nombre legible de la zona (viaje.destino es el código). */
  destinoNombre?: string;
}

// Tarjeta de solo lectura de un viaje propuesto por el motor: destino, vehículo
// asignado y la secuencia de paradas ya ordenada. La capacidad (peso/volumen)
// está desactivada hoy — los pedidos reales no la traen (ver plan-automatico.ts
// USAR_CAPACIDAD); se muestra la cantidad de paradas en su lugar.
export default function ViajePropuestoCard({ viaje, indice, destinoNombre }: Props) {
  const { destino, slot, pedidos } = viaje;
  const v = slot.vehiculo;
  const tituloZona = destinoNombre || destino;
  const mostrarCodigo = destinoNombre && destinoNombre !== destino;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide">Viaje {indice + 1}</p>
          <h3 className="text-sm font-bold text-slate-800">{tituloZona}</h3>
          {mostrarCodigo && <p className="text-[10px] text-slate-400 font-mono">Ruta {destino}</p>}
          <p className="text-xs text-slate-500 mt-0.5">
            {v.plate} · {v.brand} {v.model}
            {v.is_flota_propia && <span className="ml-1 text-teal-600 font-medium">(flota propia)</span>}
          </p>
        </div>
        <span className="text-xs bg-teal-50 text-teal-700 font-medium px-2 py-1 rounded-full shrink-0">
          {pedidos.length} {pedidos.length === 1 ? 'parada' : 'paradas'}
        </span>
      </div>

      <ol className="space-y-1">
        {pedidos.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-xs text-slate-600">
            <span className="w-5 h-5 flex items-center justify-center bg-teal-50 text-teal-700 rounded-full font-semibold shrink-0">
              {p.stop_number}
            </span>
            <span className="truncate">
              {p.customer_name || p.order_number}
              {p.delivery_city && ` — ${p.delivery_city}`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
