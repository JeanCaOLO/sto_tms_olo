// Carga (o borra) la DATA MOCK del módulo de tarifas en Aurora. Es dato de PRUEBA: se borra después.
// Fuente: docs/tarifador/demo-data/mock-tarifas.json (la genera `npx jiti scripts/mock-tarifas/generar.ts`).
//
// Uso (túnel Aurora arriba, ver scripts/tunel-aurora.ps1):
//   node --env-file=.env.local scripts/mock-tarifas/cargar.mjs                    simulación (hace todo y revierte)
//   node --env-file=.env.local scripts/mock-tarifas/cargar.mjs --execute          aplica
//   node --env-file=.env.local scripts/mock-tarifas/cargar.mjs --estado           cuenta lo que hay cargado (solo lectura)
//   node --env-file=.env.local scripts/mock-tarifas/cargar.mjs --reset            simulación del borrado
//   node --env-file=.env.local scripts/mock-tarifas/cargar.mjs --reset --execute  borra la mock
//
// Seguridad:
//   * Todo cuelga de DOS países nuevos ("... (DEMO)"): nada de la mock se mezcla con los países reales.
//   * El borrado es por la lista exacta de ids del JSON (nunca por patrón) MÁS lo que la app haya creado
//     encima de esos países (liquidaciones, proformas…): se borra por `country_id` de los países mock.
//   * Carga y borrado van en UNA transacción: o queda todo o nada.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const execute = process.argv.includes('--execute');
const reset = process.argv.includes('--reset');
const soloEstado = process.argv.includes('--estado');
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
      params.push(val(row[c] === '@ORG' ? org : row[c]));
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
  return out;
}

async function cargar(client) {
  const org = await organizationId(client);
  const { rows: ya } = await q(client, 'SELECT id FROM tbl_countries WHERE id = ANY($1::uuid[])', [countryIds]);
  if (ya.length) throw new Error('La mock ya está cargada (existen sus países). Bórrala primero con --reset --execute.');
  for (const table of ORDER) {
    const n = await insertarTabla(client, table, data.tables[table], org);
    console.log(`  ${table}: ${n}`);
  }
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
    console.log(`${reset ? 'BORRADO' : 'CARGA'} de la data mock del módulo de tarifas — ${execute ? 'APLICANDO' : 'simulación (se revierte)'}`);
    await client.query('BEGIN');
    try {
      await (reset ? borrar(client) : cargar(client));
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
