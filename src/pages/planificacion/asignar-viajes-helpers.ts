import type { AppUser } from '../../lib/mock-auth';
import { fetchPedidosDeRuta } from './pedidos-api';
import type { ViajeMock } from './viaje-asignacion-mock';
import type { Pais } from './eflow-api';
import type { Pedido } from './types';

// Selectores puros del módulo "Asignar Viajes" (fuera del hook para respetar el
// tope de líneas y quedar testeables).

// Viajes de la ruta/país activos, en orden de creación (Viaje 1, 2, ...).
export function filtrarViajesDeRuta(viajes: ViajeMock[], pais: Pais, rutaTypeId: string): ViajeMock[] {
  return viajes
    .filter((v) => v.pais === pais && v.rutaTypeId === rutaTypeId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// Resuelve los ids de pedido de un viaje a los objetos Pedido del pool.
export function resolverPedidos(pool: Pedido[], ids: string[]): Pedido[] {
  return ids.map((id) => pool.find((p) => p.id === id)).filter((p): p is Pedido => Boolean(p));
}

export function totalesPedidos(pedidos: Pedido[]): { peso: number; volumen: number } {
  return {
    peso: pedidos.reduce((s, p) => s + (p.total_weight || 0), 0),
    volumen: pedidos.reduce((s, p) => s + (p.total_volume || 0), 0),
  };
}

export async function cargarPoolRuta(appUser: AppUser | null, rutaTypeId: string): Promise<Pedido[]> {
  if (!rutaTypeId || !appUser) return [];
  try {
    return await fetchPedidosDeRuta(appUser, rutaTypeId);
  } catch (error) {
    console.error('Error cargando pedidos de la ruta:', error);
    return [];
  }
}
