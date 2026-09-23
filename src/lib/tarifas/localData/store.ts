// Almacén local del módulo de tarifas: mientras no hay acceso a una base de datos real, todo lo
// que el motor necesita (zonas, reglas, tasas, compañías, costos, política de margen, plantillas)
// vive en `seed.json` + localStorage, detrás de esta única interfaz de lectura/escritura.
//
// A partir de la capa de datos (`../data/`), nadie fuera de este archivo lo usa directamente: el
// driver `JsonDataSource` es el único consumidor. El día que haya Postgres, el driver cambia y
// esto queda sin uso, sin tocar ni la UI ni el kernel.

import seedJson from './seed.json';

const STORAGE_KEY = 'tarifas-liquidador:v1';

export interface TarifasDatabase {
  countries: Record<string, any>[];
  zoneGroups: Record<string, any>[];
  zones: Record<string, any>[];
  pricingRules: Record<string, any>[];
  pricingTemplates: Record<string, any>[];
  /** Compañías a liquidar: flota propia y transportistas terceros. Ver `data/schema.ts`. */
  settlementParties: Record<string, any>[];
  /** Variables personalizadas declaradas por cada compañía. */
  partyVariables: Record<string, any>[];
  /** Catálogo de vehículos por compañía: capacidad de cada tipo de camión. */
  partyVehicleTypes: Record<string, any>[];
  /** Rutas comerciales del tarifador (`CAR-CCS`), por transportista. */
  routes: Record<string, any>[];
  /** Conductores del tarifador. La guía física trae nombre y cédula. */
  drivers: Record<string, any>[];
  /** Liquidaciones emitidas, con su desglose completo. */
  settlements: Record<string, any>[];
  /** Estructuras de costos por compañía, y sus filas. */
  costStructures: Record<string, any>[];
  costStructureRows: Record<string, any>[];
  /** Tarifarios por combinación, y sus filas. */
  rateTables: Record<string, any>[];
  rateTableRows: Record<string, any>[];
  ownCostParams: Record<string, any>[];
  outsourcedCostRates: Record<string, any>[];
  marginPolicies: Record<string, any>[];
  auditLog: Record<string, any>[];
  // Snapshot liviano de margen/costo por liquidación (`settlements.id` del TMS real) — la tabla
  // real no soporta guardar esto sin una migración que todavía no se corre, así que vive acá.
}

// Exportada para que un test pueda verificar que ninguna entidad del esquema quedó fuera: una
// colección faltante acá no rompe nada, simplemente devuelve vacío para siempre.
export const COLLECTIONS: (keyof TarifasDatabase)[] = [
  'countries', 'zoneGroups', 'zones', 'pricingRules',
  'pricingTemplates', 'settlementParties', 'partyVariables', 'partyVehicleTypes',
  'routes', 'drivers', 'settlements', 'costStructures', 'costStructureRows',
  'rateTables', 'rateTableRows', 'ownCostParams', 'outsourcedCostRates',
  'marginPolicies', 'auditLog',
];

function cloneSeed(): TarifasDatabase {
  // structuredClone evita que dos lecturas compartan referencias y que una mute la semilla original.
  //
  // La semilla conserva la forma VIEJA de las tarifas por zona y la misma migración que repara un
  // almacén guardado la convierte acá. Así hay UNA sola definición de la forma nueva: si en vez de
  // esto se editara `seed.json`, la instalación nueva y la migrada podrían terminar distintas sin
  // que ninguna prueba lo note.
  return absorbZoneLaneRates(structuredClone(seedJson) as unknown as TarifasDatabase);
}

// ── Migraciones ───────────────────────────────────────────────────────────────────────────────
// Antes, cualquier forma inesperada en localStorage hacía volver a la semilla ENTERA: agregar una
// colección nueva borraba en silencio todo lo que el usuario hubiera configurado. Ahora se repara
// lo que falta y se conserva lo demás.

