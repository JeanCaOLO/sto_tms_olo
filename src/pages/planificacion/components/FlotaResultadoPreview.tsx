import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import type { ResultadoReparto } from '../fleet-split';

interface Props {
  resultado: ResultadoReparto;
}

export default function FlotaResultadoPreview({ resultado }: Props) {
  return (
    <div className="space-y-3">
      {resultado.asignaciones.map((a) => {
        const peso = a.pedidos.reduce((s, p) => s + (p.total_weight || 0), 0);
        const volumen = a.pedidos.reduce((s, p) => s + (p.total_volume || 0), 0);
        return (
          <Card key={a.slot.vehiculo.id} padding={false} className="p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800 text-sm">
                <i className="ri-truck-line mr-1.5 text-teal-600"></i>
                {a.slot.vehiculo.plate} — {a.slot.vehiculo.brand} {a.slot.vehiculo.model}
              </span>
              <Badge variant="info">{a.pedidos.length} paradas</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-1">{peso.toFixed(1)} kg · {volumen.toFixed(1)} m³</p>
          </Card>
        );
      })}

      {resultado.sinAsignar.length > 0 && (
        <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg">
          <i className="ri-alert-line text-amber-600 mt-0.5"></i>
          <span>{resultado.sinAsignar.length} pedido(s) no caben en ningún vehículo de la flota seleccionada — agrega otro vehículo o revisa la capacidad.</span>
        </div>
      )}

      {resultado.asignaciones.length === 0 && resultado.sinAsignar.length === 0 && (
        <p className="text-sm text-slate-500">No hay pedidos pendientes en el pool para repartir.</p>
      )}
    </div>
  );
}
