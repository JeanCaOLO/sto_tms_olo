import { useState } from 'react';
import type { AppUser } from '../../lib/mock-auth';
import { fetchPedidosDeViaje } from './eflow-api';
import { repartirEntreFlota, type FlotaSlot, type ResultadoReparto } from './fleet-split';
import { sugerirVehiculos } from './fleet-suggest';
import type { Pedido, Vehiculo } from './types';

// Reparto de flota sobre un VIAJE real: se elige ruta -> viaje de esa ruta ->
// se cargan los pedidos reales del viaje (fetchPedidosDeViaje) y se reparten
// entre vehículos. `_appUser` se mantiene por compatibilidad de firma.
export function useFlotaSplit(_appUser: AppUser | null) {
  const [rutaTypeId, setRutaTypeIdState] = useState('');
  const [viajeId, setViajeIdState] = useState('');
  const [pool, setPool] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(false);
  const [slots, setSlots] = useState<FlotaSlot[]>([]);
  const [resultado, setResultado] = useState<ResultadoReparto | null>(null);

  const limpiar = () => { setPool([]); setSlots([]); setResultado(null); };

  const setRutaTypeId = (value: string) => { setRutaTypeIdState(value); setViajeIdState(''); limpiar(); };

  // Carga los pedidos REALES del viaje (journey_orders → EXPEDICIONESCABECERA).
  const setViaje = async (value: string) => {
    setViajeIdState(value);
    setSlots([]);
    setResultado(null);
    if (!value) return setPool([]);
    setCargando(true);
    try {
      setPool(await fetchPedidosDeViaje(value, rutaTypeId));
    } catch (error) {
      console.error('Error cargando pedidos del viaje:', error);
      setPool([]);
    } finally {
      setCargando(false);
    }
  };

  // No se puede agregar el mismo vehículo dos veces.
  const addSlot = (slot: FlotaSlot) => {
    setSlots((prev) => (prev.some((s) => s.vehiculo.id === slot.vehiculo.id) ? prev : [...prev, slot]));
    setResultado(null);
  };
  const removeSlot = (index: number) => { setSlots((prev) => prev.filter((_, i) => i !== index)); setResultado(null); };

  // Auto-elige vehículos por capacidad y calcula el reparto de una, para mostrar
  // ya los pedidos del viaje repartidos en cada vehículo (Ana 2026-09-15).
  const sugerirFlota = (vehiculos: Vehiculo[]) => {
    const nuevos = sugerirVehiculos(pool, vehiculos).vehiculos.map((vehiculo) => ({ vehiculo, conductorId: '' }));
    setSlots(nuevos);
    setResultado(repartirEntreFlota(pool, nuevos));
  };

  const calcularReparto = () => setResultado(repartirEntreFlota(pool, slots));
  const reset = () => { setRutaTypeIdState(''); setViajeIdState(''); limpiar(); };

  return {
    rutaTypeId, viajeId, pool, cargando, slots, resultado,
    setRutaTypeId, setViaje, addSlot, removeSlot, sugerirFlota, calcularReparto, reset,
  };
}
