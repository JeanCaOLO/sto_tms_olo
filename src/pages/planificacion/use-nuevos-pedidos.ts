import { useEffect, useState } from 'react';
import { useOperationalContext } from '../../hooks/useOperationalContext';
import { fetchPedidosParaPlanificar } from './plan-pedidos-api';

// Avisa si entraron pedidos NUEVOS para el día ya planificado (→ hay que
// "Regenerar plan"). Esto es lo que pidió Jean/Palencia: una alerta en vivo.
//
// IMPLEMENTACIÓN POR AHORA = POLLING (cada 15s compara los pedidos del día
// contra los que usó el plan actual). El backend es Lambda y no sostiene
// WebSockets; el día que exista infra de API Gateway WebSocket se reemplaza
// SOLO el cuerpo de este hook por una suscripción — la UI (badge en el botón)
// no cambia. Mantener el WS detrás de este único hook es a propósito.
const INTERVALO_MS = 15000;

// `pedidosEnPlan` = cuántos pedidos consideró el plan actual (paradas +
// sin-asignar). null = aún no hay plan → no hay nada que comparar.
export function useNuevosPedidos(fecha: string, pedidosEnPlan: number | null): number {
  const [nuevos, setNuevos] = useState(0);
  const { selectedCountryId, selectedWarehouseId, selectedCustomerId } = useOperationalContext();

  useEffect(() => {
    if (pedidosEnPlan == null) {
      setNuevos(0);
      return;
    }
    let vivo = true;
    const chequear = async () => {
      try {
        const pedidos = await fetchPedidosParaPlanificar(fecha);
        if (vivo) setNuevos(Math.max(0, pedidos.length - pedidosEnPlan));
      } catch {
        /* red caída: no molestamos con la alerta */
      }
    };
    const id = setInterval(chequear, INTERVALO_MS);
    chequear();
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [fecha, pedidosEnPlan, selectedCountryId, selectedWarehouseId, selectedCustomerId]);

  return nuevos;
}
