// Carga (o borra) la DATA MOCK (tarifador + Devoluciones + Tracking, mismos viajes) en Aurora. Es dato de PRUEBA: se borra después.
// Fuente: docs/tarifador/demo-data/mock-tarifas.json (la genera `npx jiti scripts/mock-tarifas/generar.ts`).
//
// Uso (túnel Aurora arriba, ver scripts/tunel-aurora.ps1):
//   node --env-file=.env.local scripts/mock-tarifas/cargar.mjs                    simulación (hace todo y revierte)
//   node --env-file=.env.local scripts/mock-tarifas/cargar.mjs --execute          aplica
//   node --env-file=.env.local scripts/mock-tarifas/cargar.mjs --estado           cuenta lo que hay cargado (solo lectura)
//   MOCK_USER_PASSWORD=... node --env-file=.env.local scripts/mock-tarifas/cargar.mjs --credenciales [--solo-choferes] [--execute]
//                                                                                   pone/cambia la clave de los usuarios de prueba ya cargados
//   node --env-file=.env.local scripts/mock-tarifas/cargar.mjs --reset            simulación del borrado
//   node --env-file=.env.local scripts/mock-tarifas/cargar.mjs --reset --execute  borra la mock
//
// Seguridad:
//   * Todo cuelga de DOS países nuevos ("Costa Rica MOCK", "Venezuela MOCK"): nada de la mock se mezcla con los países reales.
//   * Usuarios de prueba (2 choferes y 1 de Devoluciones): la contraseña sale de MOCK_USER_PASSWORD (variable de entorno; no
//     se imprime ni se guarda en el repo). Sin esa variable la carga sigue, pero sin credenciales de acceso.
//   * El borrado es por la lista exacta de ids del JSON (nunca por patrón) MÁS lo que la app haya creado
//     encima de esos países (liquidaciones, proformas…): se borra por `country_id` de los países mock.
//   * Carga y borrado van en UNA transacción: o queda todo o nada.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const execute = process.argv.includes('--execute');
const reset = process.argv.includes('--reset');
const soloEstado = process.argv.includes('--estado');
const soloCredenciales = process.argv.includes('--credenciales');
const JSON_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/tarifador/demo-data/mock-tarifas.json');
const data = JSON.parse(readFileSync(JSON_PATH, 'utf8'));

const pool = new pg.Pool({
  host: process.env.TMS_DB_HOST || 'localhost',
  port: Number(process.env.TMS_DB_PORT) || 5432,
  user: process.env.TMS_DB_USER,
  password: process.env.TMS_DB_PASSWORD,
  database: process.env.TMS_DB_NAME || 'tms_olo',
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const countryIds = data.meta.paises.map((p) => p.id);
const ORDER = Object.keys(data.tables); // orden de inserción (padres antes que hijos)

const q = (client, text, params) => client.query(text, params);
const ident = (name) => `"${name.replace(/"/g, '""')}"`;
// Un valor objeto/array es jsonb: se manda como texto JSON.
const val = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);

// Marcadores del JSON que se resuelven al cargar: lo "en vivo" (posición del camión, chofer en línea) lo es el día de la demo.
const AHORA = Date.now();
const HOY = new Date(AHORA).toISOString().slice(0, 10);
let roles = new Map();
function resolver(v, org) {
  if (v === '@ORG') return org;
  if (typeof v !== 'string' || v[0] !== '@') return v;
  if (v === '@TODAY') return HOY;
  const m = /^@NOW-(\d+)m$/.exec(v);
  if (m) return new Date(AHORA - Number(m[1]) * 60_000).toISOString();
  const r = /^@ROLE:(.+)$/.exec(v);
  if (r) {
    if (!roles.has(r[1])) throw new Error(`No existe el rol "${r[1]}" en tbl_roles.`);
    return roles.get(r[1]);
  }
  return v;
}

async function organizationId(client) {
  const { rows } = await q(client, 'SELECT id FROM tbl_organizations ORDER BY created_at NULLS LAST LIMIT 1');
  if (!rows[0]) throw new Error('No hay organización en tbl_organizations.');
  return rows[0].id;
}

async function insertarTabla(client, table, rows, org) {
  if (rows.length === 0) return 0;
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const CHUNK = 150;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const params = [];
    const tuples = slice.map((row) => `(${cols.map((c) => {
      if (!(c in row)) return 'DEFAULT';
      params.push(val(resolver(row[c], org)));
      return `$${params.length}`;
    }).join(', ')})`);
    try {
      await q(client, `INSERT INTO ${ident(table)} (${cols.map(ident).join(', ')}) VALUES ${tuples.join(', ')}`, params);
    } catch (e) {
      throw new Error(`${table}: ${e.message}${e.detail ? ` — ${e.detail}` : ''}`);
    }
  }
  return rows.length;
}

