// Almacén local del módulo de tarifas: mientras no hay acceso a una base de datos real, todo lo
// que el motor de tarifas necesita (zonas, reglas, tasas, costos, política de margen, plantillas)
// vive en `seed.json` + localStorage, detrás de esta única interfaz de lectura/escritura. El día
// que exista acceso a Supabase, solo este archivo (y `localRulesDataSource.ts`, que lo consume)
// necesitan cambiar — la UI no sabe ni le importa de dónde vienen los datos.
//
// Patrón calcado de `prototipoTarifador/src/data/repository.ts`: semilla embebida, validación al
// leer, fallback silencioso a la semilla si el contenido de localStorage está corrupto o con una
// forma inesperada, y un `resetToSeed()` para volver al punto de partida.

import seedJson from './seed.json';

const STORAGE_KEY = 'tarifas-liquidador:v1';

export interface TarifasDatabase {
  countries: Record<string, any>[];
  zoneGroups: Record<string, any>[];
  zones: Record<string, any>[];
  zoneLaneRates: Record<string, any>[];
  fxRates: Record<string, any>[];
  pricingRules: Record<string, any>[];
  pricingTemplates: Record<string, any>[];
  testCarriers: Record<string, any>[];
  ownCostParams: Record<string, any>[];
  outsourcedCostRates: Record<string, any>[];
  marginPolicies: Record<string, any>[];
  auditLog: Record<string, any>[];
  // Snapshot liviano de margen/costo por liquidación (`settlements.id` del TMS real) — la tabla
  // real no soporta guardar esto sin una migración que todavía no se corre, así que vive acá.
  // Ver `settlementSnapshots.ts`.
  settlementSnapshots: Record<string, any>[];
}

const COLLECTIONS: (keyof TarifasDatabase)[] = [
  'countries', 'zoneGroups', 'zones', 'zoneLaneRates', 'fxRates', 'pricingRules',
  'pricingTemplates', 'testCarriers', 'ownCostParams', 'outsourcedCostRates', 'marginPolicies',
  'auditLog', 'settlementSnapshots',
];

function cloneSeed(): TarifasDatabase {
  // structuredClone evita que dos lecturas compartan referencias y que una mute la semilla original.
  return structuredClone(seedJson) as TarifasDatabase;
}

// Validación superficial pero suficiente: confirma que cada colección esperada existe y es un
// array. No se re-valida cada regla contra RuleSchema acá (eso ya lo hace RuleModal antes de
// guardar) — el objetivo de esta función es solo decidir si el JSON de localStorage es utilizable
// o si hay que volver a la semilla, no re-certificar cada fila en cada lectura.
function isValidDatabase(value: unknown): value is TarifasDatabase {
  if (!value || typeof value !== 'object') return false;
  return COLLECTIONS.every((key) => Array.isArray((value as Record<string, unknown>)[key]));
}

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
    const parsed = JSON.parse(raw);
    if (!isValidDatabase(parsed)) return cloneSeed();
    return parsed;
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
