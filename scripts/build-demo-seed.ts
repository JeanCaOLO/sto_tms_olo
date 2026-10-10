// Genera `src/lib/tarifas/data/memory/seed.demo.json`: la semilla REALISTA del tarifador para el modo
// mock (VITE_MOCK_AUTH=true, sin Aurora). Costa Rica, Venezuela y Colombia completas, inspiradas en
// `docs/tarifador/demo-data/`. Solo se reutilizan de la semilla de tests los países y sus políticas.
//
//   npx jiti scripts/build-demo-seed.ts
//
// Las liquidaciones, marcas de pedido y bitácora NO se escriben a mano: se emiten con el motor real
// (`calculateTrip` + `emitSettlement`) sobre una copia en memoria, así el desglose guardado es
// exactamente el que produciría la app. Determinista (RNG con semilla), salvo los timestamps de las
// liquidaciones y la bitácora, que llevan la hora de ejecución.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setDataSource, type Row } from '../src/lib/tarifas/data';
import { MemoryDataSource } from '../src/lib/tarifas/data/memory/driver';
import { loadDatabase, setSeed, type TarifasDatabase } from '../src/lib/tarifas/data/memory/store';
import { MOCK_COUNTRY_IDS } from '../src/lib/tarifas/data/memory/mockIds';
import { ENTITY_NAMES, entityDef, primaryKeyOf } from '../src/lib/tarifas/data/schema';
import { calculateTrip } from '../src/lib/tarifas/tripSettlement';
import { listTripOrders, setOrderMark } from '../src/lib/tarifas/tripsDataSource';
import {
  emitSettlement, reliquidateSettlement, updateSettlementStatus, type SettlementInput,
} from '../src/lib/tarifas/settlementsDataSource';
import { setActorRole } from '../src/lib/tarifas/actor';
import { snapshotOrders } from '../src/lib/tarifas/tripOrders';
import { COMPONENTES_CR, FIJOS_CR, PARAMETROS_CR } from '../src/lib/tarifas/__tests__/fixtures/costaRicaFleet';
import type { TripEdits } from '../src/lib/tarifas/types';

const ROOT = resolve(import.meta.dirname ?? __dirname, '..');
const SEED_IN = resolve(ROOT, 'src/lib/tarifas/__tests__/fixtures/seed.json');
const SEED_OUT = resolve(ROOT, 'src/lib/tarifas/data/memory/seed.demo.json');

// ── RNG determinista ────────────────────────────────────────────────────────────────────────────
let state = 20261010;
function rnd(): number {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + rnd() * (b - a);
const intBetween = (a: number, b: number) => Math.floor(between(a, b + 1));
const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)];
const money = (n: number) => n.toFixed(2);
const round500 = (n: number) => Math.round(n / 500) * 500;

// ── Base: semilla de tests sin Costa Rica ───────────────────────────────────────────────────────
const base = JSON.parse(readFileSync(SEED_IN, 'utf8')) as TarifasDatabase;

// Costa Rica, Venezuela y Colombia se generan acá; de la semilla de tests solo se toman los países,
// su configuración y las políticas de margen.
const work: TarifasDatabase = {
  countries: base.countries,
  zones: [], carriers: [], drivers: [], vehicles: [], trips: [], dispatchGuides: [], tripReturns: [], tripOrders: [], tripOrderMarks: [],
  countrySettings: base.countrySettings.filter((s) => s.country_id !== 'CR'),
  zoneGroups: [], pricingRules: [], pricingTemplates: [], settlementParties: [], partyVariables: [], settlements: [],
  costStructures: [], costStructureRows: [], rateTables: [], rateTableRows: [],
  marginPolicies: base.marginPolicies,
  auditLog: [],
};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// COSTA RICA
// ════════════════════════════════════════════════════════════════════════════════════════════════
const CR = 'CR';

// ── Zonas: el catálogo de rutas del WMS (código de ruta) ───────────────────────────────────────
// [código, nombre, km ida y vuelta desde el CEDI de Heredia, tarifa base NPR en colones]
const ZONAS_CR: [string, string, number, number][] = [
  ['01', 'Casco Central', 26, 38000],
  ['02', 'Desamparados San José Sur-Oeste', 42, 42000],
  ['03', 'Guadalupe San José Norte-Oeste', 30, 40000],
  ['04', 'Alajuela', 52, 52000],
  ['05', 'Heredia', 16, 36000],
  ['06', 'Cartago', 92, 68000],
  ['07', 'Carretera', 120, 75000],
  ['08', 'San Carlos', 170, 98000],
  ['09', 'Limón', 300, 165000],
  ['10', 'Guanacaste Altura', 380, 205000],
  ['11', 'Guanacaste Bajura', 460, 235000],
  ['12', 'Zona Sur', 480, 260000],
  ['13', 'Puntarenas', 220, 120000],
  ['15', 'Turrialba', 150, 95000],
  ['16', 'Corralillo', 100, 70000],
];
const zoneId = (code: string) => `Z_CR_${code}`;
for (const [code, name] of ZONAS_CR) {
  work.zones.push({ id: zoneId(code), country_id: CR, code, name, status: 'active' });
}
work.zones.push({ id: zoneId('SIN_ZONA'), country_id: CR, code: 'SIN_ZONA', name: 'Sin zona asignada', status: 'active' });

const GRUPOS: [string, string, string[]][] = [
  ['GAM_CENTRO', 'GAM — Centro', ['01', '02', '03', '05']],
  ['GAM_PERIFERIA', 'GAM — Periferia', ['04', '06', '15', '16']],
  ['CARRETERA', 'Carretera', ['07']],
  ['ZONA_NORTE', 'Zona Norte', ['08']],
  ['CARIBE', 'Caribe', ['09']],
  ['GUANACASTE', 'Guanacaste', ['10', '11']],
  ['PACIFICO', 'Pacífico', ['12', '13']],
  ['SIN_GRUPO', 'Sin grupo', ['SIN_ZONA']],
];
for (const [code, name, codes] of GRUPOS) {
  work.zoneGroups.push({ id: `ZG_CR_${code}`, country_id: CR, code, name, zone_codes: codes, status: 'active' });
}

work.countrySettings.push({
  id: 'CSET_CR', country_id: CR, rounding_decimals: 0, rounding_mode: 'HALF_UP', overnight_threshold_hours: 24,
});

// ── Transportistas, vehículos y conductores ───────────────────────────────────────────────────
interface CarrierSpec {
  key: string; name: string; taxId: string; own?: boolean; status?: string; profile?: boolean;
  zones: string[]; vehicles: [string, string, number, number][]; drivers: [string, string, string][];
}
const CARRIERS: CarrierSpec[] = [
  {
    key: 'OLO', name: 'OLO (Flota Propia)', taxId: '3-101-084451', own: true, zones: ['01', '02', '03', '05', '04', '16'],
    vehicles: [
      ['CL300011', 'T1', 2500, 12], ['CL188786', 'T3', 4500, 20], ['CL186068', 'T3', 4500, 20], ['C162414', 'T5', 7000, 30],
    ],
    drivers: [
      ['Robier Alonso Colomer Olivas', '701180253', 'B2'], ['Marvin Andrés Quesada Rojas', '109430871', 'B2'],
      ['Kevin Josué Brenes Mora', '116720345', 'B3'],
    ],
  },
  {
    key: 'TRANSOSA', name: 'Transosa de Alajuela S.A.', taxId: '3-101-512893', zones: ['04', '08', '16', '07', '13'],
    vehicles: [['CL190087', 'NPR', 5000, 22], ['CL244242', 'NKR', 3500, 16], ['C132239', 'FRR', 8000, 32]],
    drivers: [
      ['Luis Diego Solórzano Gómez', '204300699', 'B2'], ['Gerardo Alonso Durán Alfaro', '205400666', 'B2'],
      ['Víctor Manuel Vega Chaves', '601730907', 'B3'],
    ],
  },
  {
    key: 'ACUNA', name: 'Inversiones Acuña y Salazar del Caribe S.R.L.', taxId: '3-102-731206', zones: ['09', '15'],
    vehicles: [['CL345361', 'NPR', 5000, 22], ['C162179', 'FRR', 8000, 32]],
    drivers: [['Randal Acuña Jiménez', '205680638', 'B2'], ['Yeiner Enrique González Fernández', '702060910', 'B3']],
  },
  {
    key: 'URENA', name: 'Edison Miguel Ureña Ureña', taxId: '1-1409-0799', zones: ['05', '03', '01', '02'],
    vehicles: [['CL272155', 'NKR', 3500, 16]],
    drivers: [['Edison Miguel Ureña Ureña', '114090799', 'B2'], ['Francisco Arguedas Morales', '111790453', 'B2']],
  },
  {
    key: 'HERNANDEZ', name: 'Pedro Hernández Castro', taxId: '1-0987-0415', zones: ['06', '15'],
    vehicles: [['CL228091', 'NPR', 5000, 22]],
    drivers: [['David José Vargas Borbón', '116350274', 'B2']],
  },
  {
    key: 'TRANSMAJORI', name: 'Transmajori', taxId: '3-101-648120', zones: ['10', '11', '12', '13'],
    vehicles: [['C201133', 'FRR', 8000, 32], ['CL301144', 'NPR', 5000, 22]],
    drivers: [['Gerardo Stanley Sánchez', '206440829', 'B3'], ['Jonathan Jesús Álvarez Torres', '111000137', 'B2']],
  },
  {
    // Sin perfil de cálculo: se liquida solo con las reglas del país.
    key: 'ULLOA', name: 'Javier Martín Ulloa Serrano', taxId: '1-0638-0244', profile: false, zones: ['01', '02', '05'],
    vehicles: [['CL120245', 'NKR', 3500, 16]], drivers: [['Javier Martín Ulloa Serrano', '106380244', 'B2']],
  },
  {
    // Inactivo en el catálogo: no tiene viajes nuevos, solo historia.
    key: 'JIMENEZ', name: 'María Jiménez Ramírez', taxId: '1-0771-0562', status: 'inactive', zones: ['01'],
    vehicles: [['CL987650', 'NKR', 3500, 16]], drivers: [['Federico José Ulloa Umaña', '116080706', 'B2']],
  },
];
const carrierId = (key: string) => `CAR_CR_${key}`;
const vehicleIdOf = (key: string, plate: string) => `VEH_CR_${key}_${plate}`;
const driverIdOf = (key: string, doc: string) => `DRV_CR_${key}_${doc}`;

for (const c of CARRIERS) {
  const status = c.status ?? 'active';
  work.carriers.push({
    id: carrierId(c.key), country_id: CR, code: c.key, name: c.name, tax_id: c.taxId, is_flota_propia: !!c.own, status,
  });
  if (c.profile !== false) {
    work.settlementParties.push({ id: `PARTY_CR_${c.key}`, carrier_id: carrierId(c.key), status: 'active', notes: null });
  }
  for (const [plate, type, kg, m3] of c.vehicles) {
    work.vehicles.push({
      id: vehicleIdOf(c.key, plate), carrier_id: carrierId(c.key), plate, vehicle_type: type,
      capacity_weight: String(kg), capacity_volume: String(m3), status,
    });
  }
  for (const [fullName, document, license] of c.drivers) {
    work.drivers.push({
      id: driverIdOf(c.key, document), carrier_id: carrierId(c.key), code: `DRV-${document.slice(-4)}`, full_name: fullName,
      document, phone: `+506 8${intBetween(300, 999)}-${intBetween(1000, 9999)}`, license_number: license, status,
    });
  }
}

// ── Tarifarios ─────────────────────────────────────────────────────────────────────────────────
let rtrSeq = 0;
function rateTable(id: string, code: string, name: string, keyColumns: string[], partyKey: string | null, valueColumns: string[] | null = null) {
  work.rateTables.push({
    id, country_id: CR, party_id: partyKey ? `PARTY_CR_${partyKey}` : null, code, name, key_columns: keyColumns,
    value_columns: valueColumns, active: true,
  });
}
function rateRow(tableId: string, order: number, key: string[], amount: number, extra: Record<string, string> | null = null) {
  rtrSeq += 1;
  work.rateTableRows.push({
    id: `RTR_CR_${rtrSeq}`, table_id: tableId, key, amount: money(amount), extra_values: extra, row_order: order, active: true,
  });
}

// 1) ZONAS: fletes del país por zona destino y tipo de camión (formato del tarifario EPA).
rateTable('RT_CR_ZONAS', 'ZONAS', 'Fletes por zona y tipo de camión', ['destZone', 'truckTypeId'], null);
{
  let order = 0;
  for (const [code, , , npr] of ZONAS_CR) {
    rateRow('RT_CR_ZONAS', ++order, [code, 'NKR'], round500(npr * 0.9));
    rateRow('RT_CR_ZONAS', ++order, [code, 'NPR'], npr);
    rateRow('RT_CR_ZONAS', ++order, [code, 'FRR'], round500(npr * 1.3));
    rateRow('RT_CR_ZONAS', ++order, [code, '*'], npr); // cualquier otro camión (flota propia, etc.)
  }
}

// 2) PEAJES_VIATICOS: dos columnas de valor por zona (peaje de ida y vuelta, viático por noche).
rateTable('RT_CR_PEAJES', 'PEAJES_VIATICOS', 'Peajes y viáticos por zona', ['destZone'], null, ['peaje', 'viatico']);
{
  const data: [string, number, number][] = [
    ['04', 1800, 0], ['06', 1500, 0], ['07', 4200, 0], ['08', 3600, 12000], ['09', 5200, 22000], ['10', 6800, 28000],
    ['11', 7600, 30000], ['12', 8400, 32000], ['13', 3900, 16000], ['15', 1500, 14000], ['16', 1800, 0],
  ];
  data.forEach(([code, peaje, viatico], i) => rateRow('RT_CR_PEAJES', i + 1, [code], peaje, { peaje: money(peaje), viatico: money(viatico) }));
}

