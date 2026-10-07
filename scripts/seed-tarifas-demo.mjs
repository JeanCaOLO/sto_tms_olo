// Datos de PRUEBA del tarifador (módulo Tarifas): reglas por flota y país, tarifarios y variables
// personalizadas de las flotas terciarias, y estructura de costos de flota propia donde falta.
//
// Solo escribe tablas `tarifas_*` (sin DDL, sin tocar carriers/zones/countries). Idempotente:
// ids fijos `TEST_*` + ON CONFLICT DO NOTHING. `--reset` borra únicamente lo `TEST_*`.
//
// Uso (túnel Aurora arriba, ver scripts/tunel-aurora.ps1):
//   node --env-file=.env.local scripts/seed-tarifas-demo.mjs                (dry-run: ROLLBACK)
//   node --env-file=.env.local scripts/seed-tarifas-demo.mjs --execute      (aplica)
//   node --env-file=.env.local scripts/seed-tarifas-demo.mjs --reset --execute   (borra lo TEST_*)
//
// Formas de datos: src/lib/tarifas/types.ts (Pred, Expr, CostStructureRow). Montos de CR en
// colones, los de Venezuela (country code 'VN' en el catálogo) en USD.

import pg from 'pg';

const execute = process.argv.includes('--execute');
const reset = process.argv.includes('--reset');

const pool = new pg.Pool({
  host: process.env.TMS_DB_HOST || 'localhost',
  port: Number(process.env.TMS_DB_PORT) || 5432,
  user: process.env.TMS_DB_USER,
  password: process.env.TMS_DB_PASSWORD,
  database: process.env.TMS_DB_NAME || 'tms_olo',
  ssl: { rejectUnauthorized: false },
});

// ── Helpers de forma ────────────────────────────────────────────────────────────────────────
const J = (v) => JSON.stringify(v);
const EQ = (left, right) => ({ p: 'EQ', left, right });
const GT = (left, right) => ({ p: 'GT', left, right });
const GTE = (left, right) => ({ p: 'GTE', left, right });
const IN = (left, values) => ({ p: 'IN', left, values });
const AND = (...args) => ({ p: 'AND', args });
const ALWAYS = { p: 'ALWAYS' };
const FIXED = (amount) => ({ op: 'FIXED', amount: String(amount) });
const PER_KM = (rate) => ({ op: 'PER_KM', rate: String(rate) });
const PER_UNIT = (unit, rate) => ({ op: 'PER_UNIT', unit, rate: String(rate) });
const PER_BLOCK = (unit, blockSize, amount) => ({ op: 'PER_BLOCK', unit, blockSize, amount: String(amount) });
const PERCENT = (pct, of = 'RUNNING_SUBTOTAL') => ({ op: 'PERCENT', pct: String(pct), base: { of } });
const TIERED = (unit, mode, tiers) => ({ op: 'TIERED', unit, mode, tiers: tiers.map(([upTo, amount]) => ({ upTo, amount: String(amount) })) });
const LOOKUP = (table, fallback, column) => ({ op: 'LOOKUP_TABLE', table, ...(column ? { column } : {}), fallback });
const CLAMP = (value, max) => ({ op: 'CLAMP', value, max: String(max) });

const OWN = EQ('fleetType', 'OWN');
const OUT = EQ('fleetType', 'OUTSOURCED');
const FIN_SEMANA = IN('weekday', [0, 6]);

/** Regla: [code, name, stage, priority, stacking, conditions, expression, description, extra]. */
const rule = (code, name, stage, priority, stacking, conditions, expression, description, extra = {}) => ({
  code, name, stage, priority, stacking, conditions, expression, description, ...extra,
});
const dec = { effect: 'DECREASE' };

// ── Costa Rica ──────────────────────────────────────────────────────────────────────────────
const ZONES_CR = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '15', '16', 'GAM', 'RURAL'];
const BASE_LIVIANO = {
  '01': 28000, '02': 30000, '03': 30000, '04': 38000, '05': 36000, '06': 40000, '07': 45000, '08': 62000,
  '09': 95000, '10': 105000, '11': 98000, '12': 120000, '13': 78000, '15': 55000, '16': 58000, GAM: 32000, RURAL: 52000,
};
const TRUCKS = { 'Camión pequeño': 0.85, 'Camión liviano': 1, 'Camión pesado': 1.45 };
const money = (n) => String(Math.round(n));

/** Filas de tarifario flete destZone × camión (factor del transportista). */
const zoneTruckRows = (factor, zones = ZONES_CR, trucks = Object.keys(TRUCKS)) =>
  zones.flatMap((z) => trucks.map((t) => ({ key: [z, t], amount: money(BASE_LIVIANO[z] * TRUCKS[t] * factor) })));
