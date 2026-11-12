// Genera la DATA MOCK del módulo de tarifas (Liquidaciones + Proformas + catálogo del tarifador) para pruebas
// y demostración. Es DATO DE PRUEBA y se borra después (ver cargar.mjs --reset).
//
//   npx jiti scripts/mock-tarifas/generar.ts
//
// Escribe `docs/tarifador/demo-data/mock-tarifas.json`: UNA fuente que lee `cargar.mjs` para llevarla a Aurora.
//
// Cómo se arma (decisiones, para no contaminar nada real):
//   * Dos países NUEVOS, aparte de los reales: "Costa Rica (DEMO)" y "Venezuela (DEMO)". Así las reglas, tarifarios,
//     estructuras de costos y políticas de margen de la mock jamás se mezclan con las de los países reales ni
//     cambian el cálculo de una liquidación real. Borrar la mock = borrar esos dos países y lo que cuelga de ellos.
//   * Parte de la semilla demo del repo (`src/lib/tarifas/data/memory/seed.demo.json`, CR y VE; sin Colombia).
//   * Las liquidaciones, proformas, marcas y reclamos NO se escriben a mano: se emiten con el motor real
//     (`calculateTrip` + `emitSettlement`) sobre una copia en memoria, así el desglose es el que produciría la app.
//   * Todo id de texto lleva el prefijo `MOCK_`; los ids uuid son deterministas y viven en `deleteOrder` del JSON,
//     que es exactamente lo que borra `--reset` (nunca se borra por patrón).

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { db, setDataSource, type Row } from '../../src/lib/tarifas/data';
import { MemoryDataSource } from '../../src/lib/tarifas/data/memory/driver';
import { loadDatabase, setSeed, type TarifasDatabase } from '../../src/lib/tarifas/data/memory/store';
import { calculateTrip } from '../../src/lib/tarifas/tripSettlement';
import { listTripOrders, setOrderMark } from '../../src/lib/tarifas/tripsDataSource';
import {
  emitSettlement, reliquidateSettlement, updateSettlementStatus, type SettlementInput,
} from '../../src/lib/tarifas/settlementsDataSource';
import { setActorRole } from '../../src/lib/tarifas/actor';
import { snapshotOrders, tripProgress } from '../../src/lib/tarifas/tripOrders';
import { computeSettlementTotals } from '../../src/lib/tarifas/settlementTotals';
import { saveFlowPhases } from '../../src/lib/tarifas/proformas/flowConfig';
import { resolveStatus } from '../../src/lib/tarifas/proformas/resolveStatus';
import type { Rule, SettlementReturn, SettlementStatus, TripEdits } from '../../src/lib/tarifas/types';
import { exportar } from './exportar';

const ROOT = resolve(import.meta.dirname ?? __dirname, '../..');
const SEED_IN = resolve(ROOT, 'src/lib/tarifas/data/memory/seed.demo.json');
const OUT = resolve(ROOT, 'docs/tarifador/demo-data/mock-tarifas.json');

const CR_ID = '22222222-2222-4222-8222-222222222221';
const VE_ID = '22222222-2222-4222-8222-222222222222';
const CO_ID = '22222222-2222-4222-8222-222222222223';
const DAY = 86_400_000;
/** "Hoy" de la mock: fija, para que el JSON sea reproducible. */
const NOW = new Date('2026-11-05T15:00:00.000Z').getTime();