async function contar(client) {
  const out = [];
  for (const { table, ids } of [...data.deleteOrder].reverse()) {
    const { rows } = await q(client, `SELECT count(*)::int n FROM ${ident(table)} WHERE id::text = ANY($1::text[])`, [ids]);
    out.push(`${table}: ${rows[0].n}/${ids.length}`);
  }
  // Tablas sin `id` propio (tracking): se cuentan por viaje/conductor de los países mock.
  const rutas = 'SELECT r.id FROM tbl_routes r JOIN tbl_stores s ON s.id = r.store_id WHERE s.country_id = ANY($1::uuid[])';
  for (const t of ['tbl_tracking_positions', 'tbl_tracking_last_positions', 'tbl_tracking_events', 'tbl_tracking_stop_visits']) {
    const { rows } = await q(client, `SELECT count(*)::int n FROM ${ident(t)} WHERE route_id IN (${rutas})`, [countryIds]);
    out.push(`${t}: ${rows[0].n}/${(data.tables[t] ?? []).length}`);
  }
  const { rows: pr } = await q(client, 'SELECT count(*)::int n FROM tbl_driver_presence WHERE driver_id = ANY($1::uuid[])', [(data.tables.tbl_driver_presence ?? []).map((p) => p.driver_id)]);
  out.push(`tbl_driver_presence: ${pr[0].n}/${(data.tables.tbl_driver_presence ?? []).length}`);
  return out;
}

async function cargar(client) {
  const org = await organizationId(client);
  const { rows: ya } = await q(client, 'SELECT id FROM tbl_countries WHERE id = ANY($1::uuid[])', [countryIds]);
  if (ya.length) throw new Error('La mock ya está cargada (existen sus países). Bórrala primero con --reset --execute.');
  roles = new Map((await q(client, 'SELECT id, name FROM tbl_roles')).rows.map((r) => [r.name, r.id]));
  for (const table of ORDER) {
    const n = await insertarTabla(client, table, data.tables[table], org);
    console.log(`  ${table}: ${n}`);
    if (table === 'tbl_app_users') await credenciales(client);
  }
}

// Credenciales de los usuarios de prueba (login de la app y de la web). La clave nunca se imprime.
async function credenciales(client) {
  // --solo-choferes: deja sin clave al usuario de Devoluciones (y a cualquier otro que no sea chofer).
  const users = (data.tables.tbl_app_users ?? []).filter((u) => !process.argv.includes('--solo-choferes') || /^chofer\./.test(u.email));
  const clave = process.env.MOCK_USER_PASSWORD;
  if (!clave) {
    console.log(`  tbl_auth_credentials: OMITIDO (falta MOCK_USER_PASSWORD): ${users.length} usuarios sin acceso hasta que se definan`);
    return;
  }
  const hash = bcrypt.hashSync(clave, 10);
  for (const u of users) {
    // Si ya hay credencial (carga previa o --credenciales repetido) solo se actualiza la clave.
    const { rowCount } = await q(client, 'UPDATE tbl_auth_credentials SET password_hash = $2 WHERE auth_user_id = $1', [u.auth_user_id, hash]);
    if (!rowCount) await q(client, 'INSERT INTO tbl_auth_credentials (auth_user_id, email, password_hash) VALUES ($1, $2, $3)', [u.auth_user_id, u.email, hash]);
  }
  console.log(`  tbl_auth_credentials: ${users.length}`);
}