/** `testCarriers` (transportistas simulados, solo id+nombre) pasó a ser `settlementParties`. */
function migrateTestCarriersToParties(stored: Record<string, unknown>): Record<string, any>[] | null {
  const legacy = stored.testCarriers;
  if (!Array.isArray(legacy)) return null;

  // El id se conserva: `outsourcedCostRates.carrier_id` ya apunta a estos valores y perderían su
  // referencia si se regeneraran.
  return legacy.map((row: Record<string, any>) => ({
    id: row.id,
    // El registro viejo no tenía país; se infiere del id de la semilla (CARRIER_VE_1 -> VE) y, si
    // no se puede, queda el primer país configurado para que la fila siga siendo utilizable.
    country_id: row.country_id ?? inferCountryFromId(String(row.id ?? '')) ?? '',
    classification: 'OUTSOURCED',
    code: row.code ?? String(row.id ?? ''),
    name: row.name ?? String(row.id ?? ''),
    tax_id: null,
    tax_id_type: null,
    carrier_id: null,
    contact_name: null,
    email: null,
    phone: null,
    address: null,
    status: 'active',
    notes: 'Migrado automáticamente desde "transportistas simulados". Completá sus datos fiscales.',
  }));
}

function inferCountryFromId(id: string): string | null {
  const match = /^CARRIER_([A-Z]{2})_/.exec(id);
  return match ? match[1] : null;
}

/** Repara un almacén guardado con una versión anterior del esquema, sin perder lo configurado. */
function migrate(parsed: unknown): TarifasDatabase | null {
  if (!parsed || typeof parsed !== 'object') return null;

  const stored = parsed as Record<string, unknown>;
  const seed = cloneSeed();
  const result = {} as TarifasDatabase;

  for (const collection of COLLECTIONS) {
    const existing = stored[collection];
    if (Array.isArray(existing)) {
      result[collection] = existing as Record<string, any>[];
      continue;
    }

    if (collection === 'settlementParties') {
      const migrated = migrateTestCarriersToParties(stored);
      // Sin `testCarriers` previos tampoco hay nada que conservar: se siembra el catálogo inicial.
      result[collection] = migrated ?? seed.settlementParties;
      continue;
    }

    result[collection] = seed[collection];
  }

  return absorbZoneLaneRates(migrateToSingleCurrency(result));
}


/**
 * Lleva un almacén guardado con DOS monedas por país a una sola.
 *
 * Por qué hace falta y no alcanza con cambiar la semilla: la semilla solo se usa cuando no hay nada
 * guardado. Quien ya tenía datos en el navegador conserva importes escritos en la moneda de
 * REFERENCIA (dólares) y un país cuya moneda de liquidación era otra. Sin convertirlos, esos
 * importes se releerían como si fueran pesos o colones — un costo 4.000 veces más chico, con un
 * margen del 100% y ningún error a la vista.
 *
 * Qué hace: multiplica por la tasa del país todo importe escrito en referencia, fija la moneda
 * única y borra las tasas. Venezuela es la excepción: su moneda única pasa a ser el dólar, así que
 * sus importes en referencia ya están bien y no se tocan.
 *
 * Idempotente: sin `fxRates` no hay nada que convertir y devuelve la misma base.
 *
 * PURA y exportada para poder probarla.
 */