// 3) ESCALA_KM: recargo por distancia, indexado por RANGO de km.
rateTable('RT_CR_ESCALA_KM', 'ESCALA_KM', 'Recargo por distancia (km)', ['km'], null);
rateRow('RT_CR_ESCALA_KM', 1, ['0..100'], 0);
rateRow('RT_CR_ESCALA_KM', 2, ['101..250'], 9000);
rateRow('RT_CR_ESCALA_KM', 3, ['251..400'], 21000);
rateRow('RT_CR_ESCALA_KM', 4, ['401..'], 34000);

// 4) Tarifa pactada de un transportista (reemplaza a ZONAS solo para él).
rateTable('RT_CR_TRANSMAJORI', 'TARIFA_PACTADA', 'Tarifa pactada Transmajori', ['destZone', 'truckTypeId'], 'TRANSMAJORI');
{
  let order = 0;
  for (const code of ['10', '11', '12', '13']) {
    const npr = ZONAS_CR.find((z) => z[0] === code)![3];
    rateRow('RT_CR_TRANSMAJORI', ++order, [code, 'NPR'], round500(npr * 1.08));
    rateRow('RT_CR_TRANSMAJORI', ++order, [code, 'FRR'], round500(npr * 1.42));
  }
}

// ── Variables personalizadas por perfil ───────────────────────────────────────────────────────
let pvarSeq = 0;
function partyVar(partyKey: string, key: string, label: string, kind: 'NUMBER' | 'TEXT', origin: 'PER_TRIP' | 'CONSTANT', def: string, unit: string | null) {
  pvarSeq += 1;
  work.partyVariables.push({
    id: `PVAR_CR_${pvarSeq}`, party_id: `PARTY_CR_${partyKey}`, key, label, kind, origin, default_value: def, unit, active: true,
  });
}
for (const c of CARRIERS.filter((x) => x.profile !== false)) {
  partyVar(c.key, 'custom:monto_peajes', 'Peajes adicionales', 'NUMBER', 'PER_TRIP', '0', 'CRC');
  partyVar(c.key, 'custom:minutos_atraso', 'Minutos de atraso', 'NUMBER', 'PER_TRIP', '0', 'min');
  partyVar(c.key, 'custom:incidencias', 'Incidencias', 'NUMBER', 'PER_TRIP', '0', null);
}
partyVar('OLO', 'custom:con_ayudante', 'Viaja con ayudante (1 = sí)', 'NUMBER', 'PER_TRIP', '0', null);
partyVar('TRANSOSA', 'custom:recolectas', 'Recolectas en ruta', 'NUMBER', 'PER_TRIP', '0', 'recolectas');
partyVar('TRANSOSA', 'custom:peones', 'Peones adicionales', 'NUMBER', 'PER_TRIP', '0', null);
partyVar('URENA', 'custom:horas_espera', 'Horas de espera', 'NUMBER', 'PER_TRIP', '0', 'h');
partyVar('ACUNA', 'custom:zona_riesgo', 'Zona de riesgo', 'TEXT', 'PER_TRIP', '', null);
partyVar('ACUNA', 'custom:bono_caribe', 'Bono Caribe (constante)', 'NUMBER', 'CONSTANT', '15000', 'CRC');
partyVar('TRANSMAJORI', 'custom:refrigeracion_horas', 'Horas de refrigeración', 'NUMBER', 'PER_TRIP', '0', 'h');

// ── Reglas ─────────────────────────────────────────────────────────────────────────────────────
interface RuleSpec {
  code: string; name: string; stage: string; priority: number; stacking?: string; party?: string; exclusionGroup?: string;
  conditions: unknown; expression: unknown; description?: string; reason?: string; effect?: 'INCREASE' | 'DECREASE';
  from?: string | null; to?: string | null; active?: boolean; version?: number;
}
let ruleSeq = 0;
function rule(spec: RuleSpec) {
  ruleSeq += 1;
  work.pricingRules.push({
    id: `RULE_CR_${String(ruleSeq).padStart(2, '0')}`, country_id: CR, scope: spec.party ? 'PARTY' : 'COUNTRY',
    party_id: spec.party ? `PARTY_CR_${spec.party}` : null, code: spec.code, name: spec.name, stage: spec.stage,
    priority: spec.priority, stacking: spec.stacking ?? 'SUM', exclusion_group: spec.exclusionGroup ?? null,
    conditions: spec.conditions, expression: spec.expression, description: spec.description ?? null, reason: spec.reason ?? null,
    effect: spec.effect ?? 'INCREASE', builder: null, condition_builder: null, is_adhoc: false, active: spec.active ?? true,
    effective_from: spec.from ?? null, effective_to: spec.to ?? null, version: spec.version ?? 1,
  });
}
const ALWAYS = { p: 'ALWAYS' };
const gt = (left: string, right: number) => ({ p: 'GT', left, right });
const eq = (left: string, right: string | number) => ({ p: 'EQ', left, right });

// País
rule({
  code: 'R_ZONAS', name: 'Flete por zona y camión (tarifario ZONAS, respaldo por km)', stage: 'BASE', priority: 10, stacking: 'EXCLUSIVE',
  conditions: ALWAYS, expression: { op: 'LOOKUP_TABLE', table: 'ZONAS', fallback: { op: 'PER_KM', rate: '520' } },
  description: 'El flete sale del tarifario ZONAS (zona destino + tipo de camión). Sin fila, se cobran 520 CRC por km.',
});
rule({
  code: 'R_PARADAS', name: 'Entregas atendidas', stage: 'VARIABLE', priority: 20, conditions: gt('clientCount', 0),
  expression: { op: 'PER_UNIT', unit: 'clientCount', rate: '1800' }, description: '1.800 CRC por cada parada completada.',
});
rule({
  code: 'R_PESO_BLOQUE', name: 'Exceso de peso (cada 500 kg sobre 3 t)', stage: 'VARIABLE', priority: 30, conditions: gt('weightKg', 3000),
  expression: { op: 'PER_BLOCK', unit: 'weightKg', blockSize: 500, amount: '4500' },
  description: 'Cada bloque completo de 500 kg transportado suma 4.500 CRC, desde que el viaje supera 3.000 kg.',
});
rule({
  code: 'R_DISTANCIA', name: 'Recargo por distancia (tarifario ESCALA_KM)', stage: 'VARIABLE', priority: 35, conditions: gt('km', 0),
  expression: { op: 'LOOKUP_TABLE', table: 'ESCALA_KM', fallback: { op: 'FIXED', amount: '0' } },
});
rule({
  code: 'R_PEAJES_TARIFA', name: 'Peajes de la ruta (tarifario PEAJES_VIATICOS)', stage: 'SURCHARGE', priority: 40, conditions: ALWAYS,
  expression: { op: 'LOOKUP_TABLE', table: 'PEAJES_VIATICOS', column: 'peaje', fallback: { op: 'FIXED', amount: '0' } },
});
rule({
  code: 'R_VIATICO', name: 'Viático por pernocta (tarifario PEAJES_VIATICOS)', stage: 'SURCHARGE', priority: 41, conditions: gt('overnightNights', 0),
  expression: { op: 'LOOKUP_TABLE', table: 'PEAJES_VIATICOS', column: 'viatico', fallback: { op: 'FIXED', amount: '0' } },
});
rule({
  code: 'R_PERNOCTA', name: 'Pernocta', stage: 'SURCHARGE', priority: 42, conditions: gt('overnightNights', 0),
  expression: { op: 'PER_UNIT', unit: 'overnightNights', rate: '28000' }, description: '28.000 CRC por cada noche fuera de base.',
});
rule({
  code: 'R_PEAJES_EXTRA', name: 'Peajes adicionales reportados', stage: 'SURCHARGE', priority: 43, conditions: gt('custom:monto_peajes', 0),
  expression: { op: 'PER_UNIT', unit: 'custom:monto_peajes', rate: '1' }, description: 'Se reconoce al costo lo que el transportista reporta.',
});
rule({
  code: 'R_INCIDENTE_FIJO', name: 'Recargo por incidente (fijo)', stage: 'SURCHARGE', priority: 44, stacking: 'MAX', exclusionGroup: 'INCIDENTES',
  conditions: gt('custom:incidencias', 0), expression: { op: 'FIXED', amount: '9500' },
});
rule({
  code: 'R_INCIDENTE_UNIT', name: 'Recargo por incidente (por incidente)', stage: 'SURCHARGE', priority: 45, stacking: 'MAX', exclusionGroup: 'INCIDENTES',
  conditions: gt('custom:incidencias', 1), expression: { op: 'PER_UNIT', unit: 'custom:incidencias', rate: '6000' },
});
rule({
  code: 'R_DOMINGO', name: 'Recargo por domingo', stage: 'MODIFIER', priority: 50, conditions: eq('weekday', 0),
  expression: { op: 'PERCENT', pct: '0.25', base: { of: 'RUNNING_SUBTOTAL' } }, description: '25 % sobre lo acumulado cuando el viaje sale en domingo.',
  reason: 'Código de Trabajo: jornada en día de descanso.',
});
rule({
  code: 'R_ATRASO', name: 'Penalización por atraso', stage: 'ADJUSTMENT', priority: 60, conditions: gt('custom:minutos_atraso', 0), effect: 'DECREASE',
  expression: { op: 'TIERED', unit: 'custom:minutos_atraso', tiers: [{ upTo: 15, amount: '0' }, { upTo: 60, amount: '-8000' }, { upTo: null, amount: '-20000' }] },
});
rule({
  code: 'R_VOLUMEN', name: 'Descuento por volumen (más de 12 paradas)', stage: 'ADJUSTMENT', priority: 61, conditions: gt('clientCount', 12), effect: 'DECREASE',
  expression: { op: 'PERCENT', pct: '-0.03', base: { of: 'RUNNING_SUBTOTAL' } },
});
// Ajuste diésel con vigencia: la versión vieja venció el 30-sep, la nueva rige desde el 1-oct.
rule({
  code: 'R_DIESEL', name: 'Ajuste por precio del diésel (v1, setiembre)', stage: 'MODIFIER', priority: 51, active: true, from: '2026-08-01', to: '2026-09-30',
  conditions: eq('fleetType', 'OUTSOURCED'), expression: { op: 'PERCENT', pct: '0.02', base: { of: 'STAGE_SUBTOTAL', stage: 'BASE' } },
  reason: 'Diésel a ₡635/L (acuerdo con transportistas, agosto 2026).',
});
rule({
  code: 'R_DIESEL', name: 'Ajuste por precio del diésel (v2, octubre)', stage: 'MODIFIER', priority: 51, from: '2026-10-01', to: null, version: 2,
  conditions: eq('fleetType', 'OUTSOURCED'), expression: { op: 'PERCENT', pct: '0.035', base: { of: 'STAGE_SUBTOTAL', stage: 'BASE' } },
  reason: 'Diésel sube a ₡668/L en octubre 2026; se traslada 3,5 % del flete base a terceros.',
});
rule({
  code: 'R_TEMPORADA_ALTA', name: 'Temporada alta navideña (inactiva hasta noviembre)', stage: 'MODIFIER', priority: 52, active: false, from: '2026-11-15', to: '2027-01-10',
  conditions: ALWAYS, expression: { op: 'PERCENT', pct: '0.1', base: { of: 'RUNNING_SUBTOTAL' } },
});

