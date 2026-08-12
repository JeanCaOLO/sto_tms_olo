import { useEffect, useState } from 'react';
import { eliminarRutaGenerada, listRutasGeneradas, type RutaGenerada } from './generar-ruta-mock';

export function useRutasGeneradas() {
  const [rutas, setRutas] = useState<RutaGenerada[]>([]);

  const refresh = () => setRutas(listRutasGeneradas());

  useEffect(refresh, []);

  const eliminar = (id: string) => {
    eliminarRutaGenerada(id);
    refresh();
  };

  return { rutas, refresh, eliminar };
}
