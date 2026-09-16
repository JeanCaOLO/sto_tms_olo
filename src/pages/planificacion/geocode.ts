import data from './geocode.json';

// Capa de coordenadas geocodificadas (Nominatim self-hosted) para clientes que no
// las traen en EFLOW. Generada por scripts/geocode-clientes.py. Clave:
// `<pais>:<IDCLIENTE>`. `precision: 'admin'` = centroide de distrito/ciudad
// (aproximada, no puerta) — el pedido se marca geo_approx.
export interface GeoEntry {
  lat: number;
  lng: number;
  precision: string;
  source: string;
}

const geo = data as Record<string, GeoEntry>;

export function geocodeCliente(pais: string, customerId: string | undefined): GeoEntry | undefined {
  return customerId ? geo[`${pais}:${customerId}`] : undefined;
}