// Compañía
rule({
  party: 'TRANSOSA', code: 'R_RECOLECTAS', name: 'Recolectas en ruta (Transosa)', stage: 'VARIABLE', priority: 62, conditions: gt('custom:recolectas', 0),
  expression: { op: 'PER_UNIT', unit: 'custom:recolectas', rate: '7500' },
});
rule({
  party: 'TRANSOSA', code: 'R_PEONES', name: 'Peón adicional (Transosa)', stage: 'VARIABLE', priority: 63, conditions: gt('custom:peones', 0),
  expression: { op: 'PER_UNIT', unit: 'custom:peones', rate: '18000' },
});
rule({
  party: 'URENA', code: 'R_ESPERA', name: 'Horas de espera en cliente (Ureña)', stage: 'VARIABLE', priority: 62, conditions: gt('custom:horas_espera', 0),
  expression: { op: 'CLAMP', value: { op: 'PER_UNIT', unit: 'custom:horas_espera', rate: '3500' }, max: '21000' },
  description: '3.500 CRC por hora de espera, con tope de 21.000 CRC por viaje.',
});
rule({
  party: 'ACUNA', code: 'R_ZONA_RIESGO', name: 'Recargo por zona de riesgo (Acuña y Salazar)', stage: 'SURCHARGE', priority: 46, conditions: eq('custom:zona_riesgo', 'ALTA'),
  expression: { op: 'FIXED', amount: '25000' },
});
rule({
  party: 'ACUNA', code: 'R_BONO_CARIBE', name: 'Bono Caribe (constante de la compañía)', stage: 'SURCHARGE', priority: 47, conditions: eq('destZoneGroup', 'CARIBE'),
  expression: { op: 'PER_UNIT', unit: 'custom:bono_caribe', rate: '1' },
});
rule({
  party: 'TRANSMAJORI', code: 'R_ZONAS', name: 'Flete pactado (Transmajori) — reemplaza al de país', stage: 'BASE', priority: 10, stacking: 'EXCLUSIVE', conditions: ALWAYS,
  expression: {
    op: 'LOOKUP_TABLE', table: 'TARIFA_PACTADA',
    fallback: { op: 'LOOKUP_TABLE', table: 'ZONAS', fallback: { op: 'PER_KM', rate: '540' } },
  },
  reason: 'Contrato 2026: tarifa pactada por zona; si no hay fila, vale la del país.',
});
rule({
  party: 'TRANSMAJORI', code: 'R_REFRIGERACION', name: 'Refrigeración en tránsito (Transmajori)', stage: 'VARIABLE', priority: 64, conditions: gt('custom:refrigeracion_horas', 0),
  expression: { op: 'CLAMP', value: { op: 'PER_UNIT', unit: 'custom:refrigeracion_horas', rate: '4200' }, max: '25200' },
});
rule({
  party: 'HERNANDEZ', code: 'R_PROMO_ARRANQUE', name: 'Descuento de arranque de contrato (Hernández)', stage: 'ADJUSTMENT', priority: 65, effect: 'DECREASE',
  conditions: ALWAYS, expression: { op: 'FIXED', amount: '-5000' }, from: '2026-08-01', to: '2026-09-15',
  reason: 'Primeros 45 días de contrato con tarifa reducida.',
});
// Flota propia: la estructura de costos manda; las reglas son AJUSTES.
rule({
  party: 'OLO', code: 'R_VALOR_REPARTO', name: 'Cargo interno por entrega (flota propia)', stage: 'ADJUSTMENT', priority: 70, conditions: gt('clientCount', 0),
  expression: { op: 'PER_UNIT', unit: 'clientCount', rate: '1200' }, description: 'Cargo interno para cubrir la operación de reparto: 1.200 CRC por entrega.',
});

// ── Plantillas del Probador ───────────────────────────────────────────────────────────────────
const tplTrip = (partyId: string | null, dest: string, km: number, clients: number, kg: number, truck: string, fleet: 'OWN' | 'OUTSOURCED', hours: number, vars: Record<string, number | string> = {}) => ({
  partyId, quotedAt: '2026-10-05T12:00:00.000Z', originLocationId: '', destLocationId: zoneId(dest), km, clientCount: clients,
  weightKg: kg, truckTypeId: truck, serviceType: 'STANDARD', fleetType: fleet, carrierId: partyId ? partyId.replace('PARTY_', 'CAR_') : null,
  customerId: null, durationHours: hours, customVars: vars,
});
[
  ['Reparto GAM — Heredia, camión NKR, 9 paradas', tplTrip('PARTY_CR_URENA', '05', 16, 9, 1800, 'NKR', 'OUTSOURCED', 5)],
  ['Alajuela con recolectas (Transosa, NPR)', tplTrip('PARTY_CR_TRANSOSA', '04', 52, 11, 3300, 'NPR', 'OUTSOURCED', 6.5, { 'custom:recolectas': 2 })],
  ['Limón con pernocta (Acuña y Salazar, FRR)', tplTrip('PARTY_CR_ACUNA', '09', 300, 14, 6200, 'FRR', 'OUTSOURCED', 31, { 'custom:zona_riesgo': 'ALTA' })],
  ['Guanacaste con refrigeración (Transmajori, FRR)', tplTrip('PARTY_CR_TRANSMAJORI', '10', 380, 10, 5400, 'FRR', 'OUTSOURCED', 32, { 'custom:refrigeracion_horas': 5 })],
  ['Flota propia — Casco Central, T3 con ayudante', tplTrip('PARTY_CR_OLO', '01', 26, 12, 2900, 'T3', 'OWN', 6, { 'custom:con_ayudante': 1 })],
].forEach(([name, trip], i) => work.pricingTemplates.push({ id: `TPL_CR_${i + 1}`, country_id: CR, name, trip }));

// ── Estructura de costos de la flota propia (planilla real de costeo) ─────────────────────────
const STR_OWN = 'CSTR_CR_OLO';
work.costStructures.push({
  id: STR_OWN, party_id: 'PARTY_CR_OLO', country_id: CR, name: 'Estructura de costos — Flota Propia OLO (planilla 2026)',
  operating_days_per_month: PARAMETROS_CR.diasOperativos,
  params: { kmPerYear: PARAMETROS_CR.kmAnual, fuelPrice: String(PARAMETROS_CR.precioDiesel), fuelEfficiency: { ...PARAMETROS_CR.rendimientoKmPorLitro } },
  effective_from: '2026-01-01T00:00:00.000Z', active: true,
  notes: 'Cargada desde Estructura_Costos_Transporte.xlsx: conductor, ayudante, depreciación por tipo de camión y 44 componentes de mantenimiento.',
});
let crowSeq = 0;
function costRow(structure: string, v: Partial<Row> & { code: string; label: string; driver: string; amount: string }, order: number) {
  crowSeq += 1;
  work.costStructureRows.push({
    id: `CROW_CR_${crowSeq}`, structure_id: structure, sign: 'ADD', applies_when: null, unit: null, active: true, cost_group: null,
    frequency: null, frequency_qty: null, unit_qty: null, cost_per_km: null, truck_type: null, row_order: order, ...v,
  });
}
{
  let order = 0;
  costRow(STR_OWN, {
    code: 'CONDUCTOR', label: 'Costos del conductor (salario, aguinaldo, seguro, marchamo, DEKRA, uniforme)', driver: 'PER_MONTH_PRORATED',
    amount: String(FIJOS_CR.conductor), unit: 'CRC/mes', cost_group: 'conductor',
  }, ++order);
  costRow(STR_OWN, {
    code: 'AYUDANTE', label: 'Costos del ayudante (salario, aguinaldo)', driver: 'PER_MONTH_PRORATED', amount: String(FIJOS_CR.ayudante), unit: 'CRC/mes',
    cost_group: 'ayudante', applies_when: { p: 'GT', left: 'custom:con_ayudante', right: 0 },
  }, ++order);
  for (const tipo of ['T1', 'T3', 'T5'] as const) {
    costRow(STR_OWN, {
      code: `DEPRECIACION_${tipo}`, label: `Depreciación ${tipo}`, driver: 'PER_MONTH_PRORATED', amount: String(Math.round(FIJOS_CR.depreciacion[tipo] * 100) / 100),
      unit: 'CRC/mes', cost_group: 'depreciacion', truck_type: tipo,
    }, ++order);
  }
  for (const [nombre, frecuencia, unidades, porTipo] of COMPONENTES_CR) {
    for (const tipo of ['T1', 'T3', 'T5'] as const) {
      const [cada, costo] = porTipo[tipo];
      costRow(STR_OWN, {
        code: `${nombre.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')}_${tipo}`, label: nombre, driver: 'PER_KM', amount: String(costo),
        unit: unidades, cost_group: 'mantenimiento', frequency: frecuencia, frequency_qty: String(cada), truck_type: tipo,
      }, ++order);
    }
  }
}
// Estructura por defecto del país (la usa cualquier flota propia sin estructura propia) e historial.
work.costStructures.push({
  id: 'CSTR_CR_DEFAULT', party_id: null, country_id: CR, name: 'Costos de flota propia — por defecto (CR)', operating_days_per_month: 30,
  params: { kmPerYear: 36000, fuelPrice: '635', fuelEfficiency: { T1: 8.5, T3: 6, T5: 4.2 } }, effective_from: '2026-01-01T00:00:00.000Z', active: true,
  notes: 'Respaldo del país: costo mensual del conductor + costo por km simplificado.',
});
costRow('CSTR_CR_DEFAULT', { code: 'CONDUCTOR', label: 'Conductor', driver: 'PER_MONTH_PRORATED', amount: '946770.49', unit: 'CRC/mes', cost_group: 'conductor' }, 1);
costRow('CSTR_CR_DEFAULT', { code: 'MANTENIMIENTO_KM', label: 'Mantenimiento por km (promedio)', driver: 'PER_KM', amount: '48.81', unit: 'CRC/km', cost_group: 'mantenimiento' }, 2);
costRow('CSTR_CR_DEFAULT', { code: 'GASTOS_VIAJE', label: 'Gastos administrativos por viaje', driver: 'FIXED', amount: '1500', unit: 'CRC/viaje', cost_group: 'otros' }, 3);
work.costStructures.push({
  id: 'CSTR_CR_OLO_2025', party_id: 'PARTY_CR_OLO', country_id: CR, name: 'Estructura de costos — Flota Propia OLO (planilla 2025, reemplazada)', operating_days_per_month: 30,
  params: { kmPerYear: 36000, fuelPrice: '602', fuelEfficiency: { T1: 8.5, T3: 6, T5: 4.2 } }, effective_from: '2025-01-01T00:00:00.000Z', active: false,
  notes: 'Planilla anterior; se conserva como historial.',
});
costRow('CSTR_CR_OLO_2025', { code: 'CONDUCTOR', label: 'Conductor', driver: 'PER_MONTH_PRORATED', amount: '905200', unit: 'CRC/mes', cost_group: 'conductor' }, 1);

// ── Viajes, guías, pedidos y devoluciones ─────────────────────────────────────────────────────
const CUSTOMERS = [
  { id: 'CUST_COFERSA', code: 'COFERSA', name: 'Cofersa', weight: 0.45, stores: ['Cofersa Heredia Centro', 'Cofersa Alajuela', 'Cofersa Cartago', 'Cofersa Escazú', 'Cofersa Pavas', 'Cofersa San Carlos', 'Cofersa Limón', 'Cofersa Liberia', 'Cofersa Puntarenas', 'Cofersa Desamparados'] },
  { id: 'CUST_EPA', code: 'EPA', name: 'EPA', weight: 0.4, stores: ['EPA La Uruca', 'EPA Heredia', 'EPA Alajuela', 'EPA Cartago', 'EPA Guadalupe', 'EPA Santa Ana', 'EPA Ciudad Quesada', 'EPA Limón', 'EPA Nicoya', 'EPA San Isidro'] },
  { id: 'CUST_COMERCIALIZADORA', code: 'COMERCIALIZADORA', name: 'Comercializadora OLO', weight: 0.15, stores: ['Ferretería El Tornillo', 'Materiales Don Beto', 'Distribuidora Hermanos Mora', 'Ferretería Central', 'Depósito La Unión', 'Construplaza'] },
];
const pickCustomer = () => {
  let r = rnd();
  for (const c of CUSTOMERS) {
    if (r < c.weight) return c;
    r -= c.weight;
  }
  return CUSTOMERS[0];
};
const PRODUCTOS: [string, string][] = [
  ['CEM-001', 'Cemento gris 50 kg'], ['VAR-038', 'Varilla corrugada 3/8"'], ['PIN-204', 'Pintura látex blanco 4 gal'], ['TUB-112', 'Tubo PVC 1 1/2" x 6 m'],
  ['LAM-026', 'Lámina zinc calibre 26'], ['CER-045', 'Cerámica 45x45 (caja)'], ['HER-310', 'Taladro percutor 1/2"'], ['ELE-120', 'Cable THHN #12 (rollo)'],
];

