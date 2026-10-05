// Almacén local del módulo de tarifas: semilla embebida (`seed.json`) + localStorage, detrás de
// una única interfaz de lectura/escritura.
//
// Es el respaldo del driver `JsonDataSource` (tests y modo sin conexión). En producción el módulo
// lee y escribe Aurora por `HttpDataSource`; esto queda sin uso, sin tocar ni la UI ni el kernel.
//
// Además de las colecciones PROPIAS del tarifador, guarda fixtures de las entidades EXTERNAS
// (viajes, transportistas, conductores, vehículos, zonas, países), con la misma forma que las
// devuelve el backend. Son de solo lectura: el driver rechaza escribirlas.
//
// v2 (2026-10-02): modelo "el liquidador consume el catálogo y los viajes del TMS"
// (docs/tarifador/ROADMAP.md §8). Lo guardado con la v1 —rutas, conductores y compañías propias—
// no tiene traducción a viajes reales y NO se migra: el navegador arranca de la semilla nueva.

import seedJson from './seed.json';

const STORAGE_KEY = 'tarifas-liquidador:v2';

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
  outsourcedCostRates: Rows;
  marginPolicies: Rows;
  auditLog: Rows;
}

// Exportada para que un test pueda verificar que ninguna entidad del esquema quedó fuera: una
// colección faltante acá no rompe nada, simplemente devuelve vacío para siempre.
export const COLLECTIONS: (keyof TarifasDatabase)[] = [
  'countries', 'zones', 'carriers', 'drivers', 'vehicles', 'trips', 'dispatchGuides', 'tripReturns',
  'countrySettings', 'zoneGroups', 'pricingRules', 'pricingTemplates', 'settlementParties',
  'partyVariables', 'settlements', 'costStructures', 'costStructureRows', 'rateTables',
  'rateTableRows', 'outsourcedCostRates', 'marginPolicies', 'auditLog',
];

function cloneSeed(): TarifasDatabase {
  // structuredClone evita que dos lecturas compartan referencias y que una mute la semilla original.
  return structuredClone(seedJson) as unknown as TarifasDatabase;
}

/**
 * Repara un almacén guardado al que le falte alguna colección (p.ej. una entidad nueva agregada
 * después), conservando todo lo demás. Antes, cualquier forma inesperada hacía volver a la semilla
 * ENTERA y borraba en silencio lo configurado.
 */
function migrate(parsed: unknown): TarifasDatabase | null {
  if (!parsed || typeof parsed !== 'object') return null;

  const stored = parsed as Record<string, unknown>;
  const seed = cloneSeed();
  const result = {} as TarifasDatabase;

  for (const collection of COLLECTIONS) {
    const existing = stored[collection];
    result[collection] = Array.isArray(existing) ? (existing as Rows) : seed[collection];
  }
  return result;
}

// ── Lectura y escritura ───────────────────────────────────────────────────────────────────────

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function loadDatabase(): TarifasDatabase {
  if (!hasLocalStorage()) return cloneSeed();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return cloneSeed();
  try {
    return migrate(JSON.parse(raw)) ?? cloneSeed();
  } catch {
    return cloneSeed();
  }
}

export function persist(db: TarifasDatabase): void {
  if (!hasLocalStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function resetToSeed(): TarifasDatabase {
  const db = cloneSeed();
  persist(db);
  return db;
}

export function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
