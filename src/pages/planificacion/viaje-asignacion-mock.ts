import { readMockList, prependMockItem, removeMockItem, updateMockItem } from '../../lib/mock-store';
import type { Pais } from './eflow-api';

// Viaje creado en el módulo de asignación. Hoy la fuente real (WMH / torre de
// control) crea los viajes; se va a reemplazar, así que aquí los creamos mock y
// les asignamos pedidos. Un mismo pedido puede ir en 2 viajes (Ana 2026-09-15),
// por eso la relación es por lista de ids y no exclusiva. Una ruta puede tener
// varios viajes.
export interface ViajeMock {
  id: string;
  numero: string; // "Viaje 1"
  pais: Pais;
  rutaTypeId: string;
  rutaNombre: string;
  fecha: string;
  pedidoIds: string[]; // ids de Pedido asignados a este viaje
  createdAt: string;
}

const STORAGE_KEY = 'viajes_asignacion';

export function listViajesMock(): ViajeMock[] {
  return readMockList<ViajeMock>(STORAGE_KEY);
}

export function crearViajeMock(input: {
  pais: Pais;
  rutaTypeId: string;
  rutaNombre: string;
  fecha: string;
  numero: string;
}): ViajeMock {
  const viaje: ViajeMock = {
    id: crypto.randomUUID(),
    numero: input.numero,
    pais: input.pais,
    rutaTypeId: input.rutaTypeId,
    rutaNombre: input.rutaNombre,
    fecha: input.fecha,
    pedidoIds: [],
    createdAt: new Date().toISOString(),
  };
  prependMockItem(STORAGE_KEY, viaje);
  return viaje;
}

export function eliminarViajeMock(id: string): void {
  removeMockItem<ViajeMock>(STORAGE_KEY, id);
}

export function setPedidosViajeMock(id: string, pedidoIds: string[]): void {
  updateMockItem<ViajeMock>(STORAGE_KEY, id, { pedidoIds });
}
