// Cascada geográfica: ZoneGroup → Zone → Location, y mapeo TMS → tarifador.

// Cascada geográfica ZoneGroup → Zone → Location: evita declarar una tarifa por cada
// combinación de localidades (matriz N×N literal). Reglas y lookups se declaran a nivel de Zone
// (o ZoneGroup), y cada Location resuelve a su Zone en el contexto derivado del viaje.
export interface ZoneGroup {
  id: string;
  countryId: string;
  code: string;
  name: string;
  /** Códigos de las zonas del catálogo que agrupa. */
  zoneCodes?: string[];
}

/** Zona del catálogo del TMS (`zones`). El grupo lo resuelve el liquidador desde `ZoneGroup.zoneCodes`. */
export interface Zone {
  id: string;
  countryId: string;
  zoneGroupId: string | null;
  code: string;
  name: string;
}

export interface Location {
  id: string;
  countryId: string;
  zoneId: string;
  code: string;
  name: string;
}

/**
 * Qué zona tarifaria le corresponde a un punto del TMS.
 *
 * Existe porque el TMS y el tarifador tienen geografías distintas: el TMS conoce tiendas y tipos de
 * ruta; el tarifador conoce ZONAS. Sin este puente, una liquidación real no puede resolver su zona
 * y las reglas condicionadas por zona nunca aplican — que es exactamente lo que pasaba: el origen y
 * el destino caían siempre en la zona comodín.
 *
 * El mapeo es del TARIFADOR: no agrega columnas a las tablas del TMS, solo las referencia por id.
 */
export interface ZoneMapping {
  id: string;
  countryId: string;
  /** Qué entidad del TMS se está ubicando. */
  sourceType: 'STORE' | 'ROUTE_TYPE';
  /** Id de esa entidad en el TMS. */
  sourceId: string;
  zoneId: string;
}