const zoneRows = (factor, zones = ZONES_CR) => zones.map((z) => ({ key: [z], amount: money(BASE_LIVIANO[z] * factor) }));

const COUNTRY_RULES_CR = [
  // Flota propia: la base sale de la estructura de costos; estas reglas son ajustes.
  rule('OWN_BONO_ENTREGAS', 'Bono por entregas (propia)', 'ADJUSTMENT', 20, 'SUM', AND(OWN, GTE('clientCount', 15)), PER_UNIT('clientCount', 200), 'Incentivo al conductor desde 15 paradas completadas.'),
  rule('OWN_PERNOCTA', 'Viáticos por pernocta (propia)', 'SURCHARGE', 30, 'SUM', AND(OWN, GT('overnightNights', 0)), PER_UNIT('overnightNights', 15000), 'Alimentación y hospedaje por noche fuera de base.'),
  rule('OWN_FIN_SEMANA', 'Recargo fin de semana (propia)', 'MODIFIER', 20, 'SUM', AND(OWN, FIN_SEMANA), PERCENT('0.10'), '10 % sobre el subtotal en sábado o domingo.'),
  rule('OWN_ZONA_LEJANA', 'Recargo zona lejana (propia)', 'SURCHARGE', 40, 'SUM', AND(OWN, IN('destZone', ['09', '10', '11', '12', '13'])), FIXED(18000), 'Destinos de Limón, Guanacaste, Zona Sur y Puntarenas.'),
  // Terceros: respaldo por km (los tarifarios de cada compañía lo reemplazan con el mismo código).
  rule('BASE_FLETE', 'Flete base (respaldo por km)', 'BASE', 100, 'EXCLUSIVE', OUT, PER_KM(520), 'Si la compañía no tiene flete propio, se paga por km recorrido.'),
  rule('PERNOCTA_TERC', 'Pernocta (terceros)', 'SURCHARGE', 30, 'SUM', AND(OUT, GT('overnightNights', 0)), PER_UNIT('overnightNights', 22000), 'Noche fuera de base del transportista.'),
  rule('FIN_SEMANA_TERC', 'Recargo fin de semana (terceros)', 'MODIFIER', 20, 'SUM', AND(OUT, FIN_SEMANA), PERCENT('0.12'), '12 % sobre el subtotal en sábado o domingo.'),
  rule('PESO_ESCALON_TERC', 'Escalón por peso (terceros)', 'SURCHARGE', 50, 'SUM', OUT, TIERED('weightKg', 'FLAT', [[2000, 0], [5000, 8000], [null, 18000]]), 'Cargas pesadas pagan un escalón fijo.'),
];

