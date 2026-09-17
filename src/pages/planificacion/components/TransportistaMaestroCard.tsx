import Card from '../../../components/base/Card';
import type { Conductor, Transportista, Vehiculo } from '../types';

interface Props {
  transportista: Transportista;
  conductores: Conductor[];
  vehiculos: Vehiculo[];
}

// Ficha de un transportista con sus conductores y su flota. Las capacidades de
// EFLOW vienen casi siempre en 0; el catálogo las estima por marca (ver
// eflow-mappers.capacidadSintetica), por eso se muestran como "~".
export default function TransportistaMaestroCard({ transportista, conductores, vehiculos }: Props) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-800">
          <i className="ri-building-2-line mr-2 text-teal-600"></i>{transportista.name}
        </h3>
        <div className="flex gap-3 text-xs text-slate-500 flex-shrink-0">
          <span><i className="ri-user-line mr-1"></i>{conductores.length}</span>
          <span><i className="ri-truck-line mr-1"></i>{vehiculos.length}</span>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Conductores</p>
        {conductores.length === 0 ? (
          <p className="text-xs text-slate-400">Sin conductores registrados.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {conductores.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 rounded-full px-2 py-0.5" title={`Documento: ${c.document || '—'}`}>
                <i className="ri-user-line text-slate-400"></i>{c.full_name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">Flota</p>
        {vehiculos.length === 0 ? (
          <p className="text-xs text-slate-400">Sin vehículos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 text-left">
                  <th className="font-medium py-1 pr-3">Placa</th>
                  <th className="font-medium py-1 pr-3">Marca / Modelo</th>
                  <th className="font-medium py-1 pr-3 text-right">~ Peso</th>
                  <th className="font-medium py-1 text-right">~ Volumen</th>
                </tr>
              </thead>
              <tbody>
                {vehiculos.map((v) => (
                  <tr key={v.id} className="border-t border-slate-100">
                    <td className="py-1 pr-3 font-mono text-slate-700">{v.plate}</td>
                    <td className="py-1 pr-3 text-slate-600">{[v.brand, v.model].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="py-1 pr-3 text-right text-slate-600">{v.capacity_weight ? `${v.capacity_weight} kg` : '—'}</td>
                    <td className="py-1 text-right text-slate-600">{v.capacity_volume ? `${v.capacity_volume} m³` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