// ── RNG determinista ───────────────────────────────────────────────────────────────────────────
let state = 20261105;
function rnd(): number {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + rnd() * (b - a);
const sha = (s: string) => createHash('sha1').update(s).digest('hex');
const uuidOf = (key: string) => {
  const h = sha(`tarifas-mock:${key}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

// ── Base: semilla demo sin Colombia, con los países renombrados ─────────────────────────────────
const raw = JSON.parse(readFileSync(SEED_IN, 'utf8')) as TarifasDatabase;
const notCO = (r: Row) => r.country_id !== CO_ID;
const carriers = raw.carriers.filter(notCO);
const carrierIds = new Set(carriers.map((c) => String(c.id)));
const trips = raw.trips.filter(notCO);
const tripIds = new Set(trips.map((t) => String(t.id)));
const structures = raw.costStructures.filter(notCO);
const structureIds = new Set(structures.map((s) => String(s.id)));
const tables = raw.rateTables.filter(notCO);
const tableIds = new Set(tables.map((t) => String(t.id)));
const parties = raw.settlementParties.filter((p) => carrierIds.has(String(p.carrier_id)));
const partyIds = new Set(parties.map((p) => String(p.id)));

const work: TarifasDatabase = {
  countries: raw.countries.filter((c) => c.id !== CO_ID).map((c) => (c.id === CR_ID
    ? { ...c, code: 'DCR', name: 'Costa Rica MOCK' } : { ...c, code: 'DVE', name: 'Venezuela MOCK' })),
  zones: raw.zones.filter(notCO),
  carriers,
  drivers: raw.drivers.filter((d) => carrierIds.has(String(d.carrier_id))),
  vehicles: raw.vehicles.filter((v) => carrierIds.has(String(v.carrier_id))),
  trips,
  dispatchGuides: raw.dispatchGuides.filter((g) => tripIds.has(String(g.route_id))),
  tripReturns: [],
  tripOrders: raw.tripOrders.filter((o) => tripIds.has(String(o.route_id))),
  tripOrderMarks: [],
  tripTenderAwards: [],
  countrySettings: raw.countrySettings.filter(notCO),
  zoneGroups: raw.zoneGroups.filter(notCO),
  pricingRules: raw.pricingRules.filter(notCO),
  pricingTemplates: raw.pricingTemplates.filter(notCO),
  settlementParties: parties,
  partyVariables: raw.partyVariables.filter((v) => partyIds.has(String(v.party_id))),
  settlements: [],
  costStructures: structures,
  costStructureRows: raw.costStructureRows.filter((r) => structureIds.has(String(r.structure_id))),
  rateTables: tables,
  rateTableRows: raw.rateTableRows.filter((r) => tableIds.has(String(r.table_id))),
  marginPolicies: raw.marginPolicies.filter(notCO),
  proformas: [], proformaItems: [], proformaPhases: [], proformaClaims: [], proformaFlowPhases: [], proformaEmailConfigs: [],
  auditLog: [],
};

const carrierByCode = (code: string) => work.carriers.find((c) => c.code === code)!;
const isOwn = (carrierId: string) => work.carriers.find((c) => c.id === carrierId)?.is_flota_propia === true;

// ── Escenarios de catálogo (antes de calcular) ──────────────────────────────────────────────────
// Dos terceros por tendering (sin adjudicación el cálculo se bloquea: se adjudica solo a los viajes que se liquidan),
// y uno sin forma de cobro (sus viajes salen bloqueados con el motivo y el enlace a configurarla).
const TENDERING = ['HERNANDEZ', 'LLANOS-VE'];
const SIN_FORMA_DE_COBRO = 'JIMENEZ';
for (const code of TENDERING) carrierByCode(code).rate_type = 'TENDERING';
carrierByCode(SIN_FORMA_DE_COBRO).rate_type = null;

// ── Selección de viajes ─────────────────────────────────────────────────────────────────────────
type Trip = (typeof work.trips)[number];
const listos = (t: Trip) => t.status === 'completed' && t.carrier_id && t.dest_zone_id && tripProgress({
  status: t.status, guideCount: Number(t.guide_count), deliveredGuides: Number(t.delivered_guides),
  totalStops: Number(t.total_stops), completedStops: Number(t.completed_stops),
}).complete;
const tripsOf = (code: string) => work.trips.filter((t) => t.carrier_id === carrierByCode(code).id && listos(t))
  .sort((a, b) => String(a.route_date).localeCompare(String(b.route_date)));

function take(code: string, n: number): Trip[] {
  const list = tripsOf(code);
  if (list.length < n) throw new Error(`${code}: hay ${list.length} viajes listos y se piden ${n}`);
  return list.slice(0, n);
}

// ── Plan de liquidaciones ───────────────────────────────────────────────────────────────────────
interface Plan {
  trip: Trip;
  /** Estado final deseado de la liquidación (si la lleva una proforma, lo decide su flujo). */
  edits?: TripEdits;
  notes?: string;
  /** Margen objetivo sobre el valor de la mercancía (se ajustan los pedidos para lograrlo). */
  margin?: number;
  marginReason?: string;
  returns?: SettlementReturn[];
  /** Líneas del cálculo que se destildan (se excluyen del total). */
  excludeLines?: number;
  /** Corrección de monto a mano sobre una línea del cálculo (se elige sola: la primera de variables/ajustes con monto). */
  override?: { factor: number; reason: string };
  /** Regla puntual de esta liquidación (no vive en el catálogo). */
  adhoc?: { code: string; name: string; amount: string; reason: string };
  /** Resueltos en la pasada 1. */
  resolved?: { overrides: Record<string, { value: string; reason: string }>; adhocRules: Rule[] };
}

const edit = (vars: Record<string, number | string>): TripEdits => ({ customVars: vars as TripEdits['customVars'] });

// Se eligen los viajes por transportista (en orden de fecha) y se reparten entre los escenarios de abajo.
const T = {
  olo: take('OLO', 6),
  transosa: take('TRANSOSA', 5),
  acuna: take('ACUNA', 3),
  urena: take('URENA', 3),
  hernandez: take('HERNANDEZ', 3),
  majori: take('TRANSMAJORI', 2),
  ulloa: take('ULLOA', 2),
  veOwn: take('OWN-VE', 3),
  andina: take('ANDINA-VE', 3),
  centro: take('CENTRO-VE', 2),
  llanos: take('LLANOS-VE', 1),
  orinoco: take('ORINOCO-VE', 2),
};

// ── Terceros por kilómetro, por unidad y por volumen ────────────────────────────────────────────
// Cada uno tiene su perfil de cálculo y UNA regla BASE de su forma de cobro (base_method), y se le reasignan viajes
// listos que sobraban de otros transportistas. Las reglas por km / por parada del país quedan omitidas por "duplica la base".
const used = new Set(Object.values(T).flat().map((t) => String(t.id)));
const freeOf = (code: string) => tripsOf(code).filter((t) => !used.has(String(t.id)));
// Viajes que quedan SIN liquidar por devoluciones sin recibir (se reservan antes de repartir los sobrantes).
const BLOQUEADOS: Trip[] = [freeOf('TRANSOSA')[0], freeOf('ACUNA')[0], freeOf('ANDINA-VE')[0]].filter(Boolean);
for (const t of BLOQUEADOS) used.add(String(t.id));

type Forma = 'PER_KM' | 'PER_UNIT' | 'VOLUME';
const FORMAS: { code: string; name: string; country: string; forma: Forma; expr: Record<string, unknown>; viajes: [string, number][] }[] = [
  { code: 'PERKM-CR', name: 'Transportes Por Kilómetro', country: CR_ID, forma: 'PER_KM', expr: { op: 'PER_KM', rate: '560' }, viajes: [['OLO', 2]] },
  { code: 'PERUNIT-CR', name: 'Transportes Por Parada', country: CR_ID, forma: 'PER_UNIT', expr: { op: 'PER_UNIT', unit: 'clientCount', rate: '9500' }, viajes: [['TRANSMAJORI', 2]] },
  { code: 'VOLUMEN-CR', name: 'Transportes Por Volumen', country: CR_ID, forma: 'VOLUME', expr: { op: 'PER_UNIT', unit: 'truckVolumeM3', rate: '3200' }, viajes: [['OLO', 2]] },
  { code: 'PERKM-VE', name: 'Transporte Por Kilómetro VE', country: VE_ID, forma: 'PER_KM', expr: { op: 'PER_KM', rate: '1.25' }, viajes: [['CENTRO-VE', 1]] },
  { code: 'VOLUMEN-VE', name: 'Transporte Por Volumen VE', country: VE_ID, forma: 'VOLUME', expr: { op: 'PER_UNIT', unit: 'truckVolumeM3', rate: '19' }, viajes: [['OWN-VE', 1]] },
];
const nuevos: Record<string, Trip[]> = {};
for (const f of FORMAS) {
  const id = uuidOf(`carrier:${f.code}`);
  const partyId = `PARTY_${f.code}`;
  const tpl = work.vehicles.find((v) => work.carriers.find((c) => c.id === v.carrier_id)?.country_id === f.country)!;
  const driverId = uuidOf(`driver:${f.code}`);
  const vehicleId = uuidOf(`vehicle:${f.code}`);
  work.carriers.push({
    id, country_id: f.country, code: f.code, name: f.name, tax_id: `9-${f.code.length}00-000`, is_flota_propia: false,
    rate_type: f.forma, flat_rate_amount: null, status: 'active',
  });
  work.drivers.push({ id: driverId, carrier_id: id, code: `DRV-${f.code}`, full_name: `Conductor ${f.name}`, document: `9000${f.code.length}`, phone: '+000 0000-0000', license_number: 'B2', status: 'active' });
  work.vehicles.push({ ...tpl, id: vehicleId, carrier_id: id, plate: `${f.code}-01` });
  work.settlementParties.push({ id: partyId, carrier_id: id, status: 'active', notes: null });
  const model = work.pricingRules.find((r) => r.scope === 'PARTY')!;
  work.pricingRules.push({
    ...model, id: `RULE_${f.code}`, country_id: f.country, scope: 'PARTY', party_id: partyId, code: `R_BASE_${f.forma}`,
    name: `Base ${f.forma === 'PER_KM' ? 'por kilómetro' : f.forma === 'PER_UNIT' ? 'por parada' : 'por volumen del camión'}`,
    stage: 'BASE', priority: 10, stacking: 'EXCLUSIVE', conditions: { p: 'ALWAYS' }, expression: f.expr, effect: null, category: null,
    base_method: f.forma, applies_to_base: null, description: 'Forma de cobro pactada con el transportista.', reason: null, version: 1, active: true,
    effective_from: null, effective_to: null,
  });
  nuevos[f.code] = [];
  for (const [donor, n] of f.viajes) {
    for (const t of freeOf(donor).slice(0, n)) {
      used.add(String(t.id));
      Object.assign(t, {
        carrier_id: id, carrier_name: f.name, is_flota_propia: false, driver_id: driverId, driver_name: `Conductor ${f.name}`, driver_document: `9000${f.code.length}`,
        vehicle_id: vehicleId, vehicle_plate: `${f.code}-01`, vehicle_type: tpl.vehicle_type, capacity_weight: tpl.capacity_weight, capacity_volume: tpl.capacity_volume,
      });
      nuevos[f.code].push(t);
    }
    if (nuevos[f.code].length < n) throw new Error(`${f.code}: faltan viajes sobrantes de ${donor}`);
  }
}

// Adjudicaciones de tendering para los viajes que se liquidan.
let awardSeq = 0;
for (const [code, list, base] of [['HERNANDEZ', T.hernandez, 118000], ['LLANOS-VE', T.llanos, 310]] as const) {
  for (const t of list) {
    const monto = Math.round(base * between(0.9, 1.2));
    work.tripTenderAwards.push({
      id: `tnd_${String(++awardSeq).padStart(3, '0')}`, country_id: t.country_id, trip_id: t.id,
      carrier_id: carrierByCode(code).id, amount: String(monto), awarded_at: new Date(NOW - 20 * DAY).toISOString(),
      actor: 'Administrador', notes: 'Adjudicación del tendering de la semana.',
    });
  }
}

// Devoluciones del módulo Devoluciones (informativas para el cálculo, pero con alguna SIN RECIBIR el viaje no se liquida).
// El mismo registro lo ven los 3 módulos: Devoluciones (la recibe), Liquidaciones (la bloquea mientras esté abierta) y
// Tracking (el chofer la registra en la parada: evento "return").
const MOTIVOS = [
  'Producto dañado en tránsito', 'Cliente rechazó la entrega', 'Error en el pedido (producto equivocado)',
  'Producto próximo a vencer', 'Faltante en la entrega',
];
const PRODUCTOS: [string, string][] = [
  ['7501055', 'Aceite vegetal 1 L'], ['7501100', 'Arroz blanco 1 kg'], ['7502210', 'Detergente líquido 2 L'], ['7503044', 'Galletas surtidas 400 g'], ['7504120', 'Leche entera 1 L'],
];
function returnFor(t: Trip, status: string, n: number, extra: Partial<Row> = {}): Row {
  const guides = work.tripOrders.filter((o) => o.route_id === t.id).sort((a, b) => a.sequence_number - b.sequence_number);
  const guide = guides[Number(extra.guideIdx ?? (n - 1)) % guides.length];
  const [code, name] = PRODUCTOS[(n + Number(guide.sequence_number)) % PRODUCTOS.length];
  const { guideIdx: _ignored, ...rest } = extra as Row;
  void _ignored;
  const row: Row = {
    id: uuidOf(`ret:${t.id}:${n}`), route_id: t.id, dispatch_guide_id: guide.id, order_id: guide.order_id,
    return_number: `MOCK-DEV-${String(t.route_number).replace(/\W/g, '')}-${n}`, return_type: 'contracamion',
    reason: MOTIVOS[(n + Number(guide.sequence_number)) % MOTIVOS.length], product_code: code, product_name: name,
    quantity: n + 1, status, ...rest,
  };
  return row;
}

// ── Plan: viajes de CR ──────────────────────────────────────────────────────────────────────────
// (los "sin proforma" se emiten antes de configurar las fases del flujo: quedan en Borrador)
const sinProforma: { plan: Plan; final: 'Borrador' | 'Anulado' | 'RELIQ' }[] = [
  { plan: { trip: T.olo[0], notes: 'Borrador a la espera de revisar peajes.', edits: edit({ 'custom:monto_peajes': 0, 'custom:con_ayudante': 1 }) }, final: 'Borrador' },
  { plan: { trip: T.majori[0], notes: 'Cargada para revisión.' }, final: 'Borrador' },
  { plan: { trip: T.veOwn[0], notes: 'Flota propia VE: costo de la estructura 2026.' }, final: 'Borrador' },
  { plan: { trip: T.centro[0] }, final: 'Borrador' },
  // Anulada sin reemplazo: el viaje vuelve a la bandeja con "tuvo una liquidación anulada".
  { plan: { trip: T.ulloa[0], notes: 'Se cargó por error al transportista equivocado.' }, final: 'Anulado' },
  // Re-liquidación: la primera queda anulada y apunta a la segunda.
  { plan: { trip: T.urena[0], edits: edit({ 'custom:horas_espera': 0 }) }, final: 'RELIQ' },
];

// Los demás se emiten con flujo configurado: cada uno entra solo a la proforma abierta de su transportista.
const conProforma: Plan[] = [
  { trip: T.olo[1], edits: edit({ 'custom:con_ayudante': 1 }), margin: 0.42 },
  { trip: T.olo[2], edits: edit({ 'custom:monto_peajes': 0 }), margin: 0.31 },
  { trip: T.olo[3], margin: 0.12, notes: 'Margen bajo: carga de poco valor.' },
  { trip: T.olo[4], margin: 0.05, marginReason: 'Viaje de relleno acordado con comercial.', returns: [{ invoiceNumber: 'FAC-88231', productCode: 'PRD-044', kind: 'PARCIAL', notes: 'Cliente rechazó 2 cajas.' }] },
  { trip: T.olo[5], margin: -0.1, marginReason: 'Pérdida aceptada por contrato marco.' },
  { trip: T.transosa[0], edits: edit({ 'custom:recolectas': 2, 'custom:peones': 1 }), margin: 0.38 },
  { trip: T.transosa[1], margin: 0.33 },
  { trip: T.transosa[2], margin: 0.29, excludeLines: 1, notes: 'Se destildó un cargo que no aplicaba este viaje.' },
  { trip: T.transosa[3], margin: 0.35, returns: [{ invoiceNumber: 'FAC-90017', productCode: '', kind: 'TOTAL', notes: 'Se devolvió toda la factura.' }] },
  { trip: T.transosa[4], margin: 0.27 },
  { trip: T.acuna[0], edits: edit({ 'custom:zona_riesgo': 'ALTA', 'custom:incidencias': 2 }), margin: 0.4 },
  { trip: T.acuna[1], margin: 0.34 },
  { trip: T.acuna[2], margin: 0.36 },
  { trip: T.urena[1], edits: edit({ 'custom:horas_espera': 2 }), margin: 0.32 },
  { trip: T.urena[2], margin: 0.3 },
  { trip: T.hernandez[0], edits: edit({ 'custom:minutos_atraso': 35 }), margin: 0.37, notes: 'Atraso por cierre de ruta 1.' },
  { trip: T.hernandez[1], margin: 0.33 },
  { trip: T.hernandez[2], margin: 0.28 },
  { trip: T.majori[1], margin: 0.31 },
  { trip: T.ulloa[1], margin: 0.39 },
  // Venezuela
  { trip: T.veOwn[1], edits: edit({ 'custom:con_ayudante': 1 }), margin: 0.41 },
  { trip: T.veOwn[2], margin: 0.07, marginReason: 'Margen crítico aprobado por gerencia.' },
  { trip: T.andina[0], edits: edit({ 'custom:bultos': 120 }), margin: 0.36 },
  { trip: T.andina[1], edits: edit({ 'custom:minutos_atraso': 45 }), margin: 0.3, notes: 'Atraso por cola en el peaje.' },
  { trip: T.andina[2], margin: 0.12, marginReason: 'Margen bajo por carga mixta.' },
  { trip: T.centro[1], margin: 0.33 },
  { trip: T.llanos[0], margin: 0.35 },
  { trip: T.orinoco[0], margin: 0.34 },
  { trip: T.orinoco[1], margin: 0.3 },
];

conProforma.push(
  { trip: nuevos['PERKM-CR'][0], margin: 0.34, notes: 'Base por kilómetro: el cargo por distancia del país se omite para no cobrar dos veces.' },
  { trip: nuevos['PERKM-CR'][1], margin: 0.3 },
  { trip: nuevos['PERUNIT-CR'][0], margin: 0.33, notes: 'Base por parada.' },
  { trip: nuevos['PERUNIT-CR'][1], margin: 0.29 },
  { trip: nuevos['VOLUMEN-CR'][0], margin: 0.36, notes: 'Base por volumen del camión.' },
  { trip: nuevos['VOLUMEN-CR'][1], margin: 0.28 },
  { trip: nuevos['PERKM-VE'][0], margin: 0.31 },
  { trip: nuevos['VOLUMEN-VE'][0], margin: 0.35 },
);
// Correcciones de monto a mano y reglas puntuales (ad-hoc) sobre algunas liquidaciones.
const porViaje = (t: Trip) => conProforma.find((p) => p.trip === t)!;
porViaje(T.transosa[4]).override = { factor: 0.8, reason: 'Descuento acordado del 20% sobre el cargo por paradas por entrega tardía.' };
porViaje(T.acuna[2]).override = { factor: 1.15, reason: 'Ajuste del cargo por paradas en zona de difícil acceso, confirmado por el chofer.' };
porViaje(T.andina[1]).override = { factor: 0.9, reason: 'Se corrigió el cargo por paradas según el comprobante del transportista.' };
porViaje(T.olo[2]).adhoc = { code: 'ADHOC_CARGA_FRAGIL', name: 'Manejo de carga frágil (puntual)', amount: '35000', reason: 'El cliente pidió manejo especial de carga frágil.' };
porViaje(T.urena[1]).adhoc = { code: 'ADHOC_ESPERA_CLIENTE', name: 'Espera en bodega del cliente (puntual)', amount: '22000', reason: 'Espera de 2 horas en la bodega del cliente.' };
porViaje(T.veOwn[1]).adhoc = { code: 'ADHOC_SEGURIDAD', name: 'Escolta de seguridad (puntual)', amount: '45', reason: 'Se contrató escolta para un tramo de ruta.' };
porViaje(nuevos['VOLUMEN-CR'][0]).override = { factor: 0.95, reason: 'Redondeo pactado con el transportista sobre el cargo por paradas.' };

// Estado/decisión de cada proforma, por transportista (en el orden en que se abren). Ver `decisiones` abajo.
type Decision =
  | { tipo: 'aprobada'; pagada?: boolean }            // todas las fases aprobadas (y, opcional, pagada)
  | { tipo: 'enCurso'; aprobadas: number }             // las primeras N fases aprobadas, el resto pendiente
  | { tipo: 'rechazada'; enFase: number; motivo: string; apelada?: boolean }
  | { tipo: 'reiniciada'; enFase: number; motivo: string }
  | { tipo: 'anulada'; motivo: string }
  | { tipo: 'sinDecidir' };

const DECISIONES: Record<string, Decision> = {
  OLO: { tipo: 'aprobada', pagada: true },
  TRANSOSA: { tipo: 'aprobada' },
  ACUNA: { tipo: 'enCurso', aprobadas: 1 },
  URENA: { tipo: 'rechazada', enFase: 2, motivo: 'El total no coincide con la factura del transportista.' },
  HERNANDEZ: { tipo: 'rechazada', enFase: 1, motivo: 'Falta el comprobante de espera del 12/10.', apelada: true },
  TRANSMAJORI: { tipo: 'reiniciada', enFase: 2, motivo: 'Se cobró una recolecta que no se hizo: hay que re-liquidar.' },
  ULLOA: { tipo: 'anulada', motivo: 'Proforma duplicada por error de carga.' },
  'OWN-VE': { tipo: 'aprobada', pagada: true },
  'ANDINA-VE': { tipo: 'enCurso', aprobadas: 2 },
  'CENTRO-VE': { tipo: 'sinDecidir' },
  'LLANOS-VE': { tipo: 'aprobada' },
  'ORINOCO-VE': { tipo: 'rechazada', enFase: 1, motivo: 'Diferencia en el peaje declarado.' },
  'PERKM-CR': { tipo: 'aprobada' },
  'PERUNIT-CR': { tipo: 'enCurso', aprobadas: 1 },
};

export { work, T, sinProforma, conProforma, DECISIONES, uuidOf, returnFor, NOW, DAY, CR_ID, VE_ID, between, rnd };

// ════════════════════════════════════════════════════════════════════════════════════════════════
async function main() {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (k === 'tms_session' ? JSON.stringify({ user: { email: 'demo.liquidador@mock.local' } }) : null),
    setItem: () => undefined, removeItem: () => undefined,
  };
  setActorRole('Administrador');

  const planes = [...sinProforma.map((s) => s.plan), ...conProforma];

  // Fecha "de hoy" para que `new Date()` dentro de la capa de datos sea la de la mock (reproducible).
  const RealDate = Date;
  let clock = NOW - 38 * DAY;
  class MockDate extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date>) { super(...(args.length ? args : [clock] as never)); }
    static now() { return clock; }
  }
  (globalThis as { Date: unknown }).Date = MockDate;
  const tick = (ms: number) => { clock += Math.round(ms); };

  // ── Pasada 1 (solo lectura): el total de cada viaje, para ajustar el valor de sus pedidos y lograr el margen pedido ──
  setSeed(work);
  setDataSource(new MemoryDataSource());
  const totalDe = new Map<string, number>();
  for (const p of planes) {
    const edits = p.edits ?? { customVars: {} };
    let r = await calculateTrip(String(p.trip.id), edits);
    if (r.status !== 'ok') throw new Error(`${p.trip.route_number}: ${r.status} ${'message' in r ? r.message : ''}`);
    if (p.override || p.adhoc) {
      const overrides: Record<string, { value: string; reason: string }> = {};
      if (p.override) {
        const linea = r.calculation.result.trace.find((l) => (l.stage === 'VARIABLE' || l.stage === 'ADJUSTMENT') && Number(l.final) > 0)
          ?? r.calculation.result.trace.find((l) => Number(l.final) > 0)!;
        overrides[linea.ruleCode] = { value: String(Math.round(Number(linea.final) * p.override.factor * 100) / 100), reason: p.override.reason };
      }
      const adhocRules: Rule[] = p.adhoc ? [{
        id: `adhoc_${p.adhoc.code}`, countryId: String(p.trip.country_id), code: p.adhoc.code, name: p.adhoc.name, stage: 'VARIABLE', category: 'SURCHARGE',
        priority: 95, stacking: 'SUM', exclusionGroup: null, conditions: { p: 'ALWAYS' }, expression: { op: 'FIXED', amount: p.adhoc.amount },
        description: p.adhoc.name, reason: p.adhoc.reason, effect: 'INCREASE', isAdhoc: true, active: true, version: 1,
      } as Rule] : [];
      p.resolved = { overrides, adhocRules };
      r = await calculateTrip(String(p.trip.id), edits, { overrides, adhocRules });
      if (r.status !== 'ok') throw new Error(`${p.trip.route_number}: ${r.status}`);
    }
    if (r.calculation.blockingIssues.length) throw new Error(`${p.trip.route_number}: bloquea: ${r.calculation.blockingIssues.map((i) => i.message).join(' | ')}`);
    totalDe.set(String(p.trip.id), Number(r.calculation.result.totalLiquidado));
  }
  for (const p of planes) {
    const objetivo = p.margin ?? 0.35;
    const lineas = work.tripOrders.filter((o) => o.route_id === p.trip.id);
    const actual = lineas.reduce((s, o) => s + Number(o.value), 0);
    const cargaMeta = (totalDe.get(String(p.trip.id)) ?? 0) / (1 - objetivo);
    const factor = actual > 0 ? cargaMeta / actual : 1;
    for (const o of lineas) o.value = (Number(o.value) * factor).toFixed(2);
  }

  // ── Devoluciones (antes de sembrar la pasada 2): los escenarios que recorren los 3 módulos ──
  const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
  const RECEPTOR = 'RECEPTOR'; // → el usuario de Devoluciones de la mock (lo resuelve exportar.ts)
  work.tripReturns.push(
    // C: recibidas, con formulario → "Listo para liquidar" en Devoluciones y por liquidar en Liquidaciones.
    returnFor(T.olo[5], 'received', 1, { received_at: ago(12), received_by: RECEPTOR, received_quantity: 2, received_condition: 'Bueno' }),
    returnFor(T.olo[5], 'received', 2, { received_at: ago(12), received_by: RECEPTOR, received_quantity: 1, received_condition: 'Incompleto' }),
    // D: recibida dañada.
    returnFor(T.transosa[4], 'received', 1, { received_at: ago(9), received_by: RECEPTOR, received_quantity: 2, received_condition: 'Dañado' }),
    // E: viajes YA liquidados cuya liquidación declara devoluciones (misma factura que la liquidación).
    returnFor(T.olo[4], 'received', 1, { received_at: ago(14), received_by: RECEPTOR, received_quantity: 2, received_condition: 'Bueno', guideIdx: 0, invoice_number: 'FAC-88231' }),
    returnFor(T.transosa[3], 'received', 1, { received_at: ago(13), received_by: RECEPTOR, received_quantity: 2, received_condition: 'Bueno', guideIdx: 0, invoice_number: 'FAC-90017' }),
    // H: una rechazada (no bloquea ni cuenta como pendiente) y una recibida.
    returnFor(T.acuna[1], 'rejected', 1, { notes: 'DATO MOCK: Atención al Cliente rechazó la devolución (fuera de plazo).' }),
    returnFor(T.acuna[1], 'received', 2, { received_at: ago(11), received_by: RECEPTOR, received_quantity: 3, received_condition: 'Bueno' }),
  );
  // F: viajes EN RUTA con una devolución que el chofer registró desde la app (contracamión) y aún no se recibe.
  for (const t of work.trips.filter((x) => x.status === 'in_progress')) {
    work.tripReturns.push(returnFor(t, 'pending', 1, { guideIdx: 0, notes: 'DATO MOCK: registrada por el chofer en la parada.' }));
  }
  // A/B/G: viajes por liquidar que hoy NO se pueden liquidar por devoluciones sin recibir (la regla del módulo Devoluciones).
  const bloqueados = BLOQUEADOS;
  bloqueados.forEach((t, i) => {
    work.tripReturns.push(
      returnFor(t, 'pending', 1),
      // G: en el último viaje bloqueado la segunda es una RECOLECTA pedida por Atención al Cliente (parada "collection").
      returnFor(t, i === 0 ? 'pending' : 'approved', 2, i === bloqueados.length - 1 ? { return_type: 'recolecta' } : {}),
    );
    t.return_count = 2;
  });

  // ── Pasada 2 (escribe): se vuelve a sembrar con los pedidos ya ajustados ──
  setSeed(work);
  setDataSource(new MemoryDataSource());

  const toInput = (c: Extract<Awaited<ReturnType<typeof calculateTrip>>, { status: 'ok' }>['calculation'], p: Plan): SettlementInput => {
    const excluded = new Set<number>();
    const lineasConMonto = c.result.trace.filter((l) => Number(l.final) !== 0);
    if (p.excludeLines) lineasConMonto.slice(-p.excludeLines).forEach((l) => excluded.add(l.seq));
    const totals = computeSettlementTotals(c.result.trace, excluded, c.input.country, c.result);
    return {
      trip: c.trip, partyId: c.partyId, edits: p.edits ?? { customVars: {} }, status: 'Borrador', notes: p.notes ?? null,
      marginReason: p.marginReason ?? null, context: c.context,
      calc: excluded.size ? { ...c.result, totalLiquidado: totals.total, stageSubtotals: totals.stageSubtotals } : c.result,
      totalAmount: totals.total,
      rulesUsed: c.input.rules.filter((r) => c.result.trace.some((l) => l.ruleId === r.id)),
      excludedSeqs: [...excluded], returns: p.returns ?? [],
      overrides: p.resolved?.overrides ?? {}, adhocRules: p.resolved?.adhocRules ?? [],
      baseChange: c.result.base ? { ...c.result.base, changedBy: null, changedAt: '', ...(c.contract ? { contractExpiry: c.contract.contractExpiry } : {}) } : null,
      orders: c.orders.length > 0 ? snapshotOrders(c.orders) : null,
    };
  };

  async function liquidar(p: Plan) {
    const r = await calculateTrip(String(p.trip.id), p.edits ?? { customVars: {} }, p.resolved ? { overrides: p.resolved.overrides, adhocRules: p.resolved.adhocRules } : {});
    if (r.status !== 'ok') throw new Error(`${p.trip.route_number}: ${r.status}`);
    tick(rnd() * 3 * 3_600_000 + 600_000);
    const emitted = await emitSettlement(toInput(r.calculation, p));
    if (emitted.status !== 'saved') throw new Error(`${p.trip.route_number}: ${JSON.stringify(emitted)}`);
    return { settlement: emitted.settlement, calculation: r.calculation };
  }

  // Marcas de pedido (anulado / diferido) en dos viajes.
  for (const [trip, a, d] of [[T.transosa[0], 1, 3], [T.andina[0], 0, 2]] as const) {
    const pedidos = await listTripOrders(String(trip.id));
    await setOrderMark({ trip: { id: String(trip.id), countryId: String(trip.country_id) }, orderId: String(pedidos[a].orderId), mark: 'ANULADO', reason: 'Cliente rechazó el pedido: dirección incorrecta.' });
    await setOrderMark({ trip: { id: String(trip.id), countryId: String(trip.country_id) }, orderId: String(pedidos[d].orderId), mark: 'DIFERIDO', reason: 'Se entrega en el próximo viaje a la misma zona.' });
  }

  // 1) Sin proforma (flujo aún sin configurar): Borrador, anulada y re-liquidada.
  for (const { plan, final } of sinProforma) {
    tick(DAY * 0.4);
    const first = await liquidar(plan);
    if (final === 'Anulado') {
      tick(3_600_000 * 5);
      const u = await updateSettlementStatus(first.settlement.id, 'Anulado');
      if (u.error) throw new Error(u.error);
    }
    if (final === 'RELIQ') {
      tick(3_600_000 * 20);
      const nuevas = edit({ 'custom:horas_espera': 3 });
      const r = await calculateTrip(String(plan.trip.id), nuevas, { allowSettled: true });
      if (r.status !== 'ok') throw new Error(`reliq: ${r.status}`);
      const again = await reliquidateSettlement(first.settlement.id, toInput(r.calculation, { ...plan, edits: nuevas, notes: 'Se corrigieron las horas de espera.' }), 'Las horas de espera estaban mal declaradas (eran 3, no 0).');
      if (again.status !== 'saved') throw new Error(`reliq: ${JSON.stringify(again)}`);
    }
  }

  // 2) Flujo de aprobación por país (3 fases) y luego las que entran solas a proformas.
  for (const countryId of [CR_ID, VE_ID]) {
    const r = await saveFlowPhases(countryId, [
      { name: 'Revisión del liquidador', approverType: 'role', roleName: 'Liquidador', userId: null, approverLabel: 'Liquidador', active: true },
      { name: 'Aprobación de finanzas', approverType: 'role', roleName: 'Finanzas', userId: null, approverLabel: 'Finanzas', active: true },
      { name: 'Autorización de gerencia', approverType: 'role', roleName: 'Gerente General', userId: null, approverLabel: 'Gerente General', active: true },
    ]);
    if (r.error) throw new Error(r.error);
  }
  for (const plan of conProforma) { tick(DAY * 0.35); await liquidar(plan); }

  // 3) Decisiones de cada proforma, con el mismo efecto que el servidor (backend/tarifas/src/proformas_api.py).
  const SETTLEMENT_OF: Record<string, string> = { 'En Revisión': 'En Revisión', Aprobado: 'Aprobado', Borrador: 'Borrador', Anulado: 'Borrador' };
  const iso = () => new Date(clock).toISOString();
  async function setProformaStatus(proformaId: string, status: string, settlementStatus?: string) {
    await db().update('proforma', proformaId, { status, updated_at: iso() });
    const items = await db().find('proformaItem', { where: [{ column: 'proforma_id', op: 'eq', value: proformaId }] });
    for (const it of items.filter((i) => i.state !== 'excluded')) {
      await db().update('settlement', String(it.settlement_id), { status: settlementStatus ?? SETTLEMENT_OF[status] ?? status, updated_at: iso() });
    }
  }
  async function decidirFase(proformaId: string, posicion: number, estado: 'aprobada' | 'rechazada', comentario: string | null) {
    const fases = await db().find('proformaPhase', { where: [{ column: 'proforma_id', op: 'eq', value: proformaId }], orderBy: [{ column: 'position', direction: 'asc' }] });
    const fase = fases.find((f) => Number(f.position) === posicion)!;
    tick(3_600_000 * (2 + rnd() * 20));
    await db().update('proformaPhase', String(fase.id), {
      state: estado, decided_by: `mock.${String(fase.role_name).toLowerCase().replace(/\W+/g, '.')}@demo.local`, decided_at: iso(), comment: comentario,
    });
    const despues = (await db().find('proformaPhase', { where: [{ column: 'proforma_id', op: 'eq', value: proformaId }] })).map((f) => ({ state: f.state }));
    await setProformaStatus(proformaId, resolveStatus(despues as never));
    return fase;
  }

  const proformas = await db().find('proforma', { orderBy: [{ column: 'created_at', direction: 'asc' }] });
  const porTransportista = new Map<string, Row[]>();
  for (const p of proformas) {
    const code = String(work.carriers.find((c) => c.id === p.carrier_id)?.code);
    porTransportista.set(code, [...(porTransportista.get(code) ?? []), p]);
  }
  for (const [code, lista] of porTransportista) {
    const d = DECISIONES[code];
    if (!d) continue;
    const p = lista[0];
    const id = String(p.id);
    const fases = await db().find('proformaPhase', { where: [{ column: 'proforma_id', op: 'eq', value: id }], orderBy: [{ column: 'position', direction: 'asc' }] });
    const n = fases.length;
    if (d.tipo === 'aprobada') {
      for (let i = 1; i <= n; i++) await decidirFase(id, i, 'aprobada', i === n ? 'Autorizado para pago.' : null);
      if (d.pagada) {
        tick(DAY * 2);
        const items = await db().find('proformaItem', { where: [{ column: 'proforma_id', op: 'eq', value: id }] });
        for (const it of items) await updateSettlementStatus(String(it.settlement_id), 'Pagado');
        await db().update('proforma', id, { status: 'Pagado', updated_at: iso() });
      }
    } else if (d.tipo === 'enCurso') {
      for (let i = 1; i <= d.aprobadas; i++) await decidirFase(id, i, 'aprobada', null);
    } else if (d.tipo === 'rechazada' || d.tipo === 'reiniciada') {
      for (let i = 1; i < d.enFase; i++) await decidirFase(id, i, 'aprobada', null);
      const fase = await decidirFase(id, d.enFase, 'rechazada', d.motivo);
      const claimId = `prc_${sha(id).slice(0, 8)}`;
      tick(1_800_000);
      await db().insert('proformaClaim', {
        id: claimId, country_id: p.country_id, proforma_id: id, phase_id: fase.id, phase_name: fase.name, raised_by: `mock.${String(fase.role_name).toLowerCase().replace(/\W+/g, '.')}@demo.local`,
        raised_role: fase.role_name, reason: d.motivo, status: 'abierto', appeal_reason: null, appealed_by: null, appealed_at: null,
        created_at: iso(), resolved_by: null, resolved_at: null,
      });
      if (d.tipo === 'rechazada' && d.apelada) {
        tick(3_600_000 * 6);
        await db().update('proformaClaim', claimId, { status: 'apelado', appeal_reason: 'El comprobante está adjunto en el correo del 14/10; el reclamo no procede.', appealed_by: 'demo.liquidador@mock.local', appealed_at: iso() });
        await db().update('proformaPhase', String(fase.id), { state: 'pendiente', decided_by: null, decided_at: null, comment: null });
        await setProformaStatus(id, 'En Revisión');
      }
      if (d.tipo === 'reiniciada') {
        tick(3_600_000 * 4);
        await db().update('proformaClaim', claimId, { status: 'reiniciado', resolved_by: 'demo.liquidador@mock.local', resolved_at: iso() });
        const items = await db().find('proformaItem', { where: [{ column: 'proforma_id', op: 'eq', value: id }] });
        for (const it of items) {
          await db().update('settlement', String(it.settlement_id), { status: 'Anulado', void_kind: 'reclamo', void_reason: d.motivo, claim_id: claimId, updated_at: iso() });
          await db().update('proformaItem', String(it.id), { state: 'excluded', exclusion_reason: 'Reinicio por reclamo' });
        }
        await db().update('proforma', id, { status: 'Anulado', updated_at: iso() });
      }
    } else if (d.tipo === 'anulada') {
      tick(3_600_000 * 8);
      const items = await db().find('proformaItem', { where: [{ column: 'proforma_id', op: 'eq', value: id }] });
      for (const it of items) {
        await db().update('proformaItem', String(it.id), { state: 'excluded', exclusion_reason: 'Proforma anulada' });
        await db().update('settlement', String(it.settlement_id), { status: 'Borrador', updated_at: iso() });
      }
      await db().update('proforma', id, { status: 'Anulado', updated_at: iso() });
    }
  }

  (globalThis as { Date: unknown }).Date = RealDate;

  // ── Resumen y escritura ──
  const final = loadDatabase();
  mkdirSync(dirname(OUT), { recursive: true });
  const json = exportar(final, work, { uuidOf, now: NOW });
  writeFileSync(OUT, json.text);
  console.log(json.resumen);
  console.log('reloj final:', new RealDate(clock).toISOString());
}

main().catch((e) => { console.error(e); process.exit(1); });
