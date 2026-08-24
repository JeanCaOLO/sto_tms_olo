import { useEffect, useState } from 'react';
import { actualizarRutaGenerada, eliminarRutaGenerada, listRutasGeneradas, type CambiosRutaGenerada, type RutaGenerada } from './generar-ruta-mock';

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

  return { rutas, refresh, eliminar, actualizar };
}
