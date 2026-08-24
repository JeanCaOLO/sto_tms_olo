import { prependMockItem, readMockList, removeMockItem, updateMockItem } from '../../lib/mock-store';
import type { PedidoSeleccionado } from './types';

export interface RutaGenerada {
  id: string;
  routeNumber: string;
  rutaTypeId: string;
  transportistaId: string;
  conductorId: string;
  vehiculoId: string;
  fechaRuta: string;
  totalWeight: number;
  totalVolume: number;
  pedidos: PedidoSeleccionado[];
  createdAt: string;
}

const STORAGE_KEY = 'rutas_generadas';

export function listRutasGeneradas(): RutaGenerada[] {
  return readMockList<RutaGenerada>(STORAGE_KEY);
}

export function eliminarRutaGenerada(id: string): void {
  removeMockItem<RutaGenerada>(STORAGE_KEY, id);
}

export type CambiosRutaGenerada = Pick<RutaGenerada, 'transportistaId' | 'conductorId' | 'vehiculoId' | 'fechaRuta' | 'pedidos'>;

export function actualizarRutaGenerada(id: string, cambios: CambiosRutaGenerada): void {
  const totalWeight = cambios.pedidos.reduce((s, p) => s + (p.total_weight || 0), 0);
  const totalVolume = cambios.pedidos.reduce((s, p) => s + (p.total_volume || 0), 0);
  updateMockItem<RutaGenerada>(STORAGE_KEY, id, { ...cambios, totalWeight, totalVolume });
}

export interface GenerarRutaMockInput {
  rutaTypeId: string;
  transportistaId: string;
  conductorId: string;
  vehiculoId: string;
  fechaRuta: string;
  pedidosSeleccionados: PedidoSeleccionado[];
}

export function generarRutaMock(input: GenerarRutaMockInput): { routeNumber: string } {
  const totalWeight = input.pedidosSeleccionados.reduce((s, p) => s + (p.total_weight || 0), 0);
  const totalVolume = input.pedidosSeleccionados.reduce((s, p) => s + (p.total_volume || 0), 0);
  const routeNumber = `RT-MOCK-${Date.now()}`;

  const ruta: RutaGenerada = {
    id: crypto.randomUUID(),
    routeNumber,
    rutaTypeId: input.rutaTypeId,
    transportistaId: input.transportistaId,
    conductorId: input.conductorId,
    vehiculoId: input.vehiculoId,
    fechaRuta: input.fechaRuta,
    totalWeight,
    totalVolume,
    pedidos: input.pedidosSeleccionados,
    createdAt: new Date().toISOString(),
  };

  prependMockItem(STORAGE_KEY, ruta);
  return { routeNumber };
}
