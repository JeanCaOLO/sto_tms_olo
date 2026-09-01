import { useState } from 'react';
import Card from '../../../components/base/Card';
import RutaGeneradaCard from './RutaGeneradaCard';
import {
  FILTROS_ESTADO_SECUENCIA,
  filtrarPorEstadoSecuencia,
  type EstadoSecuencia,
  type FiltroEstadoSecuencia,
} from '../route-status';
import type { RutaGenerada } from '../generar-ruta-mock';
import type { Conductor, RutaTipo, Transportista, Vehiculo } from '../types';

interface Props {
  rutas: RutaGenerada[];
  rutasTipo: RutaTipo[];
  transportistas: Transportista[];
  conductores: Conductor[];
  vehiculos: Vehiculo[];
  onEliminar: (id: string) => void;
  onEditar: (ruta: RutaGenerada) => void;
  onCambiarEstado: (id: string, estado: EstadoSecuencia) => void;
}

export default function RutasGeneradas({ rutas, rutasTipo, transportistas, conductores, vehiculos, onEliminar, onEditar, onCambiarEstado }: Props) {
  // Default 'todas': la vista existe para ver lo generado; ocultar canceladas/completadas
  // al entrar sería una omisión silenciosa. "Activas" es un filtro rápido, no un default seguro.
  const [filtro, setFiltro] = useState<FiltroEstadoSecuencia>('todas');

  if (rutas.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <div className="w-16 h-16 flex items-center justify-center rounded-full bg-slate-50">
            <i className="ri-route-line text-4xl"></i>
          </div>
          <p className="mt-4 font-medium text-slate-500">Todavía no has generado ninguna ruta</p>
          <p className="text-sm mt-1 text-center">Las rutas que generes en la pestaña "Nueva Ruta" van a aparecer aquí</p>
        </div>
      </Card>
    );
  }

  const visibles = filtrarPorEstadoSecuencia(rutas, filtro);
  const activo = FILTROS_ESTADO_SECUENCIA.find((f) => f.valor === filtro)!;

  return (
    <div className="space-y-4">
      {/* Segmented control: conjunto fijo de 4, selección única sobre la misma lista.
          Rima con los botones de estado por-tarjeta para que el módulo lea como un sistema. */}
      <div
        role="group"
        aria-label="Filtrar rutas por estado de la secuencia"
        className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1"
      >
        {FILTROS_ESTADO_SECUENCIA.map((opcion) => {
          const seleccionado = opcion.valor === filtro;
          const count = filtrarPorEstadoSecuencia(rutas, opcion.valor).length;
          return (
            <button
              key={opcion.valor}
              type="button"
              aria-pressed={seleccionado}
              onClick={() => setFiltro(opcion.valor)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                seleccionado ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opcion.label}
              <span className={`ml-1.5 tabular-nums ${seleccionado ? 'text-white/70' : 'text-slate-400'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <i className="ri-inbox-line text-2xl text-slate-300"></i>
          <p className="text-sm text-slate-500">
            No hay rutas <span className="font-medium text-slate-700">{activo.label.toLowerCase()}</span>.
          </p>
          <button
            type="button"
            onClick={() => setFiltro('todas')}
            className="text-xs font-medium text-teal-600 hover:text-teal-700 cursor-pointer"
          >
            Ver todas las rutas
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibles.map((ruta) => (
            <RutaGeneradaCard
              key={ruta.id}
              ruta={ruta}
              rutasTipo={rutasTipo}
              transportistas={transportistas}
              conductores={conductores}
              vehiculos={vehiculos}
              onEliminar={onEliminar}
              onEditar={onEditar}
              onCambiarEstado={onCambiarEstado}
            />
          ))}
        </div>
      )}
    </div>
  );
}
