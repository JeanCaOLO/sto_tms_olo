// Del almacén en memoria (entidades del tarifador) a filas de las tablas reales de Aurora.
// Lo usa `generar.ts`. Devuelve el texto del JSON y un resumen por tabla.

import type { Row } from '../../src/lib/tarifas/data';
import type { TarifasDatabase } from '../../src/lib/tarifas/data/memory/store';
import { construirFlujo } from './flujo';

const ORG = '@ORG';
const PREFIX = 'MOCK_';

type Table = { table: string; rows: Row[] };

const iso = (ms: number) => new Date(ms).toISOString();
const ESTADO_VIAJE: Record<string, string> = { completed: 'completada', planned: 'planificada', in_progress: 'en_ruta', cancelled: 'anulada' };

export function exportar(
  final: TarifasDatabase,
  work: TarifasDatabase,
  ctx: { uuidOf: (k: string) => string; now: number },
): { text: string; resumen: string } {
  const { uuidOf, now } = ctx;
  const out: Table[] = [];
  const add = (table: string, rows: Row[]) => out.push({ table, rows });
  const created = iso(now - 40 * 86_400_000);
  // Capa de Tracking y Devoluciones sobre los mismos viajes (ver flujo.ts).
  const flujo = construirFlujo(final, { uuidOf, now });

  const countryOf = new Map(final.countries.map((c) => [String(c.id), c]));
  const codeOf = (countryId: string) => String(countryOf.get(countryId)?.code ?? '');
  const originStore = (countryId: string) => uuidOf(`store:${countryId}`);
  const warehouse = (countryId: string) => uuidOf(`wh:${countryId}`);

  // ── Países y maestros del TMS que cuelgan de ellos ──
  add('tbl_countries', final.countries.map((c) => ({
    id: c.id, organization_id: ORG, name: c.name, code: c.code, currency: c.currency, timezone: c.code === 'DCR' ? 'America/Costa_Rica' : 'America/Caracas',
    status: 'active', iso_code: c.currency, locale: 'es', unit_system: 'metric', date_format: 'DD/MM/YYYY',
    notes: 'DATO MOCK: país de demostración del módulo de tarifas. Se borra con cargar.mjs --reset.', created_at: created, updated_at: created,
  })));
  add('tbl_warehouses', final.countries.map((c) => ({
    id: warehouse(String(c.id)), organization_id: ORG, country_id: c.id, code: `MOCK-WH-${c.code}`, name: `Almacén MOCK ${c.code}`,
    timezone: c.code === 'DCR' ? 'America/Costa_Rica' : 'America/Caracas', active: true, source_system: 'MOCK', created_at: created, updated_at: created,
  })));

  // Clientes: los que aparecen en los pedidos (por país del viaje).
  const tripCountry = new Map(final.trips.map((t) => [String(t.id), String(t.country_id)]));
  const customers = new Map<string, { id: string; code: string; name: string; country: string }>();
  for (const o of final.tripOrders) {
    const country = tripCountry.get(String(o.route_id))!;
    const key = `${country}:${o.customer_id}`;
    if (!customers.has(key)) customers.set(key, { id: String(o.customer_id), code: String(o.customer_code), name: String(o.customer_name), country });
  }
  // El mismo cliente puede operar en los dos países: en la mock cada país tiene su propio registro (el id de la seed lo usa uno solo).
  const customerId = (country: string, base: string) => uuidOf(`cust:${country}:${base}`);
  const custRows = [...customers.values()];
  add('tbl_customers', custRows.map((c) => ({
    id: customerId(c.country, c.id), organization_id: ORG, country_id: c.country, code: `MOCK-${codeOf(c.country)}-${c.code}`, name: c.name,
    status: 'active', warehouse_id: warehouse(c.country), source_system: 'MOCK', created_at: created, updated_at: created,
  })));
  add('tbl_branches', custRows.map((c, i) => ({
    id: uuidOf(`branch:${c.country}:${c.id}`), customer_id: customerId(c.country, c.id), external_code: `M${i + 1}`, name: `${c.name} (sucursal MOCK)`,
    status: 'active', created_at: created, updated_at: created,
  })));
  add('tbl_final_customers', custRows.map((c) => ({
    id: uuidOf(`fc:${c.country}:${c.id}`), customer_id: customerId(c.country, c.id), external_code: `MOCK-${c.code}`, name: `${c.name} (cliente final MOCK)`,
    status: 'active', customer_type: 'TIENDA', phone: flujo.phone(`${c.country}:${c.id}`, c.country), created_at: created, updated_at: created,
  })));
  add('tbl_stores', final.countries.map((c) => ({
    id: originStore(String(c.id)), organization_id: ORG, country_id: c.id, warehouse_id: warehouse(String(c.id)), name: `Bodega Central MOCK ${c.code}`,
    code: `MOCK-CD-${c.code}`, address: 'Zona industrial (dato de demostración)', ...flujo.storeGeo(String(c.id)), status: 'active',
    store_type: 'warehouse', is_origin: true, created_at: created, updated_at: created,
  })));
  add('tbl_zones', final.zones.map((z) => ({
    id: z.id, name: z.name, status: z.status ?? 'active', organization_id: ORG, country_id: z.country_id, code: z.code, created_at: created, updated_at: created,
  })));

  // ── Transportistas, conductores, vehículos ──
  add('tbl_carriers', final.carriers.map((c, i) => ({
    id: c.id, organization_id: ORG, name: `${c.name} [MOCK]`, code: `MOCK-${c.code}`, tax_id: c.tax_id ?? null, status: 'active', country_id: c.country_id,
    is_flota_propia: c.is_flota_propia === true, rate_type: c.rate_type ?? null, flat_rate_amount: c.flat_rate_amount ?? null,
    // Un contrato vencido y otro por vencer, para ver el aviso de contrato en la liquidación.
    contract_expiry: c.is_flota_propia ? null : (i === 2 ? '2026-08-31' : '2027-12-31'),
    contact_name: 'Contacto MOCK', created_at: created, updated_at: created,
  })));
  // Usuarios de prueba (chofer y Devoluciones): van antes de los conductores y devoluciones porque estos los referencian.
  for (const t of flujo.tablasUsuarios) add(t.table, t.rows);
  add('tbl_drivers', final.drivers.map((d, i) => ({
    id: d.id, organization_id: ORG, carrier_id: d.carrier_id, code: `MOCK-DRV-${String(i + 1).padStart(3, '0')}`, full_name: d.full_name, license_number: d.license_number ?? 'B1',
    phone: d.phone ?? '+000 0000-0000', document: d.document ?? null, status: 'active', app_user_id: flujo.driverUser.get(String(d.id)) ?? null, created_at: created, updated_at: created,
  })));
  add('tbl_vehicles', final.vehicles.map((v) => ({
    id: v.id, organization_id: ORG, carrier_id: v.carrier_id, plate: `MOCK-${v.plate}`, vehicle_type: v.vehicle_type, capacity_weight: v.capacity_weight,
    capacity_volume: v.capacity_volume, status: 'active', container_unit: 'cm', created_at: created, updated_at: created,
  })));

  // ── Viajes, pedidos, guías, devoluciones ──
  const guideOf = new Map<string, Row>();
  for (const o of final.tripOrders) guideOf.set(String(o.guide_number), o);
  const guideByOldId = new Map<string, string>();
  for (const g of final.dispatchGuides) {
    const o = guideOf.get(String(g.guide_number));
    if (o) guideByOldId.set(String(g.id), String(o.id));
  }
  add('tbl_routes', final.trips.map((t) => ({
    id: t.id, organization_id: ORG, store_id: originStore(String(t.country_id)), driver_id: t.driver_id ?? null, vehicle_id: t.vehicle_id ?? null,
    carrier_id: t.carrier_id ?? null, route_number: t.route_number, route_date: t.route_date,
    actual_start_time: t.actual_start_time ?? null, actual_end_time: t.actual_end_time ?? null, total_distance: t.total_distance, total_stops: t.total_stops,
    completed_stops: t.completed_stops, total_weight: t.total_weight, total_volume: t.total_volume, status: flujo.routeStatus(t) ?? ESTADO_VIAJE[String(t.status)] ?? t.status,
    notes: 'DATO MOCK (demostración del módulo de tarifas).', route_type_id: t.dest_zone_id ?? null, created_at: created, updated_at: created,
    ...flujo.routeExtra(String(t.id)),
  })));
  add('tbl_orders', final.tripOrders.map((o) => {
    const country = tripCountry.get(String(o.route_id))!;
    const trip = final.trips.find((t) => t.id === o.route_id)!;
    return {
      id: o.order_id, organization_id: ORG, customer_id: customerId(country, String(o.customer_id)), order_number: `MOCK-${o.order_number}`,
      order_date: trip.route_date, delivery_date: trip.route_date, total_weight: o.weight_kg, total_volume: o.volume_m3, total_items: o.items, total_amount: o.value,
      status: String(o.delivery_status) === 'delivered' ? 'delivered' : 'pending', warehouse_id: warehouse(country),
      branch_id: uuidOf(`branch:${country}:${o.customer_id}`), final_customer_id: uuidOf(`fc:${country}:${o.customer_id}`),
      route_type_id: trip.dest_zone_id ?? null, es_cliente_retira: false, delivery_date_change_count: 0, created_at: created, updated_at: created,
      notes: 'DATO MOCK', ...flujo.orderExtra(String(o.order_id)),
    };
  }));
  add('tbl_dispatch_guides', final.tripOrders.map((o) => ({
    id: o.id, organization_id: ORG, route_id: o.route_id, order_id: o.order_id, guide_number: `MOCK-${o.guide_number}`, sequence_number: o.sequence_number,
    status: String(o.delivery_status) === 'delivered' ? 'completed' : 'pending', delivery_status: o.delivery_status, stop_type: 'delivery',
    recipient_name: o.customer_name, created_at: created, updated_at: created, ...flujo.guideExtra(String(o.id)),
  })));
  add(flujo.tablaArticulos.table, flujo.tablaArticulos.rows);
  add('tbl_returns', flujo.returnRows.map((r) => ({ ...r, dispatch_guide_id: guideByOldId.get(String(r.dispatch_guide_id)) ?? r.dispatch_guide_id })));
  // Formularios de devolución y tracking (recorridos, visitas, eventos, presencia).
  for (const t of flujo.tablasFlujo) add(t.table, t.rows);

  // ── Tablas propias del tarifador ──
  const own: [string, string][] = [
    ['tbl_tarifas_country_settings', 'countrySettings'], ['tbl_tarifas_margin_policies', 'marginPolicies'], ['tbl_tarifas_zone_groups', 'zoneGroups'],
    ['tbl_tarifas_settlement_parties', 'settlementParties'], ['tbl_tarifas_party_variables', 'partyVariables'],
    ['tbl_tarifas_cost_structures', 'costStructures'], ['tbl_tarifas_cost_structure_rows', 'costStructureRows'],
    ['tbl_tarifas_rate_tables', 'rateTables'], ['tbl_tarifas_rate_table_rows', 'rateTableRows'],
    ['tbl_tarifas_pricing_rules', 'pricingRules'], ['tbl_tarifas_pricing_templates', 'pricingTemplates'],
    ['tbl_tarifas_trip_tender_awards', 'tripTenderAwards'], ['tbl_tarifas_trip_order_marks', 'tripOrderMarks'],
    ['tbl_tarifas_proforma_flow_phases', 'proformaFlowPhases'],
    ['tbl_tarifas_settlements', 'settlements'], ['tbl_tarifas_proformas', 'proformas'], ['tbl_tarifas_proforma_items', 'proformaItems'],
    ['tbl_tarifas_proforma_phases', 'proformaPhases'], ['tbl_tarifas_proforma_claims', 'proformaClaims'], ['tbl_tarifas_audit_log', 'auditLog'],
  ];
  for (const [table, key] of own) add(table, (final as unknown as Record<string, Row[]>)[key].map((r) => ({ ...r })));
  void work;

  // ── Prefijo MOCK_ en TODO id de texto (y en sus referencias, también dentro de los JSON) ──
  const textIds = new Set<string>();
  for (const [table, key] of own) {
    if (table === 'tbl_tarifas_country_settings' && false) continue;
    for (const r of (final as unknown as Record<string, Row[]>)[key]) if (typeof r.id === 'string') textIds.add(r.id);
  }
  const rename = (v: unknown): unknown => {
    if (typeof v === 'string') return textIds.has(v) ? `${PREFIX}${v}` : v;
    if (Array.isArray(v)) return v.map(rename);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Row).map(([k, x]) => [k, rename(x)]));
    return v;
  };
  for (const t of out) if (t.table.startsWith('tbl_tarifas_')) t.rows = t.rows.map((r) => rename(r) as Row);

  // Contexto de la mock en la bitácora y las liquidaciones: nada que cambiar; las fechas ya son las simuladas.
  // Solo las tablas con columna `id`: el tracking y la presencia se borran por viaje/conductor (ver cargar.mjs).
  const deleteOrder = [...out].reverse().filter((t) => t.rows.length > 0 && t.rows.every((r) => r.id !== undefined)).map((t) => ({ table: t.table, ids: t.rows.map((r) => String(r.id)) }));
  const meta = {
    generado: iso(now), descripcion: 'DATA MOCK del tarifador y de su flujo con Devoluciones y Tracking (mismos viajes en los 3 módulos). Dato de prueba: se borra.',
    paises: final.countries.map((c) => ({ id: c.id, code: c.code, name: c.name, currency: c.currency })),
    nota: 'organization_id vale "@ORG": cargar.mjs lo reemplaza por la organización de la BD. "@NOW-<n>m", "@TODAY" y "@ROLE:<rol>" se resuelven al cargar.',
    usuarios: flujo.resumen,
  };
  const text = `${JSON.stringify({ meta, tables: Object.fromEntries(out.map((t) => [t.table, t.rows])), deleteOrder }, null, 1)}\n`;
  const resumen = out.map((t) => `${t.table}=${t.rows.length}`).join('\n');
  return { text, resumen };
}