const PARTY_RULES_CR = {
  OLO: [
    rule('OWN_PERNOCTA', 'Viáticos por pernocta OLO', 'SURCHARGE', 30, 'SUM', GT('overnightNights', 0), PER_UNIT('overnightNights', 19500), 'Viático propio de OLO: reemplaza el valor general de flota propia.'),
    rule('OLO_HORAS_EXTRA', 'Jornada extendida', 'SURCHARGE', 45, 'SUM', GT('durationHours', 10), FIXED(15000), 'Viajes de más de 10 horas.'),
  ],
  'Edison Miguel Ureña Ureña': [
    rule('BASE_FLETE', 'Flete por zona y camión', 'BASE', 10, 'EXCLUSIVE', ALWAYS, LOOKUP('FLETE_CAMION_ZONA', PER_KM(540)), 'Tarifario zona × tipo de camión; sin fila, cae a km.'),
    rule('ESPERA', 'Horas de espera', 'SURCHARGE', 40, 'SUM', GT('custom:horas_espera', 0), PER_UNIT('custom:horas_espera', 3500), 'Cobro por hora de espera en cliente.'),
    rule('SEGURO_CARGA', 'Cuota seguro de carga', 'SURCHARGE', 45, 'SUM', ALWAYS, PER_UNIT('custom:cuota_seguro', 1), 'Monto fijo por viaje (variable constante de la compañía).'),
    rule('DESC_VOLUMEN', 'Descuento por volumen', 'ADJUSTMENT', 20, 'SUM', GT('clientCount', 25), PERCENT('-0.03'), '3 % menos desde 25 paradas.', dec),
  ],
  'Inversiones Acuña y Salazar del Caribe S.R.L.': [
    rule('BASE_FLETE', 'Flete por zona (Caribe)', 'BASE', 10, 'EXCLUSIVE', ALWAYS, LOOKUP('FLETE_ZONA', PER_KM(560)), 'Tarifario por zona de destino.'),
    rule('PEAJES', 'Reembolso de peajes', 'SURCHARGE', 50, 'SUM', GT('custom:peajes', 0), PER_UNIT('custom:peajes', 1), 'Peajes pagados por el transportista, a costo.'),
    rule('FERRY', 'Cruce en ferry', 'SURCHARGE', 51, 'SUM', GT('custom:cruce_ferry', 0), PER_UNIT('custom:cruce_ferry', 1), 'Costo del ferry a costo.'),
    rule('LIMON_BONO', 'Bono ruta Limón', 'MODIFIER', 15, 'SUM', EQ('destZone', '09'), FIXED(15000), 'Compensa la carretera a Limón.'),
    rule('PROMO_Q4', 'Descuento temporada Q4', 'ADJUSTMENT', 25, 'SUM', ALWAYS, PERCENT('-0.02'), 'Promoción con vigencia.', { ...dec, effective_from: '2026-10-01', effective_to: '2026-12-31' }),
  ],
  'Javier Martín Ulloa Serrano': [
    rule('BASE_FLETE', 'Flete por camión y tramo km', 'BASE', 10, 'EXCLUSIVE', ALWAYS, LOOKUP('FLETE_CAMION_KM', PER_KM(600)), 'Tarifario camión × rango de km.'),
    rule('AYUDANTES', 'Ayudantes adicionales', 'SURCHARGE', 40, 'SUM', GT('custom:ayudantes', 0), PER_UNIT('custom:ayudantes', 12000), 'Por ayudante en el viaje.'),
    rule('CUOTA_ADMIN', 'Cuota administrativa', 'SURCHARGE', 46, 'SUM', ALWAYS, PER_UNIT('custom:cuota_administrativa', 1), 'Monto fijo por viaje.'),
    rule('PESO_ESCALON', 'Escalón por peso', 'SURCHARGE', 50, 'SUM', ALWAYS, TIERED('weightKg', 'FLAT', [[1500, 0], [4000, 6000], [null, 14000]]), 'Cargas pesadas.'),
    rule('FIN_SEMANA', 'Fin de semana', 'MODIFIER', 20, 'SUM', FIN_SEMANA, PERCENT('0.15'), '15 % sábado/domingo.'),
  ],
  'Luis Carlos Martín Mora Castillo': [
    rule('BASE_FLETE', 'Flete GAM + respaldo', 'BASE', 10, 'EXCLUSIVE', ALWAYS, LOOKUP('FLETE_ZONA', PER_KM(500)), 'Tarifario del Gran Área; resto por km.'),
    rule('DESCARGAS', 'Descargas difíciles', 'SURCHARGE', 40, 'SUM', GT('custom:descargas_dificiles', 0), PER_UNIT('custom:descargas_dificiles', 4500), 'Escaleras, sin rampa, etc.'),
    rule('REFRIGERADO', 'Carga refrigerada', 'SURCHARGE', 45, 'SUM', EQ('custom:tipo_carga', 'REFRIGERADA'), FIXED(22000), 'Recargo por equipo de frío.'),
    rule('KM_LARGO', 'Bloques de 100 km', 'VARIABLE', 30, 'SUM', GT('km', 100), PER_BLOCK('km', 100, 6000), 'Cada 100 km completos sobre el flete.'),
  ],
  'María Jiménez Ramírez': [
    rule('BASE_FLETE', 'Flete por zona (columna flete)', 'BASE', 10, 'EXCLUSIVE', ALWAYS, LOOKUP('FLETE_ZONA_COLS', PER_KM(520), 'flete'), 'Lee la columna "flete" del tarifario.'),
    rule('RECARGO_RURAL', 'Recargo rural', 'SURCHARGE', 35, 'SUM', IN('destZone', ['RURAL', '08', '15', '16']), LOOKUP('FLETE_ZONA_COLS', FIXED(0), 'recargo_rural'), 'Lee la columna "recargo_rural".'),
    rule('PEAJES', 'Peajes a costo', 'SURCHARGE', 50, 'SUM', GT('custom:peajes', 0), PER_UNIT('custom:peajes', 1), 'Reembolso.'),
    rule('RECOLECTAS', 'Recolectas', 'SURCHARGE', 42, 'SUM', GT('custom:recolectas', 0), PER_UNIT('custom:recolectas', 6500), 'Paradas de recolección.'),
    rule('PROMO_NOVIEMBRE', 'Promo de noviembre', 'ADJUSTMENT', 25, 'SUM', ALWAYS, FIXED(-5000), 'Descuento fijo con vigencia.', { ...dec, effective_from: '2026-11-01', effective_to: '2026-11-30' }),
  ],
  'Pedro Hernández Castro': [
    rule('BASE_FLETE', 'Flete zona × camión', 'BASE', 10, 'EXCLUSIVE', ALWAYS, LOOKUP('FLETE_CAMION_ZONA', PER_KM(530)), 'Solo pequeño y liviano: el pesado cae al respaldo por km.'),
    rule('ESPERA', 'Horas de espera', 'SURCHARGE', 40, 'SUM', GT('custom:horas_espera', 0), PER_UNIT('custom:horas_espera', 3000), 'Por hora.'),
    rule('BULTOS', 'Manejo de bultos (tope)', 'VARIABLE', 30, 'SUM', GT('custom:bultos', 0), CLAMP(PER_UNIT('custom:bultos', 150), 30000), '150 por bulto, máximo 30 000.'),
  ],
  Transmajori: [
    rule('BASE_FLETE', 'Flete por camión', 'BASE', 10, 'EXCLUSIVE', ALWAYS, LOOKUP('FLETE_CAMION', PER_KM(580)), 'Tarifa plana por tipo de camión.'),
    rule('RECARGO_ZONA', 'Recargo por zona', 'SURCHARGE', 35, 'SUM', ALWAYS, LOOKUP('RECARGO_ZONA', FIXED(0)), 'Recargo por zona de destino (si existe).'),
    rule('RECOLECTAS', 'Recolectas', 'SURCHARGE', 42, 'SUM', GT('custom:recolectas', 0), PER_UNIT('custom:recolectas', 7000), 'Por parada de recolección.'),
    rule('REFRIGERACION', 'Refrigeración (tope)', 'SURCHARGE', 45, 'SUM', EQ('custom:tipo_carga', 'REFRIGERADA'), CLAMP(PER_UNIT('custom:refrigeracion_horas', 1800), 14400), 'Por hora de frío, tope 8 h.'),
    rule('URGENCIA_FDS', 'Urgencia (fin de semana)', 'SURCHARGE', 60, 'MAX', FIN_SEMANA, FIXED(15000), 'Compite con urgencia nocturna: gana la mayor.', { exclusion_group: 'urgencia' }),
    rule('URGENCIA_NOCHE', 'Urgencia (jornada larga)', 'SURCHARGE', 61, 'MAX', GT('durationHours', 9), FIXED(10000), 'Compite con fin de semana: gana la mayor.', { exclusion_group: 'urgencia' }),
  ],
  'Transosa de Alajuela S.A.': [
    rule('BASE_FLETE', 'Flete matriz zona × camión', 'BASE', 10, 'EXCLUSIVE', ALWAYS, LOOKUP('FLETE_CAMION_ZONA', PER_KM(480)), 'Matriz completa; sin fila, paga por km.'),
    rule('KM_LARGO', 'Escalón por km', 'VARIABLE', 30, 'SUM', ALWAYS, TIERED('km', 'FLAT', [[100, 0], [250, 12000], [null, 30000]]), 'Viajes largos pagan un escalón.'),
    rule('AYUDANTES', 'Ayudantes', 'SURCHARGE', 40, 'SUM', GT('custom:ayudantes', 0), PER_UNIT('custom:ayudantes', 11000), 'Por ayudante.'),
    rule('PEAJES', 'Peajes a costo', 'SURCHARGE', 50, 'SUM', GT('custom:peajes', 0), PER_UNIT('custom:peajes', 1), 'Reembolso.'),
    rule('ESPERA', 'Horas de espera', 'SURCHARGE', 41, 'SUM', GT('custom:horas_espera', 0), PER_UNIT('custom:horas_espera', 3200), 'Por hora.'),
    rule('CLIENTE_PRIORITARIO', 'Cliente prioritario', 'MODIFIER', 25, 'SUM', EQ('custom:cliente_prioritario', 1), PERCENT('0.05'), '5 % extra por ventana de entrega estricta.'),
    rule('DESC_VOLUMEN', 'Descuento por volumen', 'ADJUSTMENT', 20, 'SUM', GT('clientCount', 40), PERCENT('-0.05'), '5 % menos desde 40 paradas.', dec),
  ],
};

