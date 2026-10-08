// Estado en memoria de las pruebas del tarifador: la semilla (`__tests__/fixtures/seed.json`) clonada,
// sin localStorage. Incluye fixtures de las entidades EXTERNAS (viajes, transportistas, conductores,
// vehículos, zonas, países) con la forma que devuelve el backend; son de solo lectura.

import seedJson from '../../fixtures/seed.json';

type Rows = Record<string, any>[];

export interface TarifasDatabase {
  // ── Externas (fixtures de solo lectura) ──
  countries: Rows;
  zones: Rows;
  carriers: Rows;
  drivers: Rows;
  vehicles: Rows;
  /** Viajes de guía de despacho, con la forma de la vista `tarifas_v_viajes`. */
  trips: Rows;
  dispatchGuides: Rows;
  tripReturns: Rows;
  // ── Propias ──
  countrySettings: Rows;
  zoneGroups: Rows;
  pricingRules: Rows;
  pricingTemplates: Rows;
  /** Perfiles de cálculo, uno por transportista. Ver `data/schema.ts`. */
  settlementParties: Rows;
  /** Variables personalizadas declaradas por cada perfil. */
  partyVariables: Rows;
  /** Liquidaciones emitidas, con su desglose completo. */
  settlements: Rows;
  costStructures: Rows;
  costStructureRows: Rows;
  rateTables: Rows;
  rateTableRows: Rows;
  tripOrders: Rows;
  tripOrderMarks: Rows;
  marginPolicies: Rows;
  auditLog: Rows;
}

// Exportada para que un test pueda verificar que ninguna entidad del esquema quedó fuera: una
// colección faltante acá no rompe nada, simplemente devuelve vacío para siempre.
export const COLLECTIONS: (keyof TarifasDatabase)[] = [
  'countries', 'zones', 'carriers', 'drivers', 'vehicles', 'trips', 'dispatchGuides', 'tripReturns', 'tripOrders', 'tripOrderMarks',
  'countrySettings', 'zoneGroups', 'pricingRules', 'pricingTemplates', 'settlementParties',
  'partyVariables', 'settlements', 'costStructures', 'costStructureRows', 'rateTables',
  'rateTableRows', 'marginPolicies', 'auditLog',
];

function cloneSeed(): TarifasDatabase {
  // structuredClone evita que dos lecturas compartan referencias y que una mute la semilla original.
  return structuredClone(seedJson) as unknown as TarifasDatabase;
}

// El estado vive aquí; `MemoryDataSource` lo lee y lo muta. Un `beforeEach` global lo reinicia.
let current: TarifasDatabase = cloneSeed();

export function loadDatabase(): TarifasDatabase {
  return current;
}

export function persist(db: TarifasDatabase): void {
  current = db;
}

export function resetToSeed(): TarifasDatabase {
  current = cloneSeed();
  return current;
}

export function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
