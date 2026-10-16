import { useCallback, useEffect, useState } from 'react';
import { cargarPlanesEflowSim, limpiarCacheEflowSim } from './eflow-sim-store';
import type { RoutePlan } from './planes-types';

// Planes del calendario desde el API simulado de eFlow (cacheados en localStorage).
// `regenerar` limpia el cache y vuelve a cargar — es el refrescamiento manual que
// pidió la reunión 2026-10-14 (pedidos de último minuto).
export function useEflowSimPlanes() {
  const [planes, setPlanes] = useState<RoutePlan[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    cargarPlanesEflowSim().then(setPlanes).finally(() => setCargando(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const regenerar = useCallback(() => {
    setCargando(true);
    limpiarCacheEflowSim();
    cargar();
  }, [cargar]);

  return { planes, cargando, regenerar };
}
