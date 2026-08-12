import { useState } from 'react';
import type { AppUser } from '../../lib/mock-auth';
import { fetchPedidosDeRuta } from './pedidos-api';
import { repartirEntreFlota, type FlotaSlot, type ResultadoReparto } from './fleet-split';
import type { Pedido } from './types';

export function useFlotaSplit(appUser: AppUser | null) {
  const [rutaTypeId, setRutaTypeIdState] = useState('');
  const [pool, setPool] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(false);
  const [slots, setSlots] = useState<FlotaSlot[]>([]);
  const [resultado, setResultado] = useState<ResultadoReparto | null>(null);

  const setRutaTypeId = async (value: string) => {
    setRutaTypeIdState(value);
    setResultado(null);
    if (!value || !appUser) {
      setPool([]);
      return;
    }
    try {
      setCargando(true);
      setPool(await fetchPedidosDeRuta(appUser, value));
    } catch (error) {
      console.error('Error cargando pool de pedidos:', error);
    } finally {
      setCargando(false);
    }
  };

  const addSlot = (slot: FlotaSlot) => {
    setSlots((prev) => [...prev, slot]);
    setResultado(null);
  };

  const removeSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
    setResultado(null);
  };

  const calcularReparto = () => setResultado(repartirEntreFlota(pool, slots));

  const reset = () => {
    setRutaTypeIdState('');
    setPool([]);
    setSlots([]);
    setResultado(null);
  };

  return { rutaTypeId, pool, cargando, slots, resultado, setRutaTypeId, addSlot, removeSlot, calcularReparto, reset };
}
