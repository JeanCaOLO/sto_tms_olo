// Borde entre los componentes de `pages/reglas-tarifa/` y la capa de datos (`data/`).
//
// Formas de fila snake_case, con relaciones anidadas donde las había, para las pantallas. Todo por
// `db()`, el driver activo (Aurora vía HTTP en producción, JSON en tests). Ver `data/index.ts`.
//
// Desde 2026-10-02 (ROADMAP §8) países y zonas son del catálogo del TMS: acá se LEEN y no se
// editan. Lo que el tarifador edita es su configuración: grupos de zona, configuración de cálculo
// por país, reglas, plantillas, costos y política de margen.
//
// Este archivo también traduce los errores tipados de la capa a la forma
// `{ error: { code?, message } }` que la UI ya sabe mostrar.

import {
  db, ForeignKeyError, NotFoundError, ReadOnlyEntityError, UniqueViolationError,
  type EntityName, type FindOptions, type Row,
} from './data';
import { zoneUsedByRateTables } from './rateTablesDataSource';

type SaveResult = { error: { code?: string; message: string } | null };

const OK: SaveResult = { error: null };

/** Convierte cualquier fallo de la capa de datos en la forma que los componentes ya manejan. */
async function attempt(action: () => Promise<unknown>): Promise<SaveResult> {
  try {
    await action();
    return OK;
  } catch (error) {
    if (
      error instanceof ForeignKeyError || error instanceof NotFoundError
      || error instanceof UniqueViolationError || error instanceof ReadOnlyEntityError
    ) {
      return { error: { code: error.code, message: error.message } };
    }
    return { error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

/** Inserta o actualiza según venga `id`, que es el patrón de todos los modales del módulo. */
function upsert(entity: EntityName, payload: Row, id: string | undefined, defaults: Row = {}): Promise<unknown> {
  return id ? db().update(entity, id, payload) : db().insert(entity, { ...defaults, ...payload });
}

const byName: FindOptions = { orderBy: [{ column: 'name', locale: true }] };

// ---------------------------------------------------------------------------------------------
// Países — del catálogo del TMS (solo lectura) + su configuración de cálculo (propia).
// ---------------------------------------------------------------------------------------------

/**
 * Países del catálogo, con su configuración de cálculo aplanada en la fila. Conserva los nombres de
 * columna que ya usaban las pantallas (`iso2`, `local_currency`, `rounding_*`,
 * `overnight_threshold_hours`); `settings_id` es nulo si el país todavía no se configuró.
 */
export async function listCountries(_organizationId: string): Promise<Row[]> {
  const [countries, settings] = await Promise.all([
    db().find('country', byName),
    db().find('countrySettings'),
  ]);
  const byCountry = new Map(settings.map((s) => [s.country_id, s]));
  return countries.map((c) => {
    const s = byCountry.get(c.id);
    return {
      id: c.id,
      code: c.code,
      iso2: c.code,
      name: c.name,
      local_currency: c.currency,
      settings_id: s?.id ?? null,
      rounding_decimals: s?.rounding_decimals ?? null,
      rounding_mode: s?.rounding_mode ?? null,
      overnight_threshold_hours: s?.overnight_threshold_hours ?? null,
    };
  });
}

/** Guarda la configuración de cálculo de un país (redondeo, pernocta). La moneda es del catálogo. */
export async function saveCountrySettings(
  countryId: string,
  payload: { rounding_decimals: number; rounding_mode: string; overnight_threshold_hours: number },
): Promise<SaveResult> {
  return attempt(async () => {
    const [actual] = await db().find('countrySettings', {
      where: [{ column: 'country_id', op: 'eq', value: countryId }],
      limit: 1,
    });
    return actual
      ? db().update('countrySettings', actual.id, payload)
      : db().insert('countrySettings', { ...payload, country_id: countryId });
  });
}

// ---------------------------------------------------------------------------------------------
// Grupos de zona — propios del cálculo. Cada grupo guarda los CÓDIGOS de las zonas del catálogo
// que abarca (`zone_codes`).
// ---------------------------------------------------------------------------------------------

export async function listZoneGroups(_organizationId: string): Promise<Row[]> {
  const rows = await db().find('zoneGroup', byName);
  return rows.map((g) => ({
    id: g.id,
    code: g.code,
    name: g.name,
    country_id: g.country_id,
    zone_codes: Array.isArray(g.zone_codes) ? g.zone_codes : [],
    status: g.status,
  }));
}

/**
 * Valida que una zona no quede en dos grupos del mismo país: el motor tomaría uno arbitrario y la
 * regla por grupo cobraría según el orden en que se cargaron.
 */
export async function saveZoneGroup(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  const codes: string[] = Array.isArray(payload.zone_codes) ? payload.zone_codes.map(String) : [];
  const otros = (await db().find('zoneGroup', {
    where: [{ column: 'country_id', op: 'eq', value: payload.country_id }],
  })).filter((g) => g.id !== id);

  for (const code of codes) {
    const dueño = otros.find((g) => (Array.isArray(g.zone_codes) ? g.zone_codes : []).map(String).includes(code));
    if (dueño) {
      return { error: { code: '23505', message: `La zona "${code}" ya está en el grupo "${dueño.name}".` } };
    }
  }
  return attempt(() => upsert('zoneGroup', { ...payload, zone_codes: codes }, id, { status: 'active' }));
}

export async function deleteZoneGroup(id: string): Promise<SaveResult> {
  return attempt(() => db().delete('zoneGroup', id));
}

// ---------------------------------------------------------------------------------------------
// Zonas — del catálogo del TMS, SOLO LECTURA. Se crean y editan en Catálogos → Zonas.
// ---------------------------------------------------------------------------------------------

/**
 * Zonas del catálogo con su grupo (resuelto desde `zone_codes`) y su país. Misma forma de fila que
 * antes (`zone_groups.name`, `countries.name`) para las pantallas que la muestran.
 */
export async function listZones(_organizationId: string): Promise<Row[]> {
  const [zones, zoneGroups, countries] = await Promise.all([
    db().find('zone', { orderBy: [{ column: 'code', locale: true }] }),
    db().find('zoneGroup'),
    db().find('country'),
  ]);

  const countriesById = new Map(countries.map((c) => [c.id, c]));
  const grupoDe = (z: Row) => zoneGroups.find(
    (g) => g.country_id === z.country_id && (Array.isArray(g.zone_codes) ? g.zone_codes : []).map(String).includes(String(z.code)),
  );

  return zones.map((z) => {
    const grupo = grupoDe(z);
    return {
      ...z,
      zone_group_id: grupo?.id ?? null,
      zone_groups: grupo ? { name: grupo.name } : null,
      countries: z.country_id ? { name: countriesById.get(z.country_id)?.name ?? null } : null,
    };
  });
}

/**
 * Filas de tarifario que nombran el código de una zona. Las zonas son del catálogo y se dan de baja
 * allá; esto sirve para avisar en la pantalla de tarifarios que una fila apunta a una zona que ya
 * no existe o está inactiva.
 */
export async function zoneUsage(code: string) {
  return zoneUsedByRateTables(code);
}

// ---------------------------------------------------------------------------------------------
// Reglas de tarifa — liquidación (pago al transportista)
// ---------------------------------------------------------------------------------------------

export async function listRules(_organizationId: string): Promise<Row[]> {
  return db().find('pricingRule', {
    orderBy: [{ column: 'stage', locale: true }, { column: 'priority' }],
  });
}

export async function saveRule(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  return attempt(() => upsert('pricingRule', payload, id));
}

export async function deleteRule(id: string): Promise<SaveResult> {
  return attempt(() => db().delete('pricingRule', id));
}

// ---------------------------------------------------------------------------------------------





// ---------------------------------------------------------------------------------------------
// Plantillas de viaje frecuente
// ---------------------------------------------------------------------------------------------

export async function listTemplates(_organizationId: string): Promise<Row[]> {
  return db().find('pricingTemplate');
}

export async function saveTemplate(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  return attempt(() => upsert('pricingTemplate', payload, id));
}

export async function deleteTemplate(id: string): Promise<SaveResult> {
  return attempt(() => db().delete('pricingTemplate', id));
}

// ---------------------------------------------------------------------------------------------
// Transportistas terceros — alimenta el selector de transportista del Probador y de Costos.
//
// Lee el catálogo del TMS (`carriers` con `is_flota_propia = false`), con su perfil de cálculo:
//   - `id`        = `carriers.id`: es el valor de la variable `carrierId` en las reglas.
//   - `party_id`  = perfil de cálculo, o null si todavía no tiene. Las tarifas de outsourcing se
//                   guardan contra el PERFIL (`outsourcedCostRate.carrier_id` → `settlementParty`):
//                   la pantalla debe llamar a `ensurePartyProfile(id)` antes de guardar una.
// ---------------------------------------------------------------------------------------------

export async function listSimulatedCarriers(_organizationId: string): Promise<Row[]> {
  const [carriers, profiles] = await Promise.all([
    db().find('carrier', {
      where: [{ column: 'is_flota_propia', op: 'eq', value: false }],
      orderBy: byName.orderBy,
    }),
    db().find('settlementParty'),
  ]);
  const perfil = new Map(profiles.map((p) => [String(p.carrier_id), p]));
  return carriers
    .filter((c) => c.status !== 'inactive')
    .map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      country_id: c.country_id,
      party_id: perfil.get(String(c.id))?.id ?? null,
    }));
}

