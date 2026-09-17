// Borde entre los componentes de `pages/reglas-tarifa/` y la capa de datos (`data/`).
//
// MISMAS firmas y MISMAS formas de fila (snake_case, con relaciones anidadas donde las había) que
// antes: ni un componente cambia. Lo que cambió es de dónde vienen los datos — ya no se llama a
// `localData/store.ts` directamente, sino a `db()`, el driver activo (JSON hoy, Postgres cuando
// haya API). Ver `data/index.ts`.
//
// Este archivo también traduce los errores tipados de la capa (`NotFoundError`, `ForeignKeyError`)
// a la forma `{ error: { code?, message } }` que la UI ya sabe mostrar.

import { db, ForeignKeyError, NotFoundError, type EntityName, type FindOptions, type Row } from './data';
import { zoneUsedByRateTables } from './rateTablesDataSource';

type SaveResult = { error: { code?: string; message: string } | null };

const OK: SaveResult = { error: null };

/** Convierte cualquier fallo de la capa de datos en la forma que los componentes ya manejan. */
async function attempt(action: () => Promise<unknown>): Promise<SaveResult> {
  try {
    await action();
    return OK;
  } catch (error) {
    if (error instanceof ForeignKeyError || error instanceof NotFoundError) {
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
// Países
// ---------------------------------------------------------------------------------------------

export async function listCountries(_organizationId: string): Promise<Row[]> {
  return db().find('country', byName);
}

// ---------------------------------------------------------------------------------------------
// Zone groups
// ---------------------------------------------------------------------------------------------

// El consumidor usa `id`, `name` y `country_id` (este último para acotar el selector de grupo al
// país activo, igual que ya se hace con las zonas) — se mantiene esa forma acotada para no ampliar
// el contrato sin necesidad.
export async function listZoneGroups(_organizationId: string): Promise<Row[]> {
  const rows = await db().find('zoneGroup', byName);
  return rows.map((g) => ({ id: g.id, name: g.name, country_id: g.country_id }));
}

// ---------------------------------------------------------------------------------------------
// Zonas
// ---------------------------------------------------------------------------------------------

export async function listZones(_organizationId: string): Promise<Row[]> {
  const [zones, zoneGroups, countries] = await Promise.all([
    db().find('zone', { orderBy: [{ column: 'code', locale: true }] }),
    db().find('zoneGroup'),
    db().find('country'),
  ]);

  const zoneGroupsById = new Map(zoneGroups.map((g) => [g.id, g]));
  const countriesById = new Map(countries.map((c) => [c.id, c]));

  return zones.map((z) => ({
    ...z,
    zone_groups: z.zone_group_id ? { name: zoneGroupsById.get(z.zone_group_id)?.name ?? null } : null,
    countries: z.country_id ? { name: countriesById.get(z.country_id)?.name ?? null } : null,
  }));
}

export async function saveZone(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  return attempt(() => upsert('zone', payload, id));
}

/**
 * La capa de datos impide borrar una zona en uso por una FK declarada en el esquema. Los tarifarios
 * quedan FUERA de esa red: guardan el CÓDIGO de la zona, que es lo que el motor compara, y un
 * código no es una clave foránea. Sin este chequeo, borrar una zona dejaría filas de tarifario
 * apuntando a un código que ya no existe — filas que no cobran a nadie y que nadie ve.
 *
 * Se devuelve el mismo código 23503 que la UI ya sabe mostrar.
 */
export async function deleteZone(id: string): Promise<SaveResult> {
  const zone = await db().findOne('zone', id);
  if (zone) {
    const usos = await zoneUsedByRateTables(String(zone.code ?? ''));
    if (usos.length > 0) {
      const tarifarios = [...new Set(usos.map((u) => u.tableCode))].join(', ');
      return {
        error: {
          code: '23503',
          message: `No se puede eliminar: la zona "${zone.code}" se usa en ${usos.length} fila`
            + `${usos.length === 1 ? '' : 's'} de ${tarifarios}. Quitá esas filas primero.`,
        },
      };
    }
  }
  return attempt(() => db().delete('zone', id));
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
// Compañías a liquidar — alimenta el selector de transportista del Probador y de Costos, para
// condicionar por `carrierId` sin escribir un id a mano.
//
// Antes esto leía una tabla aparte de "transportistas simulados" (solo id + nombre). Ahora lee las
// compañías reales del tarifador (`settlementParty`), conservando los mismos ids, así que las
// tarifas de outsourcing ya configuradas siguen apuntando a donde apuntaban.
// ---------------------------------------------------------------------------------------------

export async function listSimulatedCarriers(_organizationId: string): Promise<Row[]> {
  return db().find('settlementParty', {
    where: [
      { column: 'classification', op: 'eq', value: 'OUTSOURCED' },
      { column: 'status', op: 'eq', value: 'active' },
    ],
    orderBy: byName.orderBy,
  });
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
