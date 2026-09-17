import data from './demo-data.json';
import type { Compania } from './eflow-api';
import type { Conductor, Pedido, RutaTipo, Transportista, Vehiculo, Viaje } from './types';

// Capa de datos de prueba PERFECTOS para el "modo demo" (toggle en el header).
// Sirve viajes/pedidos/catálogos ficticios con ubicaciones, pesos/volúmenes y
// capacidades distintas, para la presentación al cliente (la data real de EFLOW
// no trae direcciones ni capacidades). Generado en demo-data.json.

interface DemoCompania {
  rutas: RutaTipo[];
  transportistas: Transportista[];
  conductores: Conductor[];
  vehiculos: Vehiculo[];
  viajes: Viaje[];
}
interface DemoPais {
  companias: Compania[];
  [companiaId: string]: Compania[] | DemoCompania;
}
const demo = data as unknown as Record<string, DemoPais>;

// Rebanadas de las compañías activas (una si hay compañía elegida; todas si no).
function slices(pais: string, company: string): DemoCompania[] {
  const p = demo[pais];
  if (!p) return [];
  const ids = company ? [company] : p.companias.map((c) => c.id);
  return ids.map((id) => p[id] as DemoCompania).filter(Boolean);
}
function merge<T extends { id: string }>(lists: T[][]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of lists) for (const x of list) if (!seen.has(x.id)) { seen.add(x.id); out.push(x); }
  return out;
}

export const demoCompanias = (pais: string): Compania[] => demo[pais]?.companias ?? [];
export const demoViajes = (pais: string, company: string): Viaje[] => slices(pais, company).flatMap((s) => s.viajes);
export function demoCatalogos(pais: string, company: string) {
  const s = slices(pais, company);
  return {
    rutas: merge(s.map((x) => x.rutas)),
    vehiculos: merge(s.map((x) => x.vehiculos)),
    transportistas: merge(s.map((x) => x.transportistas)),
    conductores: merge(s.map((x) => x.conductores)),
  };
}
export const demoPedidosDeViaje = (pais: string, company: string, viajeId: string): Pedido[] =>
  demoViajes(pais, company).find((v) => v.id === viajeId)?.pedidos ?? [];
export const demoPedidosDeRuta = (pais: string, company: string, routeTypeId: string): Pedido[] =>
  demoViajes(pais, company).filter((v) => v.route_type_id === routeTypeId).flatMap((v) => v.pedidos);