// Tarifarios (solo terciarias): [code, name, key_columns, value_columns|null, rows]
const TABLES_CR = {
  'Edison Miguel Ureña Ureña': [
    ['FLETE_CAMION_ZONA', 'Flete zona × camión (Edison)', ['destZone', 'truckTypeId'], null,
      [...zoneTruckRows(0.95, ZONES_CR.filter((z) => z !== 'RURAL')), ...Object.keys(TRUCKS).map((t) => ({ key: ['*', t], amount: money(60000 * TRUCKS[t]) }))]],
  ],
  'Inversiones Acuña y Salazar del Caribe S.R.L.': [
    ['FLETE_ZONA', 'Flete por zona Caribe', ['destZone'], null,
      [...zoneRows(1.1).map((r) => (['09', '06', '15', '16'].includes(r.key[0]) ? { ...r, amount: money(Number(r.amount) * 0.85) } : r)), { key: ['*'], amount: '60000' }]],
  ],
  'Javier Martín Ulloa Serrano': [
    ['FLETE_CAMION_KM', 'Flete camión × tramo km', ['truckTypeId', 'km'], null,
      Object.keys(TRUCKS).flatMap((t) => [['0..50', 30000], ['51..150', 52000], ['151..300', 88000], ['301..', 140000]].map(([range, base]) => ({ key: [t, range], amount: money(base * TRUCKS[t]) })))],
  ],
  'Luis Carlos Martín Mora Castillo': [
    ['FLETE_ZONA', 'Flete GAM', ['destZone'], null,
      [...zoneRows(0.9, ['01', '02', '03', '04', '05', '06', 'GAM']), { key: ['07'], amount: '36000' }]],
  ],
  'María Jiménez Ramírez': [
    ['FLETE_ZONA_COLS', 'Flete + recargo rural', ['destZone'], ['flete', 'recargo_rural'],
      ZONES_CR.map((z) => ({ key: [z], amount: money(BASE_LIVIANO[z] * 0.92), values: { flete: money(BASE_LIVIANO[z] * 0.92), recargo_rural: ['RURAL', '08', '15', '16'].includes(z) ? '9000' : '0' } }))],
  ],
  'Pedro Hernández Castro': [
    ['FLETE_CAMION_ZONA', 'Flete zona × camión (pequeño/liviano)', ['destZone', 'truckTypeId'], null,
      zoneTruckRows(1.0, ZONES_CR, ['Camión pequeño', 'Camión liviano'])],
  ],
  Transmajori: [
    ['FLETE_CAMION', 'Tarifa plana por camión', ['truckTypeId'], null,
      Object.keys(TRUCKS).map((t) => ({ key: [t], amount: money(45000 * TRUCKS[t]) }))],
    ['RECARGO_ZONA', 'Recargo por zona', ['destZone'], null,
      [['09', 12000], ['10', 14000], ['11', 13000], ['12', 16000], ['13', 9000], ['RURAL', 7000]].map(([z, a]) => ({ key: [z], amount: String(a) }))],
  ],
  'Transosa de Alajuela S.A.': [
    ['FLETE_CAMION_ZONA', 'Matriz zona × camión (volumen)', ['destZone', 'truckTypeId'], null, zoneTruckRows(0.9)],
  ],
};

