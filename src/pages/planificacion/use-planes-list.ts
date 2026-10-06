import { useCallback, useEffect, useState } from 'react';
import { listarPlanes } from './planes-api';
import type { RoutePlan } from './planes-types';

// Trae TODOS los planes de la compañía activa (el filtro por estado se aplica en
// la pestaña, sobre el estado de los VIAJES, no del plan). Recarga tras cada
// cambio de estado de un viaje.
export function usePlanesList() {
  const [planes, setPlanes] = useState<RoutePlan[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setPlanes(await listarPlanes());
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { planes, cargando, recargar: cargar };
}
