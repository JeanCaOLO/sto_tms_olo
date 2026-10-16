// Estado en memoria del almacén del tarifador: una semilla clonada. Lo usan dos consumidores:
//   - las pruebas, con la semilla de `__tests__/fixtures/seed.json` (`src/test/setupTarifas.ts`);
//   - el modo mock de desarrollo, con `seed.demo.json` (`installMock.ts`), que además persiste en
//     `localStorage` para que el CRUD sobreviva a una recarga.
// Incluye las entidades EXTERNAS (viajes, transportistas, conductores, vehículos, zonas, países) con
// la forma que devuelve el backend; son de solo lectura.
//
// El store NO importa ninguna semilla: así la de pruebas no entra al bundle de la app.

import { ENTITY_NAMES } from '../schema';
import { notifyWrite } from '../writeEvents';

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

let seed: TarifasDatabase | null = null;
let storageKey: string | null = null;

/** Fija la semilla de la que parte el almacén (y a la que vuelve `resetToSeed`). */
export function setSeed(next: unknown): void {
  seed = next as TarifasDatabase;
  current = cloneSeed();
}

/** Activa la persistencia en `localStorage` bajo esa clave y recupera lo guardado, si hay. */
export function enablePersistence(key: string): void {
  storageKey = key;
  try {
    const raw = localStorage.getItem(key);
    if (raw) current = JSON.parse(raw) as TarifasDatabase;
  } catch {
    // Sin localStorage o con datos ilegibles: se arranca desde la semilla.
  }
}

function cloneSeed(): TarifasDatabase {
  if (!seed) throw new Error('El almacén en memoria no tiene semilla: llamá a setSeed() primero.');
  // structuredClone evita que dos lecturas compartan referencias y que una mute la semilla original.
  return structuredClone(seed);
}

// El estado vive aquí; `MemoryDataSource` lo lee y lo muta. Un `beforeEach` global lo reinicia.
let current: TarifasDatabase = {} as TarifasDatabase;

export function loadDatabase(): TarifasDatabase {
  return current;
}

export function persist(db: TarifasDatabase): void {
  current = db;
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(db));
  } catch {
    // Cuota llena o localStorage bloqueado: el almacén sigue funcionando en memoria.
  }
}

export function resetToSeed(): TarifasDatabase {
  current = cloneSeed();
  if (storageKey) {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ver `persist`.
    }
  }
  // Todo lo que alguien guardó en caché (catálogo, perfiles) quedó viejo.
  notifyWrite(ENTITY_NAMES);
  return current;
}

export function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
