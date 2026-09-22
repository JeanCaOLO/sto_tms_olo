// Reemplazo drop-in de `rulesDataSource.ts`: MISMAS firmas y formas de fila (snake_case, con
// relaciones anidadas donde el original las tenía) para no tocar ni un componente de
// `pages/reglas-tarifa/`. La diferencia es de dónde vienen los datos: acá, de
// `localData/store.ts` (JSON + localStorage) en vez de un proyecto de Supabase temporal — no hay
// acceso a esa base de datos todavía, así que esto es lo que hace que el módulo de tarifas se
// pueda usar y probar hoy. El día que haya acceso a Supabase, este archivo es el único que hay
// que reemplazar (o volver a apuntar `rulesDataSource.ts` a la base real).
//
// Todas las funciones quedan `async` aunque no haya red real, para no cambiar ni una línea de los
// componentes que ya hacen `await listX(...)`.

import { genId, loadDatabase, persist } from './localData/store';

type Row = Record<string, any>;
type SaveResult = { error: any };

export async function listCountries(_organizationId: string): Promise<Row[]> {
  return loadDatabase().countries.slice().sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------------------------
// Zone groups
// ---------------------------------------------------------------------------------------------

// El original solo selecciona `id, name` (`.select('id, name')`) — se replica esa forma acotada
// para no cambiar el contrato con lo que ya consume `ZoneModal`/`RuleTester`.
export async function listZoneGroups(_organizationId: string): Promise<Row[]> {
  return loadDatabase().zoneGroups
    .map((g) => ({ id: g.id, name: g.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------------------------

export async function listZones(_organizationId: string): Promise<Row[]> {
  const db = loadDatabase();
  const zoneGroupsById = new Map(db.zoneGroups.map((g) => [g.id, g]));
  const countriesById = new Map(db.countries.map((c) => [c.id, c]));
  const withRelations: Row[] = db.zones.map((z) => ({
    ...z,
    zone_groups: z.zone_group_id ? { name: zoneGroupsById.get(z.zone_group_id)?.name ?? null } : null,
    countries: z.country_id ? { name: countriesById.get(z.country_id)?.name ?? null } : null,
  }));
  return withRelations.sort((a, b) => a.code.localeCompare(b.code));
}

export async function saveZone(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  const db = loadDatabase();
  if (id) {
    const idx = db.zones.findIndex((z) => z.id === id);
    if (idx === -1) return { error: { message: 'Zona no encontrada.' } };
    db.zones[idx] = { ...db.zones[idx], ...payload };
  } else {
    db.zones.push({ id: genId('zone'), ...payload });
  }
  persist(db);
  return { error: null };
}

export async function deleteZone(id: string): Promise<SaveResult> {
  const db = loadDatabase();
  const inUse = db.zoneLaneRates.some((r) => r.origin_zone_id === id || r.dest_zone_id === id);
  if (inUse) {
    return { error: { code: '23503', message: 'La zona está en uso en tarifas por zona.' } };
  }
  db.zones = db.zones.filter((z) => z.id !== id);
  persist(db);
  return { error: null };
}

// ---------------------------------------------------------------------------------------------
// Pricing rules — reglas de liquidación (pago al transportista)
// ---------------------------------------------------------------------------------------------

export async function listRules(_organizationId: string): Promise<Row[]> {
  return loadDatabase().pricingRules
    .slice()
    .sort((a, b) => (a.stage === b.stage ? a.priority - b.priority : a.stage.localeCompare(b.stage)));
}

export async function saveRule(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  const db = loadDatabase();
  if (id) {
    const idx = db.pricingRules.findIndex((r) => r.id === id);
    if (idx === -1) return { error: { message: 'Regla no encontrada.' } };
    db.pricingRules[idx] = { ...db.pricingRules[idx], ...payload };
  } else {
    db.pricingRules.push({ id: genId('rule'), ...payload });
  }
  persist(db);
  return { error: null };
}

export async function deleteRule(id: string): Promise<SaveResult> {
  const db = loadDatabase();
  db.pricingRules = db.pricingRules.filter((r) => r.id !== id);
  persist(db);
  return { error: null };
}

// ---------------------------------------------------------------------------------------------
// Tarifas por zona (LOOKUP_ZONE)
// ---------------------------------------------------------------------------------------------

export async function listZoneLaneRates(_organizationId: string): Promise<Row[]> {
  return loadDatabase().zoneLaneRates.slice();
}

export async function saveZoneLaneRate(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  const db = loadDatabase();
  if (id) {
    const idx = db.zoneLaneRates.findIndex((r) => r.id === id);
    if (idx === -1) return { error: { message: 'Tarifa por zona no encontrada.' } };
    db.zoneLaneRates[idx] = { ...db.zoneLaneRates[idx], ...payload };
  } else {
    db.zoneLaneRates.push({ id: genId('zlr'), status: 'active', ...payload });
  }
  persist(db);
  return { error: null };
}

export async function deleteZoneLaneRate(id: string): Promise<SaveResult> {
  const db = loadDatabase();
  db.zoneLaneRates = db.zoneLaneRates.filter((r) => r.id !== id);
  persist(db);
  return { error: null };
}

// ---------------------------------------------------------------------------------------------
// Tasas de cambio
// ---------------------------------------------------------------------------------------------

export async function listFxRates(_organizationId: string): Promise<Row[]> {
  return loadDatabase().fxRates.slice();
}

export async function saveFxRate(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  const db = loadDatabase();
  if (id) {
    const idx = db.fxRates.findIndex((r) => r.id === id);
    if (idx === -1) return { error: { message: 'Tasa no encontrada.' } };
    db.fxRates[idx] = { ...db.fxRates[idx], ...payload };
  } else {
    db.fxRates.push({ id: genId('fx'), ...payload });
  }
  persist(db);
  return { error: null };
}

export async function deleteFxRate(id: string): Promise<SaveResult> {
  const db = loadDatabase();
  db.fxRates = db.fxRates.filter((r) => r.id !== id);
  persist(db);
  return { error: null };
}

// ---------------------------------------------------------------------------------------------
// Plantillas de viaje frecuente
// ---------------------------------------------------------------------------------------------

export async function listTemplates(_organizationId: string): Promise<Row[]> {
  return loadDatabase().pricingTemplates.slice();
}

export async function saveTemplate(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  const db = loadDatabase();
  if (id) {
    const idx = db.pricingTemplates.findIndex((t) => t.id === id);
    if (idx === -1) return { error: { message: 'Plantilla no encontrada.' } };
    db.pricingTemplates[idx] = { ...db.pricingTemplates[idx], ...payload };
  } else {
    db.pricingTemplates.push({ id: genId('tpl'), ...payload });
  }
  persist(db);
  return { error: null };
}

export async function deleteTemplate(id: string): Promise<SaveResult> {
  const db = loadDatabase();
  db.pricingTemplates = db.pricingTemplates.filter((t) => t.id !== id);
  persist(db);
  return { error: null };
}

// ---------------------------------------------------------------------------------------------
// Carriers/transportistas simulados — solo para que el Probador tenga con qué condicionar
// `carrierId` sin tener que escribir un uuid a mano.
// ---------------------------------------------------------------------------------------------

export async function listSimulatedCarriers(_organizationId: string): Promise<Row[]> {
  return loadDatabase().testCarriers.slice().sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------------------------
// Costos (Fase 2) — parámetros de flota propia y tarifas planas de outsourcing, por país.
// ---------------------------------------------------------------------------------------------

export async function listOwnCostParams(_organizationId: string): Promise<Row[]> {
  return loadDatabase().ownCostParams.slice();
}

export async function saveOwnCostParams(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  const db = loadDatabase();
  if (id) {
    const idx = db.ownCostParams.findIndex((p) => p.id === id);
    if (idx === -1) return { error: { message: 'Parámetro de costo no encontrado.' } };
    db.ownCostParams[idx] = { ...db.ownCostParams[idx], ...payload };
  } else {
    db.ownCostParams.push({ id: genId('own'), ...payload });
  }
  persist(db);
  return { error: null };
}

export async function listOutsourcedCostRates(_organizationId: string): Promise<Row[]> {
  return loadDatabase().outsourcedCostRates.slice();
}

export async function saveOutsourcedCostRate(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  const db = loadDatabase();
  if (id) {
    const idx = db.outsourcedCostRates.findIndex((r) => r.id === id);
    if (idx === -1) return { error: { message: 'Tarifa de outsourcing no encontrada.' } };
    db.outsourcedCostRates[idx] = { ...db.outsourcedCostRates[idx], ...payload };
  } else {
    db.outsourcedCostRates.push({ id: genId('osr'), ...payload });
  }
  persist(db);
  return { error: null };
}

export async function deleteOutsourcedCostRate(id: string): Promise<SaveResult> {
  const db = loadDatabase();
  db.outsourcedCostRates = db.outsourcedCostRates.filter((r) => r.id !== id);
  persist(db);
  return { error: null };
}

// ---------------------------------------------------------------------------------------------
// Política de margen (Fase 2) — una fila por país.
// ---------------------------------------------------------------------------------------------

export async function listMarginPolicies(_organizationId: string): Promise<Row[]> {
  return loadDatabase().marginPolicies.slice();
}

export async function saveMarginPolicy(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  const db = loadDatabase();
  if (id) {
    const idx = db.marginPolicies.findIndex((p) => p.id === id);
    if (idx === -1) return { error: { message: 'Política de margen no encontrada.' } };
    db.marginPolicies[idx] = { ...db.marginPolicies[idx], ...payload };
  } else {
    db.marginPolicies.push({ id: genId('mp'), ...payload });
  }
  persist(db);
  return { error: null };
}

// ---------------------------------------------------------------------------------------------
// Usado por el "Probador del motor" — expone los datos crudos para armar un CalculateInput sin
// pasar por src/lib/tarifas/repository.ts (que asume rutas/tiendas/tipos de ruta reales del TMS).
// ---------------------------------------------------------------------------------------------

export async function listRulesAndZonesForTesting(organizationId: string) {
  const [
    countries, zoneGroups, zones, rules, zoneLaneRates, fxRates, carriers,
    ownCostParams, outsourcedCostRates, marginPolicies,
  ] = await Promise.all([
    listCountries(organizationId),
    listZoneGroups(organizationId),
    listZones(organizationId),
    listRules(organizationId),
    listZoneLaneRates(organizationId),
    listFxRates(organizationId),
    listSimulatedCarriers(organizationId),
    listOwnCostParams(organizationId),
    listOutsourcedCostRates(organizationId),
    listMarginPolicies(organizationId),
  ]);
  return {
    countries, zoneGroups, zones, rules, zoneLaneRates, fxRates, carriers,
    ownCostParams, outsourcedCostRates, marginPolicies,
  };
}
