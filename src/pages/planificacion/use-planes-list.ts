import { useCallback, useEffect, useState } from 'react';
import { cancelarPlan, completarPlan, listarPlanes } from './planes-api';
import type { PlanStatus, RoutePlan } from './planes-types';

// Lista de planes filtrada por estado para la pestaña "Planificaciones", con
// las acciones de transición (completar/cancelar). Recarga tras cada acción.
export function usePlanesList(status: PlanStatus | 'all') {
  const [planes, setPlanes] = useState<RoutePlan[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setPlanes(await listarPlanes(status === 'all' ? undefined : status));
    } finally {
      setCargando(false);
    }
  }, [status]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const completar = useCallback(async (id: string) => {
    await completarPlan(id);
    await cargar();
  }, [cargar]);

  const cancelar = useCallback(async (id: string) => {
    await cancelarPlan(id);
    await cargar();
  }, [cargar]);

  return { planes, cargando, completar, cancelar, recargar: cargar };
}
