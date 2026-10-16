import { useCallback, useEffect, useState } from 'react';
import { fetchPedidosParaPlanificar, fechaEntregaObjetivo } from './plan-pedidos-api';
import { planificarDia, type ResultadoPlan } from './plan-automatico';
import type { FlotaSlot } from './fleet-split';
import { construirSlots } from './fleet-slots';
import type { Conductor, Pedido, Vehiculo } from './types';

interface Deps {
  vehiculos: Vehiculo[];
  conductores: Conductor[];
}

// Estado del flujo de planificación automática: los pedidos con entrega para el
// día objetivo (mañana) y el resultado de correr el motor sobre ellos.
export function usePlanAutomatico({ vehiculos, conductores }: Deps) {
  const fecha = fechaEntregaObjetivo();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [resultado, setResultado] = useState<ResultadoPlan | null>(null);
  const [planificando, setPlanificando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setResultado(null);
    try {
      setPedidos(await fetchPedidosParaPlanificar(fecha));
    } finally {
      setCargando(false);
    }
  }, [fecha]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const planificar = () => {
    setPlanificando(true);
    const slots: FlotaSlot[] = construirSlots(vehiculos, conductores);
    setResultado(planificarDia(pedidos, slots));
    setPlanificando(false);
  };

  return { fecha, pedidos, cargando, resultado, planificando, planificar, recargar: cargar };
}
