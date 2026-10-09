import { useCallback, useEffect, useState } from 'react';
import { useOperationalContext } from '../../hooks/useOperationalContext';
import { listarPlanes } from './planes-api';
import type { RoutePlan } from './planes-types';

// Trae TODOS los planes de la compañía activa (el filtro por estado se aplica en
// la pestaña, sobre el estado de los VIAJES, no del plan). Recarga tras cada
// cambio de estado de un viaje y cada vez que cambia el contexto operativo
// (país/almacén/cliente del headbar) — listarPlanes() manda esos como headers,
// así que al cambiar hay que re-consultar (antes solo lo tomaba al recargar la página).
export function usePlanesList() {
  const [planes, setPlanes] = useState<RoutePlan[]>([]);
  const [cargando, setCargando] = useState(true);
  const { selectedCountryId, selectedWarehouseId, selectedCustomerId } = useOperationalContext();

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
  }, [cargar, selectedCountryId, selectedWarehouseId, selectedCustomerId]);

  return { planes, cargando, recargar: cargar };
}