interface TripSpec {
  date: string; zone: string; carrier: string; plate: string; guides: number;
  kind?: 'ok' | 'incomplete' | 'planned' | 'progress' | 'cancelled' | 'nocarrier' | 'returns' | 'overnight' | 'nozone' | 'zonenull';
  returns?: number; delivered?: number; hours?: number; tag?: string;
}
// Cada viaje: fecha, zona (ruta WMS), transportista, placa, cantidad de guías y variante.
const SPECS: TripSpec[] = [
  // Semana del 24 de agosto — flota propia y terceros del GAM (varios se liquidan abajo)
  { date: '2026-08-24', zone: '01', carrier: 'OLO', plate: 'CL188786', guides: 11, tag: 'L-OLO-1' },
  { date: '2026-08-24', zone: '05', carrier: 'URENA', plate: 'CL272155', guides: 8, tag: 'L-URE-1' },
  { date: '2026-08-25', zone: '04', carrier: 'TRANSOSA', plate: 'CL190087', guides: 12, tag: 'L-TRA-1' },
  { date: '2026-08-26', zone: '06', carrier: 'HERNANDEZ', plate: 'CL228091', guides: 9, tag: 'L-HER-1' },
  { date: '2026-08-27', zone: '09', carrier: 'ACUNA', plate: 'CL345361', guides: 13, kind: 'overnight', tag: 'L-ACU-1' },
  { date: '2026-08-28', zone: '02', carrier: 'OLO', plate: 'CL186068', guides: 14, tag: 'L-OLO-2' },
  { date: '2026-08-31', zone: '10', carrier: 'TRANSMAJORI', plate: 'C201133', guides: 10, kind: 'overnight', tag: 'L-TMJ-1' },
  // Setiembre
  { date: '2026-09-01', zone: '03', carrier: 'OLO', plate: 'CL300011', guides: 7 },
  { date: '2026-09-02', zone: '05', carrier: 'URENA', plate: 'CL272155', guides: 10 },
  { date: '2026-09-03', zone: '04', carrier: 'TRANSOSA', plate: 'CL244242', guides: 9 },
  { date: '2026-09-04', zone: '07', carrier: 'TRANSOSA', plate: 'C132239', guides: 13 },
  { date: '2026-09-05', zone: '08', carrier: 'TRANSOSA', plate: 'C132239', guides: 11, kind: 'returns', returns: 2 },
  { date: '2026-09-07', zone: '01', carrier: 'ULLOA', plate: 'CL120245', guides: 8 },
  { date: '2026-09-08', zone: '06', carrier: 'HERNANDEZ', plate: 'CL228091', guides: 10 },
  { date: '2026-09-09', zone: '16', carrier: 'OLO', plate: 'C162414', guides: 12 },
  { date: '2026-09-10', zone: '12', carrier: 'TRANSMAJORI', plate: 'C201133', guides: 9, kind: 'overnight' },
  { date: '2026-09-11', zone: '13', carrier: 'TRANSMAJORI', plate: 'CL301144', guides: 11 },
  { date: '2026-09-12', zone: '09', carrier: 'ACUNA', plate: 'C162179', guides: 12, kind: 'overnight' },
  { date: '2026-09-14', zone: '02', carrier: 'OLO', plate: 'CL188786', guides: 13 },
  { date: '2026-09-15', zone: '15', carrier: 'HERNANDEZ', plate: 'CL228091', guides: 8, kind: 'returns', returns: 1 },
  { date: '2026-09-16', zone: '04', carrier: 'OLO', plate: 'C162414', guides: 12 },
  { date: '2026-09-17', zone: '05', carrier: 'URENA', plate: 'CL272155', guides: 9 },
  { date: '2026-09-18', zone: '11', carrier: 'TRANSMAJORI', plate: 'C201133', guides: 8, kind: 'overnight' },
  { date: '2026-09-19', zone: '03', carrier: 'ULLOA', plate: 'CL120245', guides: 7 },
  { date: '2026-09-21', zone: '01', carrier: 'OLO', plate: 'CL188786', guides: 15 },
  { date: '2026-09-22', zone: '08', carrier: 'TRANSOSA', plate: 'CL190087', guides: 10 },
  { date: '2026-09-23', zone: '15', carrier: 'ACUNA', plate: 'CL345361', guides: 9 },
  { date: '2026-09-24', zone: '05', carrier: 'OLO', plate: 'CL186068', guides: 12 },
  { date: '2026-09-25', zone: '16', carrier: 'TRANSOSA', plate: 'CL244242', guides: 8 },
  { date: '2026-09-26', zone: '04', carrier: 'JIMENEZ', plate: 'CL987650', guides: 6 },
  { date: '2026-09-28', zone: '02', carrier: 'URENA', plate: 'CL272155', guides: 10, kind: 'incomplete', delivered: 7 },
  { date: '2026-09-29', zone: '06', carrier: 'HERNANDEZ', plate: 'CL228091', guides: 11, kind: 'incomplete', delivered: 9 },
  { date: '2026-09-30', zone: '01', carrier: 'OLO', plate: 'CL300011', guides: 9 },
  // Octubre (vigencia nueva del diésel)
  { date: '2026-10-01', zone: '04', carrier: 'TRANSOSA', plate: 'CL190087', guides: 12 },
  { date: '2026-10-02', zone: '07', carrier: 'TRANSOSA', plate: 'C132239', guides: 12, kind: 'returns', returns: 3 },
  { date: '2026-10-03', zone: '05', carrier: 'OLO', plate: 'CL188786', guides: 13 },
  { date: '2026-10-04', zone: '01', carrier: 'OLO', plate: 'CL186068', guides: 8 }, // domingo → recargo
  { date: '2026-10-05', zone: '10', carrier: 'TRANSMAJORI', plate: 'C201133', guides: 11, kind: 'overnight' },
  { date: '2026-10-06', zone: '09', carrier: 'ACUNA', plate: 'CL345361', guides: 12, kind: 'overnight' },
  { date: '2026-10-07', zone: '03', carrier: 'URENA', plate: 'CL272155', guides: 9 },
  { date: '2026-10-07', zone: '13', carrier: 'TRANSMAJORI', plate: 'CL301144', guides: 10, kind: 'incomplete', delivered: 6 },
  { date: '2026-10-08', zone: '02', carrier: 'OLO', plate: 'CL188786', guides: 14 },
  { date: '2026-10-08', zone: 'SIN_ZONA', carrier: 'ULLOA', plate: 'CL120245', guides: 5, kind: 'nozone' },
  // Sin tipo de ruta en guía de despacho (`dest_zone_id` nulo): el motor BLOQUEA la emisión y el viaje se queda en «Por liquidar».
  { date: '2026-10-07', zone: '01', carrier: 'TRANSOSA', plate: 'CL244242', guides: 6, kind: 'zonenull' },
  { date: '2026-10-09', zone: '04', carrier: 'TRANSOSA', plate: 'CL190087', guides: 11 },
  { date: '2026-10-09', zone: '06', carrier: 'HERNANDEZ', plate: 'CL228091', guides: 10, kind: 'progress', delivered: 4 },
  { date: '2026-10-09', zone: '05', carrier: 'OLO', plate: 'CL300011', guides: 9, kind: 'nocarrier' },
  { date: '2026-10-09', zone: '15', carrier: 'ACUNA', plate: 'C162179', guides: 7, kind: 'cancelled' },
  // Próximos días (planificados)
  { date: '2026-10-12', zone: '04', carrier: 'OLO', plate: 'CL188786', guides: 12, kind: 'planned' },
  { date: '2026-10-12', zone: '08', carrier: 'TRANSOSA', plate: 'CL190087', guides: 10, kind: 'planned' },
  { date: '2026-10-13', zone: '10', carrier: 'TRANSMAJORI', plate: 'C201133', guides: 9, kind: 'planned' },
];

const tripIdByTag = new Map<string, string>();
let tripSeq = 0;
let guideSeq = 0;
let orderSeq = 0;
let returnSeq = 0;
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

