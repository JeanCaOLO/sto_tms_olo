import { useState } from 'react';
import Card from '../../../components/base/Card';
import RutaMapaPreview from './RutaMapaPreview';
import PedidosAsignadosModal from './PedidosAsignadosModal';
import type { AsignacionFlota, ResultadoReparto } from '../fleet-split';
import type { Conductor } from '../types';

interface Props {
  resultado: ResultadoReparto;
  conductores: Conductor[];
}

// Barra de utilización peso/volumen — el planificador escanea "qué tan lleno va
// cada vehículo", que es justo el punto de "Calcular Reparto".
function BarraCapacidad({ label, usado, max, unidad }: { label: string; usado: number; max: number; unidad: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((usado / max) * 100)) : 0;
  const tono = pct >= 95 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-teal-600';
  return (
    <div>
      <div className="flex justify-between text-[11px] text-slate-500 mb-1">
        <span>{label}</span>
        <span className="tabular-nums">
          {usado.toFixed(1)}/{max.toFixed(1)} {unidad} · <span className="font-medium text-slate-600">{pct}%</span>
        </span>
      </div>
      <div
        className="h-1.5 rounded-full bg-slate-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Utilización de ${label.toLowerCase()}: ${pct}%`}
      >
        <div className={`h-full rounded-full ${tono}`} style={{ width: `${pct}%` }}></div>
      </div>
    </div>
  );
}

export default function FlotaResultadoPreview({ resultado, conductores }: Props) {
  const [detalle, setDetalle] = useState<AsignacionFlota | null>(null);
  const nombreConductor = (id: string) => conductores.find((c) => c.id === id)?.full_name || 'Sin conductor asignado';

  return (
    <div className="space-y-3">
      {resultado.sinAsignar.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <i className="ri-error-warning-line text-lg text-amber-600 shrink-0 mt-0.5"></i>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-900">
                {resultado.sinAsignar.length === 1
                  ? '1 pedido no cabe en ningún vehículo'
                  : `${resultado.sinAsignar.length} pedidos no caben en ningún vehículo`}
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                Agrega otro vehículo a la flota o divide estos pedidos manualmente.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {resultado.sinAsignar.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex rounded-full bg-white border border-amber-200 px-2 py-0.5 text-[11px] font-mono text-amber-800"
                  >
                    {p.order_number}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {resultado.asignaciones.map((a) => {
        const peso = a.pedidos.reduce((s, p) => s + (p.total_weight || 0), 0);
        const volumen = a.pedidos.reduce((s, p) => s + (p.total_volume || 0), 0);
        const conductor = nombreConductor(a.slot.conductorId);
        return (
          <Card key={a.slot.vehiculo.id} className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-800 truncate">
                  <i className="ri-user-line mr-1.5 text-teal-600"></i>{conductor}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 truncate">
                  <span className="font-medium text-slate-600">{a.slot.vehiculo.plate}</span>
                  <span className="mx-1 text-slate-300">·</span>
                  {a.slot.vehiculo.brand} {a.slot.vehiculo.model}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetalle(a)}
                aria-haspopup="dialog"
                aria-label={`Ver los ${a.pedidos.length} pedidos asignados a ${conductor}`}
                className="shrink-0 inline-flex items-center gap-1 rounded-full border border-teal-600 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100 transition-colors cursor-pointer"
              >
                <i className="ri-file-list-3-line text-sm"></i>
                {a.pedidos.length} {a.pedidos.length === 1 ? 'pedido' : 'pedidos'}
                <i className="ri-arrow-right-s-line text-sm -mr-1 text-teal-500"></i>
              </button>
            </div>

            <div className="space-y-2">
              <BarraCapacidad label="Peso" usado={peso} max={a.slot.vehiculo.capacity_weight} unidad="kg" />
              <BarraCapacidad label="Volumen" usado={volumen} max={a.slot.vehiculo.capacity_volume} unidad="m³" />
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1.5">Secuencia de paradas</p>
              <RutaMapaPreview pedidos={a.pedidos} />
            </div>
          </Card>
        );
      })}

      {resultado.asignaciones.length === 0 && resultado.sinAsignar.length === 0 && (
        <p className="text-sm text-slate-500">No hay pedidos pendientes en el pool para repartir.</p>
      )}

      {detalle && (
        <PedidosAsignadosModal
          titulo={nombreConductor(detalle.slot.conductorId)}
          pedidos={detalle.pedidos}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}