async function borrar(client) {
  // 1) Lo que cuelga de los países mock en el tarifador (incluye lo que la app haya creado encima de la mock).
  const porPais = [
    ['tbl_tarifas_proforma_claims', 'country_id'], ['tbl_tarifas_proforma_flow_phases', 'country_id'],
    ['tbl_tarifas_proforma_items', 'proforma_id IN (SELECT id FROM tbl_tarifas_proformas WHERE country_id = ANY($1::uuid[]))'],
    ['tbl_tarifas_proforma_phases', 'proforma_id IN (SELECT id FROM tbl_tarifas_proformas WHERE country_id = ANY($1::uuid[]))'],
    ['tbl_tarifas_proformas', 'country_id'], ['tbl_tarifas_settlements', 'country_id'],
    ['tbl_tarifas_trip_order_marks', 'country_id'], ['tbl_tarifas_trip_tender_awards', 'country_id'],
    ['tbl_tarifas_rate_table_rows', 'table_id IN (SELECT id FROM tbl_tarifas_rate_tables WHERE country_id = ANY($1::uuid[]))'],
    ['tbl_tarifas_rate_tables', 'country_id'],
    ['tbl_tarifas_cost_structure_rows', 'structure_id IN (SELECT id FROM tbl_tarifas_cost_structures WHERE country_id = ANY($1::uuid[]))'],
    ['tbl_tarifas_cost_structures', 'country_id'], ['tbl_tarifas_pricing_rules', 'country_id'], ['tbl_tarifas_pricing_templates', 'country_id'],
    ['tbl_tarifas_zone_groups', 'country_id'], ['tbl_tarifas_margin_policies', 'country_id'], ['tbl_tarifas_country_settings', 'country_id'],
    ['tbl_tarifas_party_variables', 'party_id IN (SELECT id FROM tbl_tarifas_settlement_parties WHERE carrier_id IN (SELECT id FROM tbl_carriers WHERE country_id = ANY($1::uuid[])))'],
    ['tbl_tarifas_settlement_parties', 'carrier_id IN (SELECT id FROM tbl_carriers WHERE country_id = ANY($1::uuid[]))'],
  ];
  // La bitácora del tarifador (tbl_tarifas_audit_log) es APPEND-ONLY: el usuario de la app no puede borrarla, por diseño.
  // Sus ~76 filas de la mock quedan como registro huérfano e inofensivo (nadie las lee sin la liquidación).
  console.log('  tbl_tarifas_audit_log: se conserva (append-only)');
  // 0) Tracking y Devoluciones de los viajes de los países mock (incluye lo que la app del chofer o el módulo hayan creado encima).
  const rutas = 'SELECT r.id FROM tbl_routes r JOIN tbl_stores s ON s.id = r.store_id WHERE s.country_id = ANY($1::uuid[])';
  const usuarios = (data.tables.tbl_app_users ?? []).map((u) => u.id);
  const authIds = (data.tables.tbl_app_users ?? []).map((u) => u.auth_user_id);
  const delPor = async (table, where, params) => {
    const { rowCount } = await q(client, `DELETE FROM ${ident(table)} WHERE ${where}`, params);
    console.log(`  ${table}: ${rowCount}`);
  };
  for (const t of ['tbl_tracking_positions', 'tbl_tracking_last_positions', 'tbl_tracking_evidences', 'tbl_tracking_reviews', 'tbl_tracking_events', 'tbl_tracking_stop_visits']) {
    await delPor(t, `route_id IN (${rutas})`, [countryIds]);
  }
  await delPor('tbl_driver_presence', `driver_id IN (SELECT d.id FROM tbl_drivers d JOIN tbl_carriers c ON c.id = d.carrier_id WHERE c.country_id = ANY($1::uuid[]))`, [countryIds]);
  await delPor('tbl_return_form_items', `form_id IN (SELECT id FROM tbl_return_forms WHERE route_id IN (${rutas}))`, [countryIds]);
  await delPor('tbl_return_form_sections', `form_id IN (SELECT id FROM tbl_return_forms WHERE route_id IN (${rutas}))`, [countryIds]);
  await delPor('tbl_return_forms', `route_id IN (${rutas})`, [countryIds]);
  await delPor('tbl_returns', `dispatch_guide_id IN (SELECT id FROM tbl_dispatch_guides WHERE route_id IN (${rutas}))`, [countryIds]);
  await delPor('tbl_tracking_consents', 'app_user_id = ANY($1::uuid[])', [usuarios]);
  await delPor('tbl_mobile_refresh_tokens', 'app_user_id = ANY($1::uuid[])', [usuarios]);
  await delPor('tbl_auth_credentials', 'auth_user_id = ANY($1::uuid[])', [authIds]);
  for (const [table, cond] of porPais) {
    const where = cond.includes('$1') ? cond : `${cond} = ANY($1::uuid[])`;
    const { rowCount } = await q(client, `DELETE FROM ${ident(table)} WHERE ${where}`, [countryIds]);
    console.log(`  ${table}: ${rowCount}`);
  }
  // 2) El resto (maestros del TMS), por la lista EXACTA de ids del JSON, hijos primero.
  for (const { table, ids } of data.deleteOrder) {
    if (table.startsWith('tbl_tarifas_')) continue;
    const { rowCount } = await q(client, `DELETE FROM ${ident(table)} WHERE id::text = ANY($1::text[])`, [ids]);
    console.log(`  ${table}: ${rowCount}`);
  }
}

const client = await pool.connect();
try {
  if (soloEstado) {
    const lines = await contar(client);
    console.log('Filas de la mock presentes en la BD (presentes/en el JSON):');
    for (const l of lines) console.log(`  ${l}`);
  } else {
    console.log(`${reset ? 'BORRADO' : soloCredenciales ? 'CREDENCIALES' : 'CARGA'} de la data mock (tarifador, Devoluciones y Tracking) — ${execute ? 'APLICANDO' : 'simulación (se revierte)'}`);
    await client.query('BEGIN');
    try {
      await (reset ? borrar(client) : soloCredenciales ? credenciales(client) : cargar(client));
      await client.query(execute ? 'COMMIT' : 'ROLLBACK');
      console.log(execute ? 'APLICADO' : 'SIMULACIÓN OK (rollback): no se cambió nada');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  }
} catch (e) {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