// Variables personalizadas (solo terciarias): [key, label, kind, origin, default, unit]
const NUM = 'NUMBER';
const TRIP = 'PER_TRIP';
const VARS_CR = {
  'Edison Miguel Ureña Ureña': [
    ['custom:horas_espera', 'Horas de espera', NUM, TRIP, '0', 'horas'],
    ['custom:cuota_seguro', 'Cuota seguro de carga', NUM, 'CONSTANT', '4500', '₡/viaje'],
  ],
  'Inversiones Acuña y Salazar del Caribe S.R.L.': [
    ['custom:peajes', 'Peajes', NUM, TRIP, '0', '₡'],
    ['custom:cruce_ferry', 'Cruce en ferry', NUM, TRIP, '0', '₡'],
  ],
  'Javier Martín Ulloa Serrano': [
    ['custom:ayudantes', 'Ayudantes adicionales', NUM, TRIP, '0', 'personas'],
    ['custom:cuota_administrativa', 'Cuota administrativa', NUM, 'CONSTANT', '3000', '₡/viaje'],
  ],
  'Luis Carlos Martín Mora Castillo': [
    ['custom:descargas_dificiles', 'Descargas difíciles', NUM, TRIP, '0', 'descargas'],
    ['custom:tipo_carga', 'Tipo de carga', 'TEXT', TRIP, 'SECA', null],
  ],
  'María Jiménez Ramírez': [
    ['custom:peajes', 'Peajes', NUM, TRIP, '0', '₡'],
    ['custom:recolectas', 'Recolectas', NUM, TRIP, '0', 'paradas'],
  ],
  'Pedro Hernández Castro': [
    ['custom:horas_espera', 'Horas de espera', NUM, TRIP, '0', 'horas'],
    ['custom:bultos', 'Bultos manejados', NUM, TRIP, '0', 'bultos'],
  ],
  Transmajori: [
    ['custom:recolectas', 'Recolectas', NUM, TRIP, '0', 'paradas'],
    ['custom:refrigeracion_horas', 'Horas de refrigeración', NUM, TRIP, '0', 'horas'],
    ['custom:tipo_carga', 'Tipo de carga', 'TEXT', TRIP, 'SECA', null],
  ],
  'Transosa de Alajuela S.A.': [
    ['custom:ayudantes', 'Ayudantes', NUM, TRIP, '0', 'personas'],
    ['custom:peajes', 'Peajes', NUM, TRIP, '0', '₡'],
    ['custom:horas_espera', 'Horas de espera', NUM, TRIP, '0', 'horas'],
    ['custom:cliente_prioritario', 'Cliente prioritario (0/1)', NUM, TRIP, '0', null],
  ],
};

