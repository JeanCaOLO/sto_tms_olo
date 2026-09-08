import { useEffect, useState } from 'react';
import { actualizarRutaGenerada, cambiarEstadoRutaGenerada, eliminarRutaGenerada, listRutasGeneradas, type CambiosRutaGenerada, type RutaGenerada } from './generar-ruta-mock';
import type { EstadoSecuencia } from './route-status';

export function useRutasGeneradas() {
  const [rutas, setRutas] = useState<RutaGenerada[]>([]);

  const refresh = () => setRutas(listRutasGeneradas());

  useEffect(refresh, []);

  const eliminar = (id: string) => {
    eliminarRutaGenerada(id);
    refresh();
  };

  const actualizar = (id: string, cambios: CambiosRutaGenerada) => {
    actualizarRutaGenerada(id, cambios);
    refresh();
  };

  const cambiarEstado = (id: string, estado: EstadoSecuencia) => {
    cambiarEstadoRutaGenerada(id, estado);
    refresh();
  };

  // Acciones en lote: aplican sobre varias secuencias y refrescan una sola vez.
  const eliminarVarias = (ids: string[]) => {
    ids.forEach(eliminarRutaGenerada);
    refresh();
  };

  const cambiarEstadoVarias = (ids: string[], estado: EstadoSecuencia) => {
    ids.forEach((id) => cambiarEstadoRutaGenerada(id, estado));
    refresh();
  };

  return { rutas, refresh, eliminar, actualizar, cambiarEstado, eliminarVarias, cambiarEstadoVarias };
}
