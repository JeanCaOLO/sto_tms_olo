import { useEffect, useState } from 'react';
import { useOperationalContext } from '../../hooks/useOperationalContext';
import { fetchPedidosParaPlanificar } from './plan-pedidos-api';

// Avisa si entraron pedidos NUEVOS para el día ya planificado (→ hay que
// "Regenerar plan"). Esto es lo que pidió Jean/Palencia: una alerta en vivo.
//
// IMPLEMENTACIÓN = WEBSOCKET (push) + POLLING de respaldo. El server WS local
// (`ws-local.mjs`, ws://localhost:4100) empuja un aviso cuando entran pedidos;
// al recibirlo recalculamos el conteo real contra el backend. Si el server WS
// no está corriendo, el polling de respaldo mantiene la alerta (más lento).
// En AWS esto pasa a API Gateway WebSocket cambiando SOLO `WS_URL`; la UI
// (badge en el botón) no cambia. Mantener el WS detrás de este único hook es
// a propósito.
const INTERVALO_MS = 15000;
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4100';

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

    // Push por WebSocket: al recibir el aviso, recalculamos al instante.
    // Si el server WS no está, onerror/onclose no rompen nada (queda el poll).
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(WS_URL);
      ws.onmessage = () => chequear();
    } catch {
      /* URL inválida o WS no disponible: seguimos solo con polling */
    }

    return () => {
      vivo = false;
      clearInterval(id);
      ws?.close();
    };
  }, [fecha, pedidosEnPlan, selectedCountryId, selectedWarehouseId, selectedCustomerId]);

  return nuevos;
}