// ── Venezuela (country code 'VN' en el catálogo): sin carriers/zonas/viajes cargados todavía ──
const COUNTRY_RULES_VN = [
  rule('OWN_BONO_ENTREGAS', 'Bono por entregas (propia)', 'ADJUSTMENT', 20, 'SUM', AND(OWN, GTE('clientCount', 12)), PER_UNIT('clientCount', 0.4), 'Incentivo desde 12 paradas.'),
  rule('OWN_PERNOCTA', 'Viáticos por pernocta (propia)', 'SURCHARGE', 30, 'SUM', AND(OWN, GT('overnightNights', 0)), PER_UNIT('overnightNights', 25), 'Por noche fuera de base.'),
  rule('OWN_FIN_SEMANA', 'Recargo fin de semana (propia)', 'MODIFIER', 20, 'SUM', AND(OWN, FIN_SEMANA), PERCENT('0.10'), '10 % sábado/domingo.'),
  rule('BASE_FLETE', 'Flete base por km (terceros)', 'BASE', 100, 'EXCLUSIVE', OUT, PER_KM('0.55'), 'Pago base por km a terceros.'),
  rule('PERNOCTA_TERC', 'Pernocta (terceros)', 'SURCHARGE', 30, 'SUM', AND(OUT, GT('overnightNights', 0)), PER_UNIT('overnightNights', 30), 'Por noche fuera de base.'),
  rule('RECARGO_PESADO_TERC', 'Camión pesado (terceros)', 'SURCHARGE', 40, 'SUM', AND(OUT, EQ('truckTypeId', 'Camión pesado')), FIXED(20), 'Recargo por unidad pesada.'),
  rule('PESO_ESCALON_TERC', 'Escalón por peso (terceros)', 'SURCHARGE', 50, 'SUM', OUT, TIERED('weightKg', 'FLAT', [[2000, 0], [5000, 15], [null, 35]]), 'Cargas pesadas.'),
  rule('DESC_VOLUMEN_TERC', 'Descuento por volumen (terceros)', 'ADJUSTMENT', 20, 'SUM', AND(OUT, GT('clientCount', 30)), PERCENT('-0.03'), '3 % menos desde 30 paradas.', dec),
];

// Estructura de costos por defecto de la flota propia de Venezuela (USD). Costa Rica ya tiene la suya.
const COST_VN = {
  name: 'Flota propia Venezuela (prueba)',
  operatingDays: 26,
  params: { kmPerYear: 40000, fuelPrice: '0.5', fuelEfficiency: { 'Camión pequeño': '7.5', 'Camión liviano': '5.5', 'Camión pesado': '3.8' } },
  rows: [
    ['SALARIO_CHOFER', 'Salario chofer', 'PER_MONTH_PRORATED', '320', 'conductor', null, 'USD/mes'],
    ['BONO_ALIMENTACION', 'Bono de alimentación', 'PER_MONTH_PRORATED', '90', 'conductor', null, 'USD/mes'],
    ['SEGURO_TERCEROS', 'Seguro a terceros', 'PER_MONTH_PRORATED', '28', 'otros', null, 'USD/mes'],
    ['SALARIO_AYUDANTE', 'Salario ayudante', 'PER_MONTH_PRORATED', '210', 'ayudante', null, 'USD/mes'],
    ['DEPRECIACION_PEQUENO', 'Depreciación camión pequeño', 'PER_MONTH_PRORATED', '240', 'depreciacion', 'Camión pequeño', 'USD/mes'],
    ['DEPRECIACION_LIVIANO', 'Depreciación camión liviano', 'PER_MONTH_PRORATED', '380', 'depreciacion', 'Camión liviano', 'USD/mes'],
    ['DEPRECIACION_PESADO', 'Depreciación camión pesado', 'PER_MONTH_PRORATED', '620', 'depreciacion', 'Camión pesado', 'USD/mes'],
    ['PEAJES_PROMEDIO', 'Peajes promedio por km', 'PER_KM', '0.02', 'otros', null, 'USD/km'],
  ],
  maintenance: [
    ['MANT_ACEITE', 'Cambio de aceite y filtros', '95', 8000],
    ['MANT_LLANTAS', 'Juego de llantas', '1400', 60000],
    ['MANT_FRENOS', 'Frenos', '260', 30000],
  ],
};