for (const spec of SPECS) {
  tripSeq += 1;
  const kind = spec.kind ?? 'ok';
  const carrierSpec = CARRIERS.find((c) => c.key === spec.carrier)!;
  const vehicleRow = work.vehicles.find((v) => v.id === vehicleIdOf(spec.carrier, spec.plate))!;
  const driverRow = work.drivers.find((d) => d.carrier_id === carrierId(spec.carrier))!;
  const zone = ZONAS_CR.find((z) => z[0] === spec.zone);
  const km = zone ? Math.round(zone[2] * between(0.95, 1.08)) : Math.round(between(40, 90));
  const dt = new Date(`${spec.date}T12:00:00.000Z`);
  const dia = DIAS[dt.getUTCDay()];
  const id = `TRIP_CR_${String(tripSeq).padStart(3, '0')}`;
  if (spec.tag) tripIdByTag.set(spec.tag, id);
  const routeNumber = `R-${spec.date.replace(/-/g, '')}-${spec.zone === 'SIN_ZONA' ? 'XX' : spec.zone}-${String((tripSeq % 7) + 1).padStart(2, '0')}`;

  const status = kind === 'planned' ? 'planned' : kind === 'progress' ? 'in_progress' : kind === 'cancelled' ? 'cancelled' : 'completed';
  const guideCount = spec.guides;
  const delivered = kind === 'incomplete' || kind === 'progress' ? spec.delivered ?? Math.floor(guideCount * 0.6)
    : status === 'completed' ? guideCount : 0;
  const hours = status === 'completed' || status === 'in_progress'
    ? (spec.hours ?? (kind === 'overnight' ? between(30, 38) : Math.min(11, 2.5 + km / 55 + guideCount * 0.12)))
    : 0;
  const startHourLocal = 5 + Math.floor(rnd() * 2); // 05:00–06:59 hora de Costa Rica (UTC-6)
  const start = new Date(dt); start.setUTCHours(startHourLocal + 6, intBetween(0, 50), 0, 0);
  const end = new Date(start.getTime() + hours * 3600_000);

  // Guías y pedidos
  const orders: Row[] = [];
  const guides: Row[] = [];
  const capKg = Number(vehicleRow.capacity_weight);
  const rawWeights = Array.from({ length: guideCount }, () => between(60, 320));
  const scale = Math.min(1, (capKg * between(0.55, 0.93)) / rawWeights.reduce((a, b) => a + b, 0));
  let totalKg = 0;
  let totalM3 = 0;
  for (let i = 0; i < guideCount; i += 1) {
    guideSeq += 1;
    orderSeq += 1;
    const customer = pickCustomer();
    const kg = Math.round(rawWeights[i] * scale);
    const m3 = Math.round((kg / 190) * 100) / 100;
    totalKg += kg; totalM3 += m3;
    const isDelivered = status === 'completed' ? i < delivered : status === 'in_progress' ? i < delivered : false;
    const guideNumber = `GD-CR-${String(guideSeq).padStart(6, '0')}`;
    const orderUuid = `ORD_CR_${String(orderSeq).padStart(6, '0')}`;
    const store = pick(customer.stores);
    const deliveryStatus = status === 'cancelled' ? 'pending' : isDelivered ? 'delivered' : (status === 'completed' ? 'failed' : 'pending');
    guides.push({
      id: `DG_CR_${String(guideSeq).padStart(6, '0')}`, route_id: id, guide_number: guideNumber, sequence_number: i + 1,
      status: isDelivered ? 'completed' : 'pending', delivery_status: deliveryStatus, recipient_name: store,
      actual_arrival_time: isDelivered ? new Date(start.getTime() + ((i + 1) / guideCount) * hours * 3600_000).toISOString() : null,
    });
    orders.push({
      id: `TORD_CR_${String(guideSeq).padStart(6, '0')}`, route_id: id, guide_number: guideNumber, sequence_number: i + 1, delivery_status: deliveryStatus,
      order_id: orderUuid, order_number: `PED-26${String(100000 + orderSeq)}`, customer_id: customer.id, customer_code: customer.code, customer_name: customer.name,
      value: money(round500(between(180000, 1650000))), weight_kg: kg, volume_m3: m3, items: intBetween(2, 24), mark: null, mark_reason: null,
    });
  }
  work.dispatchGuides.push(...guides);
  work.tripOrders.push(...orders);

  // Devoluciones
  const returnCount = kind === 'returns' ? spec.returns ?? 1 : 0;
  for (let r = 0; r < returnCount; r += 1) {
    returnSeq += 1;
    const g = guides[r % guides.length];
    const [pCode, pName] = pick(PRODUCTOS);
    work.tripReturns.push({
      id: `RET_CR_${String(returnSeq).padStart(4, '0')}`, route_id: id, dispatch_guide_id: g.id, return_number: `DEV-26${String(5000 + returnSeq)}`,
      return_type: r % 2 === 0 ? 'PARTIAL' : 'TOTAL', reason: pick(['Producto dañado en tránsito', 'Cliente cerrado', 'Error en pedido', 'Rechazo por faltante']),
      product_code: r % 2 === 0 ? pCode : null, product_name: r % 2 === 0 ? pName : null, quantity: r % 2 === 0 ? intBetween(1, 12) : null, status: 'registered',
    });
  }

  const noCarrier = kind === 'nocarrier';
  const zoneRow = work.zones.find((z) => z.id === zoneId(spec.zone))!;
  void dia; void carrierSpec;
  work.trips.push({
    id, country_id: CR, route_number: routeNumber, route_date: spec.date, status,
    carrier_id: noCarrier ? null : carrierId(spec.carrier), carrier_name: noCarrier ? null : carrierSpec.name, is_flota_propia: noCarrier ? null : !!carrierSpec.own,
    driver_id: noCarrier ? null : driverRow.id, driver_name: noCarrier ? null : driverRow.full_name, driver_document: noCarrier ? null : driverRow.document,
    vehicle_id: noCarrier ? null : vehicleRow.id, vehicle_plate: noCarrier ? null : vehicleRow.plate, vehicle_type: noCarrier ? null : vehicleRow.vehicle_type,
    capacity_weight: noCarrier ? null : vehicleRow.capacity_weight, capacity_volume: noCarrier ? null : vehicleRow.capacity_volume,
    dest_zone_id: kind === 'zonenull' ? null : zoneRow.id, dest_zone_code: kind === 'zonenull' ? null : zoneRow.code, dest_zone_name: kind === 'zonenull' ? null : zoneRow.name,
    total_distance: String(km), total_stops: guideCount, completed_stops: delivered, total_weight: String(totalKg), total_volume: totalM3.toFixed(2),
    actual_start_time: status === 'planned' || status === 'cancelled' ? null : start.toISOString(),
    actual_end_time: status === 'completed' ? end.toISOString() : null,
    duration_hours: status === 'completed' ? hours.toFixed(2) : null,
    guide_count: guideCount, delivered_guides: delivered, return_count: returnCount, settlement_id: null,
  });
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// VENEZUELA (USD) y COLOMBIA (COP)
// Inspiradas en docs/tarifador/demo-data: estructura de costos de la flota VE, tarifario Beval por
// zona (origen → destino), tarifario Andina 4D (destino × vehículo × servicio) y tarifario Cofersa
// (BOG/MED/BAQ). Un viaje solo trae la zona DESTINO, así que los tarifarios que se usan al liquidar
// van por `destZone`; los de origen → destino sirven al Probador y al CRUD de tarifarios.
// ════════════════════════════════════════════════════════════════════════════════════════════════
interface ForeignCarrier {
  key: string; name: string; taxId: string; own?: boolean; status?: string; profile?: boolean;
  vehicles: [string, string, number, number][]; drivers: [string, string][];
}
interface ForeignCountry {
  id: 'VE' | 'CO'; currency: string; decimals: number; phone: string;
  zones: [string, string, number][]; // [código, nombre, km desde el CEDI]
  groups: [string, string, string[]][];
  carriers: ForeignCarrier[];
  customers: { id: string; code: string; name: string; stores: string[] }[];
}

const VE_CO: ForeignCountry[] = [
  {
    id: 'VE', currency: 'USD', decimals: 2, phone: '+58 4',
    zones: [['CCS', 'Caracas', 180], ['CAR', 'Carabobo', 40], ['ZUL', 'Zulia', 650], ['TAC', 'Táchira', 820], ['LAR', 'Lara', 340], ['ANZ', 'Anzoátegui', 520], ['BOL', 'Bolívar', 710]],
    groups: [['CENTRO', 'Centro', ['CCS', 'CAR']], ['OCCIDENTE', 'Occidente', ['ZUL', 'TAC', 'LAR']], ['ORIENTE', 'Oriente', ['ANZ', 'BOL']]],
    carriers: [
      {
        key: 'OWN', name: 'Flota Propia Venezuela', taxId: 'J-30000111-0', own: true,
        vehicles: [['AB123CD', 'NPR', 4500, 20], ['AC456EF', 'FRR', 8000, 32], ['AD789GH', 'TT-750', 14000, 45]],
        drivers: [['José Gregorio Ramírez', 'V12345678'], ['Carlos Alberto Peña', 'V87654321']],
      },
      {
        key: 'ANDINA', name: 'Transporte Andino C.A.', taxId: 'J-30123456-7',
        vehicles: [['TA101AA', 'NPR', 4500, 20], ['TA202BB', 'FRR', 8000, 32]],
        drivers: [['Luis Eduardo Morales', 'V15234567'], ['Pedro Antonio Rivas', 'V16345678']],
      },
      {
        key: 'CENTRO', name: 'Logística del Centro C.A.', taxId: 'J-30987654-3',
        vehicles: [['LC303CC', 'NPR', 4500, 20]], drivers: [['Ramón José Díaz', 'V14111222']],
      },
      {
        key: 'ORINOCO', name: 'Fletes Orinoco C.A.', taxId: 'J-31222333-4', profile: false,
        vehicles: [['FO404DD', 'FRR', 8000, 32]], drivers: [['Héctor Manuel Salazar', 'V13999888']],
      },
      {
        key: 'LLANOS', name: 'Transportes Llanos S.R.L.', taxId: 'J-29555666-1', status: 'inactive',
        vehicles: [['TL505EE', 'NPR', 4500, 20]], drivers: [['Jesús Alberto Torres', 'V12000111']],
      },
    ],
    customers: [
      { id: 'CUST_BEVAL', code: 'BEVAL', name: 'Beval', stores: ['Beval Los Ruices', 'Beval Valencia Norte', 'Beval Maracaibo', 'Beval Barquisimeto', 'Beval San Cristóbal'] },
      { id: 'CUST_FEBECA', code: 'FEBECA', name: 'Febeca', stores: ['Febeca Chacao', 'Febeca Naguanagua', 'Febeca Puerto La Cruz', 'Febeca Ciudad Bolívar'] },
    ],
  },
  {
    id: 'CO', currency: 'COP', decimals: 0, phone: '+57 3',
    zones: [['BOG', 'Bogotá', 40], ['MED', 'Medellín', 415], ['BAQ', 'Barranquilla', 1000], ['CLO', 'Cali', 460], ['BGA', 'Bucaramanga', 390]],
    groups: [['ANDINA', 'Región Andina', ['BOG', 'MED', 'BGA']], ['CARIBE', 'Región Caribe', ['BAQ']], ['PACIFICO', 'Región Pacífico', ['CLO']]],
    carriers: [
      {
        key: 'OWN', name: 'Flota Propia Colombia', taxId: '900100200-1', own: true,
        vehicles: [['SXA123', 'NPR', 5000, 22], ['SXB456', 'FRR', 8000, 32]],
        drivers: [['Fabián Andrés Ríos', '1012345678'], ['Camilo Ernesto Vargas', '80123456']],
      },
      {
        key: 'CAUCA', name: 'Transportes del Cauca S.A.S.', taxId: '900123456-7',
        vehicles: [['TCA101', 'NPR', 5000, 22], ['TCB202', 'FRR', 8000, 32]],
        drivers: [['Jhon Fredy Mosquera', '94123456'], ['Édgar Mauricio Valencia', '16789012']],
      },
      {
        key: 'ANDINACARGO', name: 'Andina Cargo S.A.S.', taxId: '900654321-2',
        vehicles: [['ACG303', 'NPR', 5000, 22]], drivers: [['Wilson Orlando Suárez', '79456123']],
      },
      {
        key: 'CARIBE', name: 'Fletes del Caribe Ltda.', taxId: '802111222-5', profile: false,
        vehicles: [['FCB404', 'FRR', 8000, 32]], drivers: [['Alberto José Pacheco', '72111333']],
      },
    ],
    customers: [
      { id: 'CUST_CO_1', code: 'ALMACENES', name: 'Almacenes Éxito', stores: ['Éxito Calle 80', 'Éxito Envigado', 'Éxito Barranquilla Norte', 'Éxito Cali Unicentro', 'Éxito Bucaramanga'] },
      { id: 'CUST_CO_COFERSA', code: 'COFERSA', name: 'Cofersa', stores: ['Cofersa Bogotá Sur', 'Cofersa Medellín', 'Cofersa Barranquilla'] },
    ],
  },
];

const fx = (cc: ForeignCountry, usd: number, cop: number) => (cc.id === 'VE' ? usd : cop);
const loc = (cc: ForeignCountry) => cc.id;
let fRtr = 0; let fRule = 0; let fRow = 0; let fVar = 0;

for (const cc of VE_CO) {
  const C = cc.id;
  const zId = (code: string) => `Z_${C}_${code}`;
  const carId = (key: string) => `CAR_${C}_${key}`;
  const partyId = (key: string) => `PARTY_${C}_${key}`;
  const money2 = (n: number) => n.toFixed(2);

  // Zonas, grupos y configuración
  for (const [code, name] of cc.zones) work.zones.push({ id: zId(code), country_id: C, code, name, status: 'active' });
  work.zones.push({ id: zId('SIN_ZONA'), country_id: C, code: 'SIN_ZONA', name: 'Sin zona asignada', status: 'active' });
  for (const [code, name, codes] of cc.groups) work.zoneGroups.push({ id: `ZG_${C}_${code}`, country_id: C, code, name, status: 'active', zone_codes: codes });
  work.zoneGroups.push({ id: `ZG_${C}_SIN_GRUPO`, country_id: C, code: 'SIN_GRUPO', name: 'Sin grupo asignado', status: 'active', zone_codes: ['SIN_ZONA'] });

  // Transportistas, vehículos, conductores y perfiles
  for (const c of cc.carriers) {
    const status = c.status ?? 'active';
    work.carriers.push({ id: carId(c.key), country_id: C, code: `${c.key}-${C}`, name: c.name, tax_id: c.taxId, is_flota_propia: !!c.own, status });
    if (c.profile !== false) work.settlementParties.push({ id: partyId(c.key), carrier_id: carId(c.key), status: 'active', notes: c.own ? 'Flota propia: se liquida con su estructura de costos.' : null });
    for (const [plate, type, kg, m3] of c.vehicles) {
      work.vehicles.push({ id: `VEH_${C}_${c.key}_${plate}`, carrier_id: carId(c.key), plate, vehicle_type: type, capacity_weight: String(kg), capacity_volume: String(m3), status });
    }
    for (const [fullName, document] of c.drivers) {
      work.drivers.push({
        id: `DRV_${C}_${c.key}_${document}`, carrier_id: carId(c.key), code: `DRV-${document.slice(-4)}`, full_name: fullName, document,
        phone: `${cc.phone}${intBetween(10, 99)}-${intBetween(1000000, 9999999)}`, license_number: 'B2', status,
      });
    }
  }

  // ── Tarifarios ──
  const table = (id: string, code: string, name: string, keys: string[], party: string | null, values: string[] | null = null) => {
    work.rateTables.push({ id, country_id: C, party_id: party ? partyId(party) : null, code, name, key_columns: keys, value_columns: values, active: true });
  };
  const row = (tableId: string, order: number, key: string[], amount: number, extra: Record<string, string> | null = null) => {
    fRow += 1;
    work.rateTableRows.push({ id: `RTR_${C}_${fRow}`, table_id: tableId, key, amount: money2(amount), extra_values: extra, row_order: order, active: true });
  };

  // ZONAS: flete por zona destino y tipo de camión (los viajes reales solo traen el destino).
  table(`RT_${C}_ZONAS`, 'ZONAS', 'Fletes por zona destino y camión', ['destZone', 'truckTypeId'], null);
  {
    let order = 0;
    for (const [code, , km] of cc.zones) {
      const npr = fx(cc, 120 + km * 0.62, 260000 + km * 1650);
      row(`RT_${C}_ZONAS`, ++order, [code, 'NPR'], npr);
      row(`RT_${C}_ZONAS`, ++order, [code, 'FRR'], npr * 1.38);
      if (C === 'VE') row(`RT_${C}_ZONAS`, ++order, [code, 'TT-750'], npr * 1.9);
      row(`RT_${C}_ZONAS`, ++order, [code, '*'], npr); // cualquier otro camión
    }
  }

  if (C === 'VE') {
    // Beval: origen → destino (CSV tarifario-beval-zona.csv). Sirve al Probador, que sí conoce el origen.
    table('RT_VE_BEVAL', 'BEVAL_ORIGEN_DESTINO', 'Tarifario Beval (origen → destino)', ['originZone', 'destZone'], null);
    [['CCS', 'CAR', 380], ['CCS', 'ZUL', 600], ['CAR', 'ZUL', 500], ['ZUL', 'CAR', 500], ['CAR', 'CCS', 380]].forEach(([o, d, a], i) => row('RT_VE_BEVAL', i + 1, [String(o), String(d)], Number(a)));

    // Andina 4D: destino × vehículo × servicio (tarifario-andina-4d.xlsx), con filas de respaldo.
    table('RT_VE_ANDINA', 'ANDINA_4D', 'Tarifario Andina (destino × vehículo × servicio)', ['destZone', 'truckTypeId', 'serviceType'], 'ANDINA');
    [
      ['CAR', 'NPR', 'STANDARD', 380], ['CAR', 'NPR', 'EXPRESS', 410], ['CAR', 'FRR', 'STANDARD', 520], ['CAR', 'FRR', 'EXPRESS', 560],
      ['CCS', 'NPR', 'STANDARD', 380], ['CCS', 'NPR', 'EXPRESS', 410], ['ZUL', 'NPR', 'STANDARD', 600], ['ZUL', 'FRR', 'STANDARD', 780],
      ['TAC', 'NPR', '*', 520], ['*', 'NPR', '*', 350],
    ].forEach(([d, t, sv, a], i) => row('RT_VE_ANDINA', i + 1, [String(d), String(t), String(sv)], Number(a)));

    // Peajes y viáticos con dos columnas de valor.
    table('RT_VE_PEAJES', 'PEAJES_VIATICOS', 'Peajes y viáticos por zona', ['destZone'], null, ['peaje', 'viatico']);
    [['CCS', 6, 0], ['ZUL', 18, 25], ['TAC', 24, 30], ['LAR', 9, 12], ['ANZ', 14, 20], ['BOL', 22, 28]].forEach(([z, p, v], i) => row('RT_VE_PEAJES', i + 1, [String(z)], Number(p), { peaje: money2(Number(p)), viatico: money2(Number(v)) }));
  } else {
    // Cofersa: origen → destino en pesos (tarifario-cofersa-zona.xlsx).
    table('RT_CO_COFERSA', 'COFERSA_ORIGEN_DESTINO', 'Tarifario Cofersa (origen → destino)', ['originZone', 'destZone'], null);
    [['BOG', 'MED', 350000], ['BOG', 'BAQ', 620000], ['MED', 'BAQ', 480000], ['BAQ', 'MED', 480000]].forEach(([o, d, a], i) => row('RT_CO_COFERSA', i + 1, [String(o), String(d)], Number(a)));

    // Tarifa pactada de Transportes del Cauca por zona destino y camión.
    table('RT_CO_CAUCA', 'TARIFA_PACTADA', 'Tarifa pactada Transportes del Cauca', ['destZone', 'truckTypeId'], 'CAUCA');
    [['MED', 'NPR', 335000], ['MED', 'FRR', 470000], ['CLO', 'NPR', 640000], ['CLO', 'FRR', 880000], ['BGA', 'NPR', 590000]].forEach(([d, t, a], i) => row('RT_CO_CAUCA', i + 1, [String(d), String(t)], Number(a)));

    table('RT_CO_ESCALA_KM', 'ESCALA_KM', 'Recargo por distancia (km)', ['km'], null);
    [['0..100', 0], ['101..450', 45000], ['451..800', 90000], ['801..', 150000]].forEach(([r, a], i) => row('RT_CO_ESCALA_KM', i + 1, [String(r)], Number(a)));
  }

  // ── Variables personalizadas ──
  const pvar = (key: string, k: string, label: string, kind: 'NUMBER' | 'TEXT', origin: 'PER_TRIP' | 'CONSTANT', def: string, unit: string | null) => {
    fVar += 1;
    work.partyVariables.push({ id: `PVAR_${C}_${fVar}`, party_id: partyId(key), key: k, label, kind, origin, default_value: def, unit, active: true });
  };
  for (const c of cc.carriers.filter((x) => x.profile !== false)) {
    pvar(c.key, 'custom:monto_peajes', 'Peajes adicionales', 'NUMBER', 'PER_TRIP', '0', cc.currency);
    pvar(c.key, 'custom:minutos_atraso', 'Minutos de atraso', 'NUMBER', 'PER_TRIP', '0', 'min');
    pvar(c.key, 'custom:incidencias', 'Incidencias', 'NUMBER', 'PER_TRIP', '0', null);
  }
  if (C === 'VE') {
    pvar('OWN', 'custom:con_ayudante', 'Viaja con ayudante (1 = sí)', 'NUMBER', 'PER_TRIP', '0', null);
    pvar('ANDINA', 'custom:bultos', 'Bultos entregados', 'NUMBER', 'PER_TRIP', '0', 'bultos');
    pvar('CENTRO', 'custom:horas_espera', 'Horas de espera', 'NUMBER', 'PER_TRIP', '0', 'h');
    pvar('CENTRO', 'custom:bono_oriente', 'Bono Oriente (constante)', 'NUMBER', 'CONSTANT', '25', 'USD');
  } else {
    pvar('CAUCA', 'custom:material_averiado', 'Unidades de material averiado', 'NUMBER', 'PER_TRIP', '0', 'und');
    pvar('CAUCA', 'custom:zona_riesgo', 'Zona de riesgo', 'TEXT', 'PER_TRIP', '', null);
    pvar('ANDINACARGO', 'custom:recolectas', 'Recolectas en ruta', 'NUMBER', 'PER_TRIP', '0', 'recolectas');
  }

  // ── Reglas ──
  interface R { code: string; name: string; stage: string; priority: number; stacking?: string; party?: string; excl?: string; conditions: unknown; expression: unknown; description?: string; reason?: string; effect?: 'INCREASE' | 'DECREASE'; from?: string | null; to?: string | null; active?: boolean; version?: number }
  const mk = (r: R) => {
    fRule += 1;
    work.pricingRules.push({
      id: `RULE_${C}_${String(fRule).padStart(2, '0')}`, country_id: C, scope: r.party ? 'PARTY' : 'COUNTRY', party_id: r.party ? partyId(r.party) : null,
      code: r.code, name: r.name, stage: r.stage, priority: r.priority, stacking: r.stacking ?? 'SUM', exclusion_group: r.excl ?? null,
      conditions: r.conditions, expression: r.expression, description: r.description ?? null, reason: r.reason ?? null, effect: r.effect ?? 'INCREASE',
      builder: null, condition_builder: null, is_adhoc: false, active: r.active ?? true, effective_from: r.from ?? null, effective_to: r.to ?? null, version: r.version ?? 1,
    });
  };
  const A = (n: number, m: number) => String(fx(cc, n, m));
  mk({
    code: 'R_ZONAS', name: 'Flete por zona y camión (tarifario ZONAS)', stage: 'BASE', priority: 10, stacking: 'EXCLUSIVE', conditions: ALWAYS,
    expression: { op: 'LOOKUP_TABLE', table: 'ZONAS', fallback: { op: 'PER_KM', rate: A(1.2, 1650) } },
  });
  mk({ code: 'R_PARADAS', name: 'Entregas atendidas', stage: 'VARIABLE', priority: 20, conditions: gt('clientCount', 0), expression: { op: 'PER_UNIT', unit: 'clientCount', rate: A(2, 5200) } });
  mk({
    code: 'R_PESO_ESCALON', name: 'Cargo por peso escalonado', stage: 'VARIABLE', priority: 30, conditions: gt('weightKg', 0),
    expression: { op: 'TIERED', unit: 'weightKg', mode: 'RATE', tiers: [{ upTo: 500, amount: A(0.04, 80) }, { upTo: 1500, amount: A(0.06, 110) }, { upTo: null, amount: A(0.08, 140) }] },
  });
  mk({ code: 'R_PERNOCTA', name: 'Pernocta', stage: 'SURCHARGE', priority: 40, conditions: gt('overnightNights', 0), expression: { op: 'PER_UNIT', unit: 'overnightNights', rate: A(15, 70000) } });
  mk({ code: 'R_PEAJES_EXTRA', name: 'Peajes adicionales reportados', stage: 'SURCHARGE', priority: 41, conditions: gt('custom:monto_peajes', 0), expression: { op: 'PER_UNIT', unit: 'custom:monto_peajes', rate: '1' } });
  mk({
    code: 'R_INCIDENTE_FIJO', name: 'Recargo por incidente (fijo)', stage: 'SURCHARGE', priority: 42, stacking: 'MAX', excl: 'INCIDENTES',
    conditions: gt('custom:incidencias', 0), expression: { op: 'FIXED', amount: A(15, 45000) },
  });
  mk({
    code: 'R_INCIDENTE_UNIT', name: 'Recargo por incidente (por incidente)', stage: 'SURCHARGE', priority: 43, stacking: 'MAX', excl: 'INCIDENTES',
    conditions: gt('custom:incidencias', 1), expression: { op: 'PER_UNIT', unit: 'custom:incidencias', rate: A(10, 30000) },
  });
  mk({
    code: 'R_DOMINGO', name: 'Recargo por domingo', stage: 'MODIFIER', priority: 50, conditions: eq('weekday', 0),
    expression: { op: 'PERCENT', pct: '0.2', base: { of: 'RUNNING_SUBTOTAL' } }, reason: 'Jornada en día de descanso.',
  });
  mk({
    code: 'R_ATRASO', name: 'Penalización por atraso', stage: 'ADJUSTMENT', priority: 60, conditions: gt('custom:minutos_atraso', 0), effect: 'DECREASE',
    expression: { op: 'TIERED', unit: 'custom:minutos_atraso', tiers: [{ upTo: 15, amount: '0' }, { upTo: 60, amount: A(-10, -35000) }, { upTo: null, amount: A(-25, -90000) }] },
  });
  mk({
    code: 'R_VOLUMEN', name: 'Descuento por volumen (más de 12 paradas)', stage: 'ADJUSTMENT', priority: 61, conditions: gt('clientCount', 12), effect: 'DECREASE',
    expression: { op: 'PERCENT', pct: '-0.03', base: { of: 'RUNNING_SUBTOTAL' } },
  });
  mk({
    code: 'R_TEMPORADA_ALTA', name: 'Temporada alta (inactiva hasta diciembre)', stage: 'MODIFIER', priority: 52, active: false, from: '2026-12-01', to: '2027-01-15',
    conditions: ALWAYS, expression: { op: 'PERCENT', pct: '0.1', base: { of: 'RUNNING_SUBTOTAL' } },
  });
  mk({
    code: 'R_AJUSTE_COMBUSTIBLE', name: 'Ajuste de combustible (vigencia futura)', stage: 'MODIFIER', priority: 53, from: '2026-11-01', to: null, conditions: eq('fleetType', 'OUTSOURCED'),
    expression: { op: 'PERCENT', pct: '0.025', base: { of: 'STAGE_SUBTOTAL', stage: 'BASE' } }, reason: 'Revisión trimestral del precio del combustible.',
  });

  if (C === 'VE') {
    mk({
      party: 'ANDINA', code: 'R_ZONAS', name: 'Tarifa Andina 4D — reemplaza al flete del país', stage: 'BASE', priority: 10, stacking: 'EXCLUSIVE', conditions: ALWAYS,
      expression: { op: 'LOOKUP_TABLE', table: 'ANDINA_4D', fallback: { op: 'LOOKUP_TABLE', table: 'ZONAS', fallback: { op: 'PER_KM', rate: '1.3' } } },
      reason: 'Contrato Andina: precio por destino, vehículo y servicio; sin fila, vale el del país.',
    });
    mk({
      party: 'ANDINA', code: 'R_BULTOS', name: 'Bultos entregados (Andina)', stage: 'VARIABLE', priority: 62, conditions: gt('custom:bultos', 0),
      expression: { op: 'PER_UNIT', unit: 'custom:bultos', rate: '0.25' },
    });
    mk({
      party: 'CENTRO', code: 'R_ESPERA', name: 'Horas de espera (Logística del Centro)', stage: 'VARIABLE', priority: 62, conditions: gt('custom:horas_espera', 0),
      expression: { op: 'CLAMP', value: { op: 'PER_UNIT', unit: 'custom:horas_espera', rate: '8' }, max: '48' },
    });
    mk({
      party: 'CENTRO', code: 'R_BONO_ORIENTE', name: 'Bono Oriente (constante de la compañía)', stage: 'SURCHARGE', priority: 44, conditions: eq('destZoneGroup', 'ORIENTE'),
      expression: { op: 'PER_UNIT', unit: 'custom:bono_oriente', rate: '1' },
    });
    mk({
      code: 'R_PEAJES_TARIFA', name: 'Peajes de la ruta (tarifario PEAJES_VIATICOS)', stage: 'SURCHARGE', priority: 45, conditions: ALWAYS,
      expression: { op: 'LOOKUP_TABLE', table: 'PEAJES_VIATICOS', column: 'peaje', fallback: { op: 'FIXED', amount: '0' } },
    });
    mk({
      code: 'R_VIATICO', name: 'Viático por pernocta (tarifario PEAJES_VIATICOS)', stage: 'SURCHARGE', priority: 46, conditions: gt('overnightNights', 0),
      expression: { op: 'LOOKUP_TABLE', table: 'PEAJES_VIATICOS', column: 'viatico', fallback: { op: 'FIXED', amount: '0' } },
    });
    mk({
      party: 'OWN', code: 'R_VALOR_REPARTO', name: 'Cargo interno por entrega (flota propia)', stage: 'ADJUSTMENT', priority: 70, conditions: gt('clientCount', 0),
      expression: { op: 'PER_UNIT', unit: 'clientCount', rate: '0.5' },
    });
  } else {
    mk({
      party: 'CAUCA', code: 'R_ZONAS', name: 'Tarifa pactada Cauca — reemplaza al flete del país', stage: 'BASE', priority: 10, stacking: 'EXCLUSIVE', conditions: ALWAYS,
      expression: { op: 'LOOKUP_TABLE', table: 'TARIFA_PACTADA', fallback: { op: 'LOOKUP_TABLE', table: 'ZONAS', fallback: { op: 'PER_KM', rate: '1800' } } },
      reason: 'Contrato 2026: tarifa pactada por zona y camión; si no hay fila, vale la del país.',
    });
    mk({
      party: 'CAUCA', code: 'R_MATERIAL_AVERIADO', name: 'Descuento por material averiado', stage: 'ADJUSTMENT', priority: 63, effect: 'DECREASE',
      conditions: gt('custom:material_averiado', 0), expression: { op: 'PER_UNIT', unit: 'custom:material_averiado', rate: '-15000' },
    });
    mk({
      party: 'CAUCA', code: 'R_ZONA_RIESGO', name: 'Recargo por zona de riesgo', stage: 'SURCHARGE', priority: 47, conditions: eq('custom:zona_riesgo', 'ALTA'), expression: { op: 'FIXED', amount: '50000' },
    });
    mk({
      party: 'ANDINACARGO', code: 'R_RECOLECTAS', name: 'Recolectas en ruta (Andina Cargo)', stage: 'VARIABLE', priority: 62, conditions: gt('custom:recolectas', 0),
      expression: { op: 'PER_UNIT', unit: 'custom:recolectas', rate: '28000' },
    });
    mk({
      code: 'R_DISTANCIA', name: 'Recargo por distancia (tarifario ESCALA_KM)', stage: 'VARIABLE', priority: 35, conditions: gt('km', 0),
      expression: { op: 'LOOKUP_TABLE', table: 'ESCALA_KM', fallback: { op: 'FIXED', amount: '0' } },
    });
    mk({
      party: 'OWN', code: 'R_VALOR_REPARTO', name: 'Cargo interno por entrega (flota propia)', stage: 'ADJUSTMENT', priority: 70, conditions: gt('clientCount', 0),
      expression: { op: 'PER_UNIT', unit: 'clientCount', rate: '3000' },
    });
  }

  // ── Plantillas del Probador (con origen: los tarifarios origen → destino sí se prueban acá) ──
  const origin = C === 'VE' ? 'CCS' : 'BOG';
  const tpl = (name: string, party: string | null, dest: string, km: number, clients: number, kg: number, truck: string, fleet: 'OWN' | 'OUTSOURCED', service: string, hours: number, vars: Record<string, number | string> = {}) => {
    work.pricingTemplates.push({
      id: `TPL_${C}_${work.pricingTemplates.filter((t) => t.country_id === C).length + 1}`, country_id: C, name,
      trip: {
        partyId: party ? partyId(party) : null, quotedAt: '2026-10-05T12:00:00.000Z', originLocationId: zId(origin), destLocationId: zId(dest), km, clientCount: clients,
        weightKg: kg, truckTypeId: truck, serviceType: service, fleetType: fleet, carrierId: party ? carId(party) : null, customerId: null, durationHours: hours, customVars: vars,
      },
    });
  };
  if (C === 'VE') {
    tpl('Caracas → Carabobo STANDARD NPR (Andina)', 'ANDINA', 'CAR', 180, 14, 1900, 'NPR', 'OUTSOURCED', 'STANDARD', 4);
    tpl('Caracas → Carabobo EXPRESS FRR (Andina, 40 bultos)', 'ANDINA', 'CAR', 180, 20, 3800, 'FRR', 'OUTSOURCED', 'EXPRESS', 4, { 'custom:bultos': 40 });
    tpl('Caracas → Zulia con pernocta (flota propia, TT-750)', 'OWN', 'ZUL', 650, 12, 9500, 'TT-750', 'OWN', 'STANDARD', 30, { 'custom:con_ayudante': 1 });
    tpl('Caracas → Bolívar con bono Oriente (Logística del Centro)', 'CENTRO', 'BOL', 710, 9, 3000, 'NPR', 'OUTSOURCED', 'STANDARD', 31, { 'custom:horas_espera': 2 });
  } else {
    tpl('Bogotá → Medellín (Cauca, NPR)', 'CAUCA', 'MED', 415, 10, 2600, 'NPR', 'OUTSOURCED', 'STANDARD', 8);
    tpl('Bogotá → Cali con zona de riesgo (Cauca, FRR)', 'CAUCA', 'CLO', 460, 12, 5200, 'FRR', 'OUTSOURCED', 'STANDARD', 9, { 'custom:zona_riesgo': 'ALTA', 'custom:material_averiado': 3 });
    tpl('Bogotá → Barranquilla con pernocta (flota propia, FRR)', 'OWN', 'BAQ', 1000, 8, 4800, 'FRR', 'OWN', 'STANDARD', 26);
  }

  // ── Estructura de costos de la flota propia ──
  const own = `CSTR_${C}_OWN`;
  let cr = 0;
  const costRowF = (structure: string, v: Partial<Row> & { code: string; label: string; driver: string; amount: string }) => {
    cr += 1;
    work.costStructureRows.push({
      id: `CROW_${C}_${cr}`, structure_id: structure, sign: 'ADD', applies_when: null, unit: null, active: true, cost_group: null,
      frequency: null, frequency_qty: null, unit_qty: null, cost_per_km: null, truck_type: null, row_order: cr, ...v,
    });
  };
  if (C === 'VE') {
    // estructura-costos-flota-vzla.xlsx: nómina del chofer y viáticos "a convenir" (caso límite: inactivo, monto 0).
    work.costStructures.push({
      id: own, party_id: partyId('OWN'), country_id: C, name: 'Estructura de costos — Flota Propia Venezuela (2026)', operating_days_per_month: 30,
      params: { kmPerYear: 48000, fuelPrice: '0.5', fuelEfficiency: { NPR: 7, FRR: 5, 'TT-750': 3.2 } }, effective_from: '2026-01-01T00:00:00.000Z', active: true,
      notes: 'Cargada desde estructura-costos-flota-vzla.xlsx.',
    });
    costRowF(own, { code: 'SALARIO_CHOFER', label: 'Salario chofer', driver: 'PER_MONTH_PRORATED', amount: '620', unit: 'USD/mes', cost_group: 'conductor' });
    costRowF(own, { code: 'AGUINALDO_CHOFER', label: 'Aguinaldo chofer', driver: 'PER_MONTH_PRORATED', amount: '51.67', unit: 'USD/mes', cost_group: 'conductor' });
    costRowF(own, { code: 'SEGURO_SOCIAL', label: 'Seguro social', driver: 'PER_MONTH_PRORATED', amount: '38', unit: 'USD/mes', cost_group: 'conductor' });
    costRowF(own, { code: 'VIATICOS', label: 'Viáticos (a convenir)', driver: 'PER_DAY', amount: '0', unit: 'USD/día', cost_group: 'otros', active: false });
    costRowF(own, { code: 'AYUDANTE', label: 'Ayudante', driver: 'PER_MONTH_PRORATED', amount: '310', unit: 'USD/mes', cost_group: 'ayudante', applies_when: { p: 'GT', left: 'custom:con_ayudante', right: 0 } });
    costRowF(own, { code: 'COMBUSTIBLE', label: 'Combustible', driver: 'PER_KM', amount: '0.07', unit: 'USD/km', cost_group: 'combustible' });
    costRowF(own, { code: 'MANTENIMIENTO', label: 'Mantenimiento por km', driver: 'PER_KM', amount: '0.12', unit: 'USD/km', cost_group: 'mantenimiento' });
    costRowF(own, { code: 'DEPRECIACION_TT750', label: 'Depreciación adicional cabezal', driver: 'PER_KM', amount: '0.10', unit: 'USD/km', cost_group: 'depreciacion', applies_when: { p: 'EQ', left: 'truckTypeId', right: 'TT-750' } });
    costRowF(own, { code: 'GASTOS_VIAJE', label: 'Gastos fijos por viaje', driver: 'FIXED', amount: '15', unit: 'USD/viaje', cost_group: 'otros' });
  } else {
    work.costStructures.push({
      id: own, party_id: partyId('OWN'), country_id: C, name: 'Estructura de costos — Flota Propia Colombia (2026)', operating_days_per_month: 26,
      params: { kmPerYear: 60000, fuelPrice: '9800', fuelEfficiency: { NPR: 9, FRR: 6 } }, effective_from: '2026-01-01T00:00:00.000Z', active: true, notes: null,
    });
    costRowF(own, { code: 'SALARIO_CONDUCTOR', label: 'Salario y prestaciones del conductor', driver: 'PER_MONTH_PRORATED', amount: '3350000', unit: 'COP/mes', cost_group: 'conductor' });
    costRowF(own, { code: 'AUXILIAR', label: 'Auxiliar de reparto', driver: 'PER_MONTH_PRORATED', amount: '1900000', unit: 'COP/mes', cost_group: 'ayudante', applies_when: { p: 'GT', left: 'clientCount', right: 8 } });
    costRowF(own, { code: 'COMBUSTIBLE', label: 'Combustible', driver: 'PER_KM', amount: '1120', unit: 'COP/km', cost_group: 'combustible' });
    costRowF(own, { code: 'MANTENIMIENTO', label: 'Mantenimiento por km', driver: 'PER_KM', amount: '310', unit: 'COP/km', cost_group: 'mantenimiento' });
    costRowF(own, { code: 'PEAJES', label: 'Peajes promedio por viaje', driver: 'FIXED', amount: '45000', unit: 'COP/viaje', cost_group: 'otros' });
  }
  // Estructura por defecto del país: cobra a las flotas propias sin estructura propia.
  const dflt = `CSTR_${C}_DEFAULT`;
  work.costStructures.push({
    id: dflt, party_id: null, country_id: C, name: `Costos de flota propia — por defecto (${C})`, operating_days_per_month: 30,
    params: { kmPerYear: 48000, fuelPrice: null, fuelEfficiency: {} }, effective_from: '2026-01-01T00:00:00.000Z', active: true, notes: 'Respaldo del país.',
  });
  costRowF(dflt, { code: 'CONDUCTOR', label: 'Conductor', driver: 'PER_MONTH_PRORATED', amount: String(fx(cc, 710, 3350000)), unit: `${cc.currency}/mes`, cost_group: 'conductor' });
  costRowF(dflt, { code: 'COSTO_KM', label: 'Combustible y mantenimiento por km', driver: 'PER_KM', amount: String(fx(cc, 0.19, 1430)), unit: `${cc.currency}/km`, cost_group: 'mantenimiento' });
}

// ── Viajes de VE y CO, con guías y pedidos ────────────────────────────────────────────────────
interface FTrip { date: string; zone: string; carrier: string; plate: string; guides: number; kind?: 'ok' | 'incomplete' | 'planned' | 'progress' | 'cancelled' | 'nocarrier' | 'overnight' | 'nozone' | 'zonenull'; delivered?: number; service?: string; tag?: string }
const F_SPECS: Record<'VE' | 'CO', FTrip[]> = {
  VE: [
    { date: '2026-09-01', zone: 'CAR', carrier: 'OWN', plate: 'AB123CD', guides: 14, tag: 'L-VE-OWN' },
    { date: '2026-09-02', zone: 'CAR', carrier: 'ANDINA', plate: 'TA101AA', guides: 12, tag: 'L-VE-AND' },
    { date: '2026-09-03', zone: 'CCS', carrier: 'ANDINA', plate: 'TA202BB', guides: 16, tag: 'L-VE-AND2' },
    { date: '2026-09-04', zone: 'ZUL', carrier: 'OWN', plate: 'AD789GH', guides: 12, kind: 'overnight', tag: 'L-VE-OWN2' },
    { date: '2026-09-07', zone: 'LAR', carrier: 'CENTRO', plate: 'LC303CC', guides: 9, tag: 'L-VE-LC' },
    { date: '2026-09-08', zone: 'ANZ', carrier: 'CENTRO', plate: 'LC303CC', guides: 10, kind: 'overnight' },
    { date: '2026-09-09', zone: 'TAC', carrier: 'ANDINA', plate: 'TA101AA', guides: 11, kind: 'overnight' },
    { date: '2026-09-10', zone: 'CAR', carrier: 'ORINOCO', plate: 'FO404DD', guides: 8 },
    { date: '2026-09-14', zone: 'BOL', carrier: 'CENTRO', plate: 'LC303CC', guides: 9, kind: 'overnight' },
    { date: '2026-09-15', zone: 'CCS', carrier: 'OWN', plate: 'AC456EF', guides: 15 },
    { date: '2026-09-16', zone: 'CAR', carrier: 'ANDINA', plate: 'TA101AA', guides: 13 },
    { date: '2026-09-22', zone: 'LAR', carrier: 'ANDINA', plate: 'TA202BB', guides: 10, kind: 'incomplete', delivered: 7 },
    { date: '2026-09-24', zone: 'CAR', carrier: 'LLANOS', plate: 'TL505EE', guides: 6 },
    { date: '2026-10-04', zone: 'CCS', carrier: 'OWN', plate: 'AB123CD', guides: 10 }, // domingo
    { date: '2026-10-07', zone: 'SIN_ZONA', carrier: 'ORINOCO', plate: 'FO404DD', guides: 5, kind: 'nozone' },
    { date: '2026-10-06', zone: 'CAR', carrier: 'ANDINA', plate: 'TA101AA', guides: 6, kind: 'zonenull' },
    { date: '2026-10-08', zone: 'ZUL', carrier: 'ANDINA', plate: 'TA202BB', guides: 9, kind: 'progress', delivered: 4 },
    { date: '2026-10-08', zone: 'CAR', carrier: 'OWN', plate: 'AB123CD', guides: 8, kind: 'nocarrier' },
    { date: '2026-10-09', zone: 'CCS', carrier: 'ANDINA', plate: 'TA101AA', guides: 7, kind: 'cancelled' },
    { date: '2026-10-12', zone: 'CAR', carrier: 'OWN', plate: 'AC456EF', guides: 12, kind: 'planned' },
  ],
  CO: [
    { date: '2026-09-05', zone: 'MED', carrier: 'CAUCA', plate: 'TCA101', guides: 12, tag: 'L-CO-CAU' },
    { date: '2026-09-08', zone: 'CLO', carrier: 'CAUCA', plate: 'TCB202', guides: 11, kind: 'overnight' },
    { date: '2026-09-10', zone: 'BOG', carrier: 'OWN', plate: 'SXA123', guides: 14, tag: 'L-CO-OWN' },
    { date: '2026-09-14', zone: 'BAQ', carrier: 'OWN', plate: 'SXB456', guides: 9, kind: 'overnight' },
    { date: '2026-09-17', zone: 'BGA', carrier: 'ANDINACARGO', plate: 'ACG303', guides: 10 },
    { date: '2026-09-21', zone: 'MED', carrier: 'ANDINACARGO', plate: 'ACG303', guides: 13 },
    { date: '2026-09-28', zone: 'BAQ', carrier: 'CARIBE', plate: 'FCB404', guides: 8, kind: 'overnight' },
    { date: '2026-10-02', zone: 'MED', carrier: 'CAUCA', plate: 'TCA101', guides: 12, kind: 'incomplete', delivered: 9 },
    { date: '2026-10-06', zone: 'BOG', carrier: 'OWN', plate: 'SXA123', guides: 12 },
    { date: '2026-10-05', zone: 'MED', carrier: 'CAUCA', plate: 'TCA101', guides: 6, kind: 'zonenull' },
    { date: '2026-10-09', zone: 'CLO', carrier: 'CAUCA', plate: 'TCB202', guides: 9, kind: 'progress', delivered: 3 },
    { date: '2026-10-13', zone: 'MED', carrier: 'OWN', plate: 'SXA123', guides: 10, kind: 'planned' },
  ],
};

for (const cc of VE_CO) {
  const C = cc.id;
  let seq = 0; let gSeq = 0;
  for (const spec of F_SPECS[C]) {
    seq += 1;
    const kind = spec.kind ?? 'ok';
    const carrierSpec = cc.carriers.find((c) => c.key === spec.carrier)!;
    const vehicleRow = work.vehicles.find((v) => v.id === `VEH_${C}_${spec.carrier}_${spec.plate}`)!;
    const driverRow = work.drivers.find((d) => d.carrier_id === `CAR_${C}_${spec.carrier}`)!;
    const zoneRow = work.zones.find((z) => z.id === `Z_${C}_${spec.zone}`)!;
    const zdef = cc.zones.find((z) => z[0] === spec.zone);
    const km = zdef ? Math.round(zdef[2] * 2 * between(0.95, 1.06)) : Math.round(between(60, 120));
    const id = `TRIP_${C}_${String(seq).padStart(3, '0')}`;
    if (spec.tag) tripIdByTag.set(spec.tag, id);
    const status = kind === 'planned' ? 'planned' : kind === 'progress' ? 'in_progress' : kind === 'cancelled' ? 'cancelled' : 'completed';
    const guideCount = spec.guides;
    const delivered = kind === 'incomplete' || kind === 'progress' ? spec.delivered ?? Math.floor(guideCount * 0.6) : status === 'completed' ? guideCount : 0;
    const hours = status === 'completed' || status === 'in_progress' ? (kind === 'overnight' ? between(28, 36) : Math.min(11, 2.5 + km / 60 + guideCount * 0.12)) : 0;
    const dt = new Date(`${spec.date}T12:00:00.000Z`);
    const start = new Date(dt); start.setUTCHours(11, intBetween(0, 50), 0, 0);
    const end = new Date(start.getTime() + hours * 3600_000);
    const capKg = Number(vehicleRow.capacity_weight);
    const rawW = Array.from({ length: guideCount }, () => between(60, 320));
    const scale = Math.min(1, (capKg * between(0.5, 0.9)) / rawW.reduce((a, b) => a + b, 0));
    let totalKg = 0; let totalM3 = 0;
    const noCarrier = kind === 'nocarrier';
    for (let i = 0; i < guideCount; i += 1) {
      gSeq += 1;
      const customer = pick(cc.customers);
      const kg = Math.round(rawW[i] * scale);
      const m3 = Math.round((kg / 190) * 100) / 100;
      totalKg += kg; totalM3 += m3;
      const isDelivered = (status === 'completed' || status === 'in_progress') && i < delivered;
      const deliveryStatus = status === 'cancelled' ? 'pending' : isDelivered ? 'delivered' : status === 'completed' ? 'failed' : 'pending';
      const guideNumber = `GD-${C}-${String(seq * 100 + gSeq).padStart(6, '0')}`;
      work.dispatchGuides.push({
        id: `DG_${C}_${seq}_${i + 1}`, route_id: id, guide_number: guideNumber, sequence_number: i + 1, status: isDelivered ? 'completed' : 'pending',
        delivery_status: deliveryStatus, recipient_name: pick(customer.stores),
        actual_arrival_time: isDelivered ? new Date(start.getTime() + ((i + 1) / guideCount) * hours * 3600_000).toISOString() : null,
      });
      work.tripOrders.push({
        id: `TORD_${C}_${seq}_${i + 1}`, route_id: id, guide_number: guideNumber, sequence_number: i + 1, delivery_status: deliveryStatus,
        order_id: `ORD_${C}_${seq}_${i + 1}`, order_number: `PED-${C}${String(200000 + seq * 100 + i)}`, customer_id: customer.id, customer_code: customer.code, customer_name: customer.name,
        value: money(fx(cc, between(900, 7500), between(1_200_000, 9_500_000))), weight_kg: kg, volume_m3: m3, items: intBetween(2, 24), mark: null, mark_reason: null,
      });
    }
    work.trips.push({
      id, country_id: C, route_number: `${C}-${spec.date.replace(/-/g, '')}-${spec.zone === 'SIN_ZONA' ? 'XX' : spec.zone}-${String(seq).padStart(2, '0')}`, route_date: spec.date, status,
      carrier_id: noCarrier ? null : `CAR_${C}_${spec.carrier}`, carrier_name: noCarrier ? null : carrierSpec.name, is_flota_propia: noCarrier ? null : !!carrierSpec.own,
      driver_id: noCarrier ? null : driverRow.id, driver_name: noCarrier ? null : driverRow.full_name, driver_document: noCarrier ? null : driverRow.document,
      vehicle_id: noCarrier ? null : vehicleRow.id, vehicle_plate: noCarrier ? null : vehicleRow.plate, vehicle_type: noCarrier ? null : vehicleRow.vehicle_type,
      capacity_weight: noCarrier ? null : vehicleRow.capacity_weight, capacity_volume: noCarrier ? null : vehicleRow.capacity_volume,
      dest_zone_id: kind === 'zonenull' ? null : zoneRow.id, dest_zone_code: kind === 'zonenull' ? null : zoneRow.code, dest_zone_name: kind === 'zonenull' ? null : zoneRow.name,
      total_distance: String(km), total_stops: guideCount, completed_stops: delivered, total_weight: String(totalKg), total_volume: totalM3.toFixed(2),
      actual_start_time: status === 'planned' || status === 'cancelled' ? null : start.toISOString(), actual_end_time: status === 'completed' ? end.toISOString() : null,
      duration_hours: status === 'completed' ? hours.toFixed(2) : null, guide_count: guideCount, delivered_guides: delivered,
      return_count: 0, settlement_id: null,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Ids uuid
// En Aurora los ids de países, zonas, transportistas, conductores, vehículos, viajes, guías y pedidos
// son uuid, y toda columna que los referencia también. El generador arma la semilla con ids legibles
// (`TRIP_CR_042`) y, antes de emitir liquidaciones, los cambia por uuid determinista en cada columna uuid
// del registro de esquema. Así el backend simulado (que castea como Postgres) acepta la semilla.
// ════════════════════════════════════════════════════════════════════════════════════════════════
function uuidOf(key: string): string {
  const h = createHash('sha1').update(`tarifas-demo:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function remapToUuids(): Map<string, string> {
  const rowsOf = (name: (typeof ENTITY_NAMES)[number]) => (work as unknown as Record<string, Row[]>)[entityDef(name).collection];
  const idMap = new Map<string, string>();
  for (const name of ENTITY_NAMES) {
    const pk = primaryKeyOf(name);
    if (entityDef(name).columns[pk].type !== 'uuid') continue;
    for (const row of rowsOf(name)) {
      const old = String(row[pk]);
      const country = name === 'country' ? (MOCK_COUNTRY_IDS as Record<string, string>)[old] : undefined;
      idMap.set(old, country ?? uuidOf(old));
    }
  }
  for (const name of ENTITY_NAMES) {
    const uuidColumns = Object.entries(entityDef(name).columns).filter(([, c]) => c.type === 'uuid').map(([k]) => k);
    for (const row of rowsOf(name)) {
      for (const column of uuidColumns) {
        const value = row[column];
        if (typeof value !== 'string') continue;
        // Una columna uuid que no es llave de ninguna entidad (p. ej. `order_id`, el pedido del WMS) también cambia.
        if (!idMap.has(value) && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value)) idMap.set(value, uuidOf(value));
        if (idMap.has(value)) row[column] = idMap.get(value);
      }
    }
  }
  // Las plantillas del Probador guardan zonas dentro del JSON del viaje.
  for (const template of work.pricingTemplates) {
    for (const key of ['originLocationId', 'destLocationId']) {
      const value = template.trip?.[key];
      if (typeof value === 'string' && idMap.has(value)) template.trip[key] = idMap.get(value);
    }
  }
  for (const [tag, id] of tripIdByTag) tripIdByTag.set(tag, idMap.get(id) ?? id);
  return idMap;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Liquidaciones y marcas, con el motor real
// ════════════════════════════════════════════════════════════════════════════════════════════════
async function main() {
  // La bitácora anota el correo de la sesión del TMS (localStorage); en Node no hay, así que se simula.
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (k === 'tms_session' ? JSON.stringify({ user: { email: 'jaraujo@intelix.biz' } }) : null),
    setItem: () => undefined, removeItem: () => undefined,
  };
  setActorRole('Administrador');
  const idMap = remapToUuids();
  const CR_ID = idMap.get(CR)!;
  setSeed(work);
  setDataSource(new MemoryDataSource());

  const toInput = (c: Extract<Awaited<ReturnType<typeof calculateTrip>>, { status: 'ok' }>['calculation'], edits: TripEdits, notes: string | null): SettlementInput => ({
    trip: c.trip, partyId: c.partyId, edits, status: 'Borrador', notes, marginReason: null, context: c.context, calc: c.result,
    totalAmount: c.result.totalLiquidado,
    // Lo mismo que arma LiquidarViajeModal al emitir.
    rulesUsed: c.input.rules.filter((r) => c.result.trace.some((l) => l.ruleId === r.id)),
    orders: c.orders.length > 0 ? snapshotOrders(c.orders) : null,
  });

  async function liquidar(tag: string, edits: TripEdits, status: Parameters<typeof updateSettlementStatus>[1], notes: string | null = null) {
    const id = tripIdByTag.get(tag)!;
    const r = await calculateTrip(id, edits);
    if (r.status !== 'ok') throw new Error(`${tag}: ${r.status}`);
    const emitted = await emitSettlement(toInput(r.calculation, edits, notes));
    if (emitted.status !== 'saved') throw new Error(`${tag}: ${JSON.stringify(emitted)}`);
    if (status !== 'Borrador') {
      const u = await updateSettlementStatus(emitted.settlement.id, status);
      if (u.error) throw new Error(`${tag} → ${status}: ${JSON.stringify(u.error)}`);
    }
    return { id, settlement: emitted.settlement, calculation: r.calculation };
  }

  // Marcas de pedido: uno anulado y otro diferido en el viaje de Transosa.
  {
    const id = tripIdByTag.get('L-TRA-1')!;
    const pedidos = await listTripOrders(id);
    await setOrderMark({ trip: { id, countryId: CR_ID }, orderId: String(pedidos[1].orderId), mark: 'ANULADO', reason: 'Cliente rechazó el pedido: dirección incorrecta.' });
    await setOrderMark({ trip: { id, countryId: CR_ID }, orderId: String(pedidos[3].orderId), mark: 'DIFERIDO', reason: 'Se entrega en el próximo viaje a Alajuela.' });
  }

  await liquidar('L-OLO-1', { customVars: { 'custom:con_ayudante': 1, 'custom:monto_peajes': 0 } }, 'Pagado', 'Liquidación mensual de agosto.');
  await liquidar('L-URE-1', { customVars: { 'custom:horas_espera': 2 } }, 'Pagado');
  await liquidar('L-TRA-1', { customVars: { 'custom:recolectas': 2, 'custom:peones': 1 } }, 'Aprobado', 'Pedidos 2 y 4 con marca (ver detalle).');
  await liquidar('L-HER-1', { customVars: { 'custom:minutos_atraso': 35 } }, 'En Revisión', 'Atraso de 35 min por cierre de ruta 1.');
  await liquidar('L-ACU-1', { customVars: { 'custom:zona_riesgo': 'ALTA', 'custom:incidencias': 2 } }, 'Aprobado');
  await liquidar('L-TMJ-1', { customVars: { 'custom:refrigeracion_horas': 5 } }, 'Borrador', 'Pendiente de revisar el tiempo de refrigeración.');
  // Re-liquidación: la primera se anula y apunta a la segunda.
  const primera = await liquidar('L-OLO-2', { customVars: { 'custom:con_ayudante': 0 } }, 'Borrador');
  {
    const edits: TripEdits = { customVars: { 'custom:con_ayudante': 1 } };
    const r = await calculateTrip(primera.id, edits, { allowSettled: true });
    if (r.status !== 'ok') throw new Error(`re-liquidar: ${r.status}`);
    const again = await reliquidateSettlement(primera.settlement.id, toInput(r.calculation, edits, 'Se corrigió: el viaje sí llevó ayudante.'), 'El viaje llevó ayudante y no se había declarado.');
    if (again.status !== 'saved') throw new Error(`re-liquidar: ${JSON.stringify(again)}`);
    await updateSettlementStatus(again.settlement.id, 'En Revisión');
  }

  // Venezuela y Colombia: una liquidación por estado de interés, con variables por viaje.
  await liquidar('L-VE-OWN', { customVars: { 'custom:con_ayudante': 1 } }, 'Pagado', 'Flota propia: costo de la estructura 2026.');
  await liquidar('L-VE-AND', { customVars: { 'custom:bultos': 120 } }, 'Aprobado');
  await liquidar('L-VE-AND2', { customVars: { 'custom:minutos_atraso': 45 } }, 'En Revisión', 'Atraso por cola en el peaje de Tazajal.');
  await liquidar('L-VE-OWN2', { customVars: { 'custom:con_ayudante': 1 } }, 'Borrador');
  await liquidar('L-VE-LC', { customVars: { 'custom:horas_espera': 3 } }, 'Borrador');
  await liquidar('L-CO-CAU', { customVars: { 'custom:material_averiado': 2 } }, 'Aprobado', 'Dos unidades averiadas descontadas.');
  await liquidar('L-CO-OWN', { customVars: {} }, 'Pagado');

  // Todos los viajes por liquidar deben calcular sin errores de configuración.
  const problemas: string[] = [];
  for (const t of work.trips.filter((x) => x.status === 'completed' && x.carrier_id && x.dest_zone_id)) {
    const r = await calculateTrip(String(t.id), { customVars: {} }, { allowSettled: true });
    if (r.status !== 'ok') { problemas.push(`${t.route_number}: ${r.status} ${'message' in r ? r.message : ''}`); continue; }
    const c = r.calculation;
    if (c.blockingIssues.length) problemas.push(`${t.route_number}: BLOQUEA ${c.blockingIssues.map((i) => i.message).join(' | ')}`);
  }
  if (problemas.length) console.warn(`\n⚠ ${problemas.length} viajes con problemas:\n${problemas.join('\n')}`);

  // ── Escritura: una fila por línea, para que los diffs sean legibles ────────────────────────────
  // `setSeed` clona: lo emitido por el motor vive en el almacén, no en `work`.
  const finalDb = loadDatabase();
  const keys = Object.keys(work) as (keyof TarifasDatabase)[];
  const body = keys.map((k) => `"${k}": [\n${(finalDb[k] as Row[]).map((row) => JSON.stringify(row)).join(',\n')}\n]`).join(',\n');
  writeFileSync(SEED_OUT, `{\n${body}\n}\n`);

  const resumen = keys.map((k) => `${k}=${(finalDb[k] as Row[]).length}`).join('  ');
  console.log(`seed.demo.json escrito\n${resumen}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