// ---------------------------------------------------------------------------------------------
// Costos — parámetros de flota propia y tarifas planas de outsourcing, por país.
// ---------------------------------------------------------------------------------------------

export async function listOwnCostParams(_organizationId: string): Promise<Row[]> {
  return db().find('ownCostParams');
}

export async function saveOwnCostParams(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  return attempt(() => upsert('ownCostParams', payload, id));
}

export async function listOutsourcedCostRates(_organizationId: string): Promise<Row[]> {
  return db().find('outsourcedCostRate');
}

export async function saveOutsourcedCostRate(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  return attempt(() => upsert('outsourcedCostRate', payload, id));
}

export async function deleteOutsourcedCostRate(id: string): Promise<SaveResult> {
  return attempt(() => db().delete('outsourcedCostRate', id));
}

export interface ImportedRate {
  truckTypeId: string;
  flatRate: string;
}

export interface RateImportOutcome {
  error: string | null;
  created: number;
  updated: number;
}

/**
 * Importa varias tarifas de golpe para UN transportista y UN país.
 *
 * Corre en una TRANSACCIÓN: si falla a mitad, no queda un tarifario con la mitad de los vehículos
 * cargados — que es peor que no importar nada, porque parece completo.
 *
 * `onDuplicate` decide qué hacer con un tipo de vehículo que esa compañía ya tenía:
 *   'update' -> le pisa la tarifa con la del archivo
 *   'skip'   -> lo deja como estaba
 */