export function migrateToSingleCurrency(db: TarifasDatabase): TarifasDatabase {
  const legacy = (db as unknown as Record<string, unknown>).fxRates;
  if (!Array.isArray(legacy) || legacy.length === 0) return db;

  // Tasa por país: "cuántas unidades de moneda local vale una de referencia".
  const tasaDe = new Map<string, number>();
  for (const fx of legacy as Record<string, any>[]) {
    const rate = Number(fx.rate);
    if (Number.isFinite(rate) && rate > 0) tasaDe.set(String(fx.country_id), rate);
  }

  // Un país que YA liquidaba en su moneda de referencia no necesita conversión: sus importes en
  // referencia ya están en la moneda que va a quedar.
  const factorDe = new Map<string, number>();
  for (const pais of db.countries) {
    const id = String(pais.id);
    const yaEraReferencia = pais.local_currency === pais.ref_currency;
    factorDe.set(id, yaEraReferencia ? 1 : (tasaDe.get(id) ?? 1));
  }

  const factorPara = (countryId: unknown, mode: unknown): number => {
    // `currency_mode` nulo significaba 'REF' para el kernel: se trata igual.
    if (mode === 'LOCAL') return 1;
    return factorDe.get(String(countryId)) ?? 1;
  };

  const escalar = (valor: unknown, factor: number): string => {
    const n = Number(valor);
    if (!Number.isFinite(n) || factor === 1) return String(valor);
    return String(n * factor);
  };

  const escalarExpr = (expr: any, factor: number, code: unknown): any => {
    if (!expr || typeof expr !== 'object' || factor === 1) return expr;
    const out: Record<string, any> = Array.isArray(expr) ? [...expr] : { ...expr };
    for (const [k, v] of Object.entries(out)) {
      const esDinero = (k === 'amount' || k === 'rate')
        && ['FIXED', 'PER_UNIT', 'PER_KM', 'PER_BLOCK'].includes(String(expr.op));
      // El `rate` de la regla de peajes es un multiplicador que traslada el monto del viaje, no una
      // suma de dinero: escalarlo cobraría los peajes multiplicados por la tasa.
      if (esDinero && !(code === 'R_TOLLS' && k === 'rate')) {
        out[k] = escalar(v, factor);
      } else if (k === 'tiers' && Array.isArray(v)) {
        out[k] = v.map((t: any) => ({ ...t, amount: escalar(t.amount, factor) }));
      } else if (['fallback', 'value', 'then', 'else'].includes(k)) {
        out[k] = escalarExpr(v, factor, code);
      } else if (k === 'args' && Array.isArray(v)) {
        out[k] = v.map((a) => escalarExpr(a, factor, code));
      }
      // `pct` queda fuera a propósito: es una fracción, no dinero.
    }
    return out;
  };

  const sinModo = <T extends Record<string, any>>(row: T): T => {
    const { currency_mode: _omitido, ...resto } = row;
    return resto as T;
  };

  // `fxRates` se saca EXPLÍCITAMENTE: con un spread sobreviviría, y una segunda pasada volvería a
  // multiplicar todo por la tasa. Lo encontró el test de idempotencia.
  const { fxRates: _tasasViejas, ...resto } = db as unknown as Record<string, unknown>;

  return {
    ...(resto as unknown as Record<string, unknown>),
    countries: db.countries.map((c) => {
      const { ref_currency: ref, ref_rounding_decimals: _rrd, ...resto } = c;
      return { ...resto, local_currency: ref ?? c.local_currency };
    }),
    pricingRules: db.pricingRules.map((r) => {
      const factor = factorPara(r.country_id, r.currency_mode);
      return sinModo({ ...r, expression: escalarExpr(r.expression, factor, r.code) });
    }),
    // Clave heredada: los tramos zona-a-zona guardados antes de que los absorbieran los tarifarios.
    // Se convierten acá para que la absorción posterior los traslade con el importe correcto.
    zoneLaneRates: (((db as unknown as Record<string, unknown>).zoneLaneRates ?? []) as Record<string, any>[])
      .map((z) => ({ ...z, amount: escalar(z.amount, factorDe.get(String(z.country_id)) ?? 1) })),
    ownCostParams: db.ownCostParams.map((o) => {
      const factor = factorPara(o.country_id, o.currency_mode);
      return sinModo({
        ...o,
        cost_per_km: escalar(o.cost_per_km, factor),
        depreciation_per_km: escalar(o.depreciation_per_km, factor),
        driver_daily: escalar(o.driver_daily, factor),
      });
    }),
    outsourcedCostRates: db.outsourcedCostRates.map((t) => {
      const factor = factorPara(t.country_id, t.currency_mode);
      return sinModo({ ...t, flat_rate: escalar(t.flat_rate, factor) });
    }),
    rateTables: db.rateTables.map(sinModo),
    costStructures: db.costStructures.map(sinModo),
  } as unknown as TarifasDatabase;
}

/**
 * Absorbe las tarifas zona-a-zona dentro de los tarifarios.
 *
 * Por qué: eran una tabla de tarifas con la clave FIJA en dos columnas. El tarifario hace lo mismo
 * con N columnas, así que mantener las dos era tener dos pantallas para cargar lo mismo y dos
 * lugares donde buscar por qué un viaje cobró lo que cobró.
 *
 * Qué hace, una sola vez: crea un tarifario por país con la clave (zona de origen, zona de
 * destino), pasa cada tramo a una fila —traduciendo el id de zona a su CÓDIGO, que es lo que el
 * motor compara— y reescribe las reglas que usaban `LOOKUP_ZONE` para que apunten al tarifario
 * nuevo, conservando su importe de respaldo.
 *
 * Es idempotente porque vacía `zoneLaneRates` al terminar: sin tramos que absorber no vuelve a
 * correr, así que borrar el tarifario migrado no lo resucita.
 *
 * PURA y exportada para poder probarla: recibe la base y devuelve una nueva, sin tocar la original.
 */
