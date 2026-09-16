import { useMemo, useState } from 'react';
import type { AppUser } from '../../lib/mock-auth';
import { cargarPoolRuta, filtrarViajesDeRuta } from './asignar-viajes-helpers';
import {
  crearViajeMock, eliminarViajeMock, listViajesMock, setPedidosViajeMock, type ViajeMock,
} from './viaje-asignacion-mock';
import type { Pais } from './eflow-api';
import type { Pedido } from './types';

// Estado del módulo "Asignar Viajes": pool de pedidos de una ruta + viajes mock
// de esa ruta, con asignación pedido↔viaje (un pedido puede ir en varios viajes).
export function useAsignarViajes(appUser: AppUser | null, pais: Pais) {
  const [rutaTypeId, setRutaTypeId] = useState('');
  const [rutaNombre, setRutaNombre] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [pool, setPool] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(false);
  const [viajes, setViajes] = useState<ViajeMock[]>(listViajesMock);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  const refresh = () => setViajes(listViajesMock());
  const viajesDeRuta = useMemo(() => filtrarViajesDeRuta(viajes, pais, rutaTypeId), [viajes, pais, rutaTypeId]);

  const elegirRuta = async (id: string, nombre: string) => {
    setRutaTypeId(id);
    setRutaNombre(nombre);
    setSeleccion(new Set());
    setCargando(true);
    setPool(await cargarPoolRuta(appUser, id));
    setCargando(false);
  };

  const toggleSeleccion = (pedidoId: string) =>
    setSeleccion((prev) => {
      const next = new Set(prev);
      next.has(pedidoId) ? next.delete(pedidoId) : next.add(pedidoId);
      return next;
    });

  const crearViaje = () => {
    if (!rutaTypeId) return;
    crearViajeMock({ pais, rutaTypeId, rutaNombre, fecha, numero: `Viaje ${viajesDeRuta.length + 1}` });
    refresh();
  };

  // Asigna la selección a un viaje (dedup dentro del viaje; el pedido puede
  // seguir en otros viajes). Limpia la selección.
  const asignarSeleccionAViaje = (viajeId: string) => {
    const viaje = viajesDeRuta.find((v) => v.id === viajeId);
    if (!viaje || seleccion.size === 0) return;
    setPedidosViajeMock(viajeId, [...new Set([...viaje.pedidoIds, ...seleccion])]);
    setSeleccion(new Set());
    refresh();
  };

  const quitarPedidoDeViaje = (viajeId: string, pedidoId: string) => {
    const viaje = viajesDeRuta.find((v) => v.id === viajeId);
    if (viaje) setPedidosViajeMock(viajeId, viaje.pedidoIds.filter((id) => id !== pedidoId));
    refresh();
  };

  const eliminarViaje = (id: string) => { eliminarViajeMock(id); refresh(); };

  return {
    rutaTypeId, rutaNombre, fecha, pool, cargando, viajesDeRuta, seleccion,
    setFecha, elegirRuta, toggleSeleccion, crearViaje, eliminarViaje,
    asignarSeleccionAViaje, quitarPedidoDeViaje,
  };
}