export async function importOutsourcedRates(
  _organizationId: string,
  countryId: string,
  carrierId: string,
  rates: ImportedRate[],
  onDuplicate: 'update' | 'skip',
): Promise<RateImportOutcome> {
  try {
    return await db().transaction(async (tx) => {
      const existing = await tx.find('outsourcedCostRate', {
        where: [
          { column: 'country_id', op: 'eq', value: countryId },
          { column: 'carrier_id', op: 'eq', value: carrierId },
        ],
      });
      const byTruckType = new Map(existing.map((r) => [String(r.truck_type_id).toUpperCase(), r]));

      let created = 0;
      let updated = 0;

      for (const rate of rates) {
        const previo = byTruckType.get(rate.truckTypeId.toUpperCase());

        if (previo) {
          if (onDuplicate === 'skip') continue;
          await tx.update('outsourcedCostRate', previo.id, {
            flat_rate: rate.flatRate,
          });
          updated += 1;
          continue;
        }

        await tx.insert('outsourcedCostRate', {
          country_id: countryId,
          carrier_id: carrierId,
          truck_type_id: rate.truckTypeId,
          flat_rate: rate.flatRate,
        });
        created += 1;
      }

      return { error: null, created, updated };
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      created: 0,
      updated: 0,
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Política de margen — una fila por país.
// ---------------------------------------------------------------------------------------------

export async function listMarginPolicies(_organizationId: string): Promise<Row[]> {
  return db().find('marginPolicy');
}

export async function saveMarginPolicy(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  return attempt(() => upsert('marginPolicy', payload, id));
}

// ---------------------------------------------------------------------------------------------
// Usado por el "Probador del motor": expone los datos crudos para armar un CalculateInput sin
// pasar por `repository.ts` (que asume rutas/tiendas/tipos de ruta reales del TMS).
// ---------------------------------------------------------------------------------------------

export async function listRulesAndZonesForTesting(organizationId: string) {
  const [
    countries, zoneGroups, zones, rules, carriers,
    ownCostParams, outsourcedCostRates, marginPolicies,
  ] = await Promise.all([
    listCountries(organizationId),
    listZoneGroups(organizationId),
    listZones(organizationId),
    listRules(organizationId),
    listSimulatedCarriers(organizationId),
    listOwnCostParams(organizationId),
    listOutsourcedCostRates(organizationId),
    listMarginPolicies(organizationId),
  ]);
  return {
    countries, zoneGroups, zones, rules, carriers,
    ownCostParams, outsourcedCostRates, marginPolicies,
  };
}