// ── Ejecución ───────────────────────────────────────────────────────────────────────────────
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase();

const customKeysIn = (v, acc = new Set()) => {
  if (typeof v === 'string' && v.startsWith('custom:')) acc.add(v);
  else if (Array.isArray(v)) v.forEach((x) => customKeysIn(x, acc));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => customKeysIn(x, acc));
  return acc;
};

async function main() {
  const client = await pool.connect();
  const counts = {};
  const bump = (k, rc) => { counts[k] = (counts[k] ?? 0) + (rc ?? 0); };
  try {
    await client.query('BEGIN');

    if (reset) {
      for (const [t, col] of [
        ['tarifas_pricing_rules', 'id'], ['tarifas_rate_tables', 'id'], ['tarifas_cost_structures', 'id'],
        ['tarifas_party_variables', 'id'], ['tarifas_settlement_parties', 'id'],
      ]) {
        const r = await client.query(`DELETE FROM ${t} WHERE ${col} LIKE 'TEST\\_%'`);
        console.log(`reset ${t}: ${r.rowCount}`);
      }
    } else {
      const { rows: countries } = await client.query('SELECT id, code FROM countries');
      const cid = Object.fromEntries(countries.map((c) => [c.code, c.id]));
      const { rows: carriers } = await client.query('SELECT id, name, is_flota_propia FROM carriers');
      const { rows: parties } = await client.query('SELECT id, carrier_id FROM tarifas_settlement_parties');
      const partyOfCarrier = Object.fromEntries(parties.map((p) => [p.carrier_id, p.id]));

      const ins = async (key, sql, params) => bump(key, (await client.query(sql, params)).rowCount);

      // Configuración de cálculo y margen de los países que no la tienen (VN).
      for (const [code, margin] of [['VN', 'MP_VN']]) {
        if (!cid[code]) continue;
        await ins('country_settings', `INSERT INTO tarifas_country_settings (id, country_id, rounding_decimals, rounding_mode, overnight_threshold_hours)
          VALUES ($1,$2,2,'HALF_UP',24) ON CONFLICT DO NOTHING`, [`CSET_${code}`, cid[code]]);
        await ins('margin_policies', `INSERT INTO tarifas_margin_policies (id, country_id, warn_below, critical_below, require_reason_below, block_on_loss)
          VALUES ($1,$2,0.18,0.08,0.18,false) ON CONFLICT DO NOTHING`, [margin, cid[code]]);
      }

      const insRule = (countryCode, scope, partyId, tag, r, n) => ins('rules', `
        INSERT INTO tarifas_pricing_rules (id, country_id, scope, party_id, code, name, stage, priority, stacking, exclusion_group,
          conditions, expression, description, reason, effect, builder, condition_builder, is_adhoc, active, effective_from, effective_to, version)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,null,null,false,true,$16,$17,1)
        ON CONFLICT (id) DO NOTHING`,
      [`TEST_RULE_${countryCode}_${tag}_${n}`, cid[countryCode], scope, partyId, r.code, r.name, r.stage, r.priority, r.stacking,
        r.exclusion_group ?? null, J(r.conditions), J(r.expression), r.description, `Dato de prueba: ${r.description}`,
        r.effect ?? 'INCREASE', r.effective_from ?? null, r.effective_to ?? null]);

      // Reglas de país
      for (const [code, list] of [['CR', COUNTRY_RULES_CR], ['VN', COUNTRY_RULES_VN]]) {
        if (!cid[code]) { console.log(`País ${code} no existe: se omiten sus reglas`); continue; }
        let n = 1;
        for (const r of list) await insRule(code, 'COUNTRY', null, 'PAIS', r, n++);
      }

      // Perfiles + reglas + tarifarios + variables por compañía de CR
      const carrierByName = Object.fromEntries(carriers.map((c) => [c.name, c]));
      for (const name of Object.keys(PARTY_RULES_CR)) {
        const carrier = carrierByName[name];
        if (!carrier) { console.log(`Carrier "${name}" no existe: se omite`); continue; }
        let partyId = partyOfCarrier[carrier.id];
        if (!partyId) {
          partyId = `TEST_SP_${slug(name)}`;
          await ins('parties', `INSERT INTO tarifas_settlement_parties (id, carrier_id, status, notes)
            VALUES ($1,$2,'active','Perfil de prueba') ON CONFLICT DO NOTHING`, [partyId, carrier.id]);
          partyOfCarrier[carrier.id] = partyId;
        }
        const tag = slug(name).slice(0, 12);

        let n = 1;
        for (const r of PARTY_RULES_CR[name]) await insRule('CR', 'PARTY', partyId, tag, r, n++);

        let t = 1;
        for (const [code, tname, keyCols, valueCols, rows] of TABLES_CR[name] ?? []) {
          const tid = `TEST_RT_${tag}_${t++}`;
          await ins('rate_tables', `INSERT INTO tarifas_rate_tables (id, country_id, party_id, code, name, key_columns, value_columns, active)
            VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,true) ON CONFLICT (id) DO NOTHING`,
          [tid, cid.CR, partyId, code, tname, J(keyCols), valueCols ? J(valueCols) : null]);
          let ro = 1;
          for (const row of rows) {
            await ins('rate_table_rows', `INSERT INTO tarifas_rate_table_rows (id, table_id, key, amount, row_order, active, extra_values)
              VALUES ($1,$2,$3::jsonb,$4,$5,true,$6::jsonb) ON CONFLICT (id) DO NOTHING`,
            [`${tid}_R${ro}`, tid, J(row.key), row.amount, ro, row.values ? J(row.values) : null]);
            ro++;
          }
        }

        const declared = new Set();
        for (const [key, label, kind, origin, def, unit] of VARS_CR[name] ?? []) {
          declared.add(key);
          await ins('variables', `INSERT INTO tarifas_party_variables (id, party_id, key, label, kind, origin, default_value, unit, active)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT (id) DO NOTHING`,
          [`TEST_PV_${tag}_${key.slice(7).toUpperCase()}`, partyId, key, label, kind, origin, def, unit]);
        }
        // Toda variable personalizada que usa una regla de la compañía debe estar declarada (o ya existir).
        const { rows: existing } = await client.query('SELECT key FROM tarifas_party_variables WHERE party_id = $1', [partyId]);
        existing.forEach((e) => declared.add(e.key));
        for (const r of PARTY_RULES_CR[name]) {
          for (const k of customKeysIn([r.conditions, r.expression])) {
            if (!declared.has(k)) throw new Error(`Regla ${name}/${r.code} usa ${k} sin declarar`);
          }
        }
      }

      // Estructura de costos por defecto de Venezuela (propia)
      if (cid.VN) {
        const sid = 'TEST_CSTR_VN_DEFAULT';
        await ins('cost_structures', `INSERT INTO tarifas_cost_structures (id, party_id, country_id, name, operating_days_per_month, params, effective_from, active, notes)
          VALUES ($1,null,$2,$3,$4,$5::jsonb,null,true,'Estructura de prueba (USD)') ON CONFLICT (id) DO NOTHING`,
        [sid, cid.VN, COST_VN.name, COST_VN.operatingDays, J(COST_VN.params)]);
        let o = 1;
        for (const [code, label, driver, amount, group, truck, unit] of COST_VN.rows) {
          await ins('cost_rows', `INSERT INTO tarifas_cost_structure_rows (id, structure_id, code, label, driver, amount, sign, applies_when, unit, row_order, active, cost_group, truck_type)
            VALUES ($1,$2,$3,$4,$5,$6,'ADD',null,$7,$8,true,$9,$10) ON CONFLICT (id) DO NOTHING`,
          [`TEST_CROW_VN_${o}`, sid, code, label, driver, amount, unit, o, group, truck]);
          o++;
        }
        for (const [code, label, amount, kmEvery] of COST_VN.maintenance) {
          await ins('cost_rows', `INSERT INTO tarifas_cost_structure_rows (id, structure_id, code, label, driver, amount, sign, applies_when, unit, row_order, active,
              cost_group, frequency, frequency_qty, unit_qty, cost_per_km, truck_type)
            VALUES ($1,$2,$3,$4,'PER_KM',$5,'ADD',null,'USD',$6,true,'mantenimiento','km',$7,1,$8,null) ON CONFLICT (id) DO NOTHING`,
          [`TEST_CROW_VN_${o}`, sid, code, label, amount, o, kmEvery, (Number(amount) / kmEvery).toFixed(6)]);
          o++;
        }
      }
    }

    console.log(`${execute ? 'EJECUTANDO' : 'DRY RUN'} ${reset ? '(reset)' : ''} — filas insertadas:`, counts);
    if (execute) {
      await client.query('COMMIT');
      console.log('COMMIT');
    } else {
      await client.query('ROLLBACK');
      console.log('ROLLBACK (usar --execute para aplicar)');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('ERROR, ROLLBACK:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
