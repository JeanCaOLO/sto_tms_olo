import { useCallback, useState } from 'react';
import {
  confirmarPlan,
  editarPlan,
  generarPlan,
  type MockContext,
} from './planes-api';
import { moverPedido } from './plan-edit';
import type { RoutePlan } from './planes-types';

interface Deps {
  fecha: string;
  ctx: MockContext;
}

// Estado del draft activo: generar (POST /planes), editar moviendo pedidos
// entre viajes (PUT), y confirmar (draft→confirmed). Solo se edita en draft.
export function usePlanes({ fecha, ctx }: Deps) {
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const generar = useCallback(async () => {
    setGenerando(true);
    try {
      setPlan(await generarPlan(fecha, ctx));
    } finally {
      setGenerando(false);
    }
  }, [fecha, ctx]);

  // Mueve un pedido de un viaje a otro y persiste vía PUT. Optimista: si el
  // backend/mock devuelve el plan recalculado, se toma ese.
  const mover = useCallback(
    async (orderId: string, fromTripId: string, toTripId: string) => {
      if (!plan || plan.status !== 'draft' || fromTripId === toTripId) return;
      const payload = moverPedido(plan, orderId, fromTripId, toTripId);
      setGuardando(true);
      try {
        const actualizado = await editarPlan(plan.id, payload);
        if (actualizado) setPlan(actualizado);
      } finally {
        setGuardando(false);
      }
    },
    [plan],
  );

  const confirmar = useCallback(async () => {
    if (!plan || plan.status !== 'draft') return;
    setGuardando(true);
    try {
      const actualizado = await confirmarPlan(plan.id);
      if (actualizado) setPlan(actualizado);
    } finally {
      setGuardando(false);
    }
  }, [plan]);

  const limpiar = useCallback(() => setPlan(null), []);

  return { plan, generando, guardando, generar, mover, confirmar, limpiar };
}