export function absorbZoneLaneRates(db: TarifasDatabase): TarifasDatabase {
  // Clave HEREDADA: `zoneLaneRates` ya no es una colección del módulo. Se sigue leyendo para
  // convertir lo que quedó guardado en el navegador de quien la usaba.
  const legacy = (db as unknown as Record<string, unknown>).zoneLaneRates;
  const tramos = (Array.isArray(legacy) ? legacy : []).filter((r: any) => r.status !== 'inactive');
  if (tramos.length === 0) return db;

  const zoneCode = new Map(db.zones.map((z) => [z.id, z.code]));
  const paises = [...new Set(tramos.map((r) => String(r.country_id)))];

  const nuevasTablas: Record<string, any>[] = [];
  const nuevasFilas: Record<string, any>[] = [];
  const tablaPorPais = new Map<string, string>();

  const yaExisten = new Set(db.rateTables.map((t) => String(t.id)));
  const filasExistentes = new Set(db.rateTableRows.map((r) => String(r.id)));

  for (const countryId of paises) {
    const tableId = `RT_ZONAS_${countryId}`;
    tablaPorPais.set(countryId, tableId);

    // El tarifario ya puede estar —la semilla se migra al clonarse y después se vuelve a migrar al
    // fusionarla con lo guardado—. Se reusa en vez de duplicar el id.
    if (!yaExisten.has(tableId)) {
      nuevasTablas.push({
        id: tableId,
        country_id: countryId,
        party_id: null,
        code: 'ZONAS',
        name: 'Tarifas por zona',
        key_columns: ['originZone', 'destZone'],
        active: true,
      });
    }

    let order = 0;
    for (const tramo of tramos.filter((r) => String(r.country_id) === countryId)) {
      order += 1;
      // Mismo motivo que arriba: una fila ya migrada no se duplica.
      if (filasExistentes.has(`RTR_${tramo.id}`)) continue;
      nuevasFilas.push({
        id: `RTR_${tramo.id}`,
        table_id: tableId,
        // El motor compara contra el CÓDIGO de la zona, no contra su id. Un tramo cuya zona ya no
        // existe conserva el id crudo: se ve roto en pantalla, que es mejor que desaparecer.
        key: [zoneCode.get(tramo.origin_zone_id) ?? tramo.origin_zone_id,
          zoneCode.get(tramo.dest_zone_id) ?? tramo.dest_zone_id],
        amount: String(tramo.amount),
        row_order: order,
        active: true,
      });
    }
  }

  const { zoneLaneRates: _absorbidos, ...resto } = db as unknown as Record<string, unknown>;

  return {
    ...(resto as unknown as TarifasDatabase),
    rateTables: [...db.rateTables, ...nuevasTablas],
    rateTableRows: [...db.rateTableRows, ...nuevasFilas],
    pricingRules: db.pricingRules.map((rule) => {
      const tableId = tablaPorPais.get(String(rule.country_id));
      if (!tableId) return rule;
      const expression = rewriteZoneLookups(rule.expression, 'ZONAS');
      return expression === rule.expression ? rule : { ...rule, expression };
    }),
  };
}

/**
 * Cambia cada `LOOKUP_ZONE` por un `LOOKUP_TABLE` contra el tarifario dado, a cualquier profundidad.
 *
 * Recorre la expresión entera porque un `LOOKUP_ZONE` puede estar adentro de un IF o de un MAX: si
 * solo se mirara el nodo de arriba, esas reglas quedarían apuntando a datos que ya no existen y
 * cobrarían su respaldo sin que nadie se entere.
 */
function rewriteZoneLookups(expr: any, tableCode: string): any {
  if (!expr || typeof expr !== 'object') return expr;

  if (expr.op === 'LOOKUP_ZONE') {
    return { op: 'LOOKUP_TABLE', table: tableCode, fallback: rewriteZoneLookups(expr.fallback, tableCode) };
  }

  let cambiado = false;
  const copia: Record<string, any> = Array.isArray(expr) ? [...expr] : { ...expr };
  for (const [key, value] of Object.entries(copia)) {
    const nuevo = Array.isArray(value)
      ? value.map((v) => rewriteZoneLookups(v, tableCode))
      : rewriteZoneLookups(value, tableCode);
    if (nuevo !== value) { copia[key] = nuevo; cambiado = true; }
  }
  return cambiado ? copia : expr;
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
