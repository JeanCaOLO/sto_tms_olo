// Usuarios y proformas DE PRUEBA para el flujo transportista → gerente. Todo lleva una marca para borrarlo luego:
//   usuarios   correo @prueba.tms
//   proformas  número PRUEBA-…
//
// Requiere sql/56 aplicado (roles Transportista y Gerente, app_users.carrier_id).
// Uso:
//   node --env-file=.env.local scripts/seed-proformas-prueba.mjs <clave> [--country=<uuid>] [--execute]
//   node --env-file=.env.local scripts/seed-proformas-prueba.mjs --remove [--execute]
// Sin --execute corre todo dentro de una transacción y hace ROLLBACK (muestra qué haría).

import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const remove = args.includes('--remove');
const countryArg = args.find((a) => a.startsWith('--country='))?.split('=')[1];
const password = args.find((a) => !a.startsWith('--'));
const DOMAIN = '@prueba.tms';
const PREFIX = 'PRUEBA-';

if (!remove && (!password || password.length < 8)) {
  console.error('Uso: seed-proformas-prueba.mjs <clave de 8+ caracteres> [--country=<uuid>] [--execute] | --remove [--execute]');
  process.exit(1);
}

const genId = (prefix) => `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
const db = new pg.Client({
  host: process.env.TMS_DB_HOST || 'localhost',
  port: Number(process.env.TMS_DB_PORT) || 5432,
  user: process.env.TMS_DB_USER,
  password: process.env.TMS_DB_PASSWORD,
  database: process.env.TMS_DB_NAME || 'tms_olo',
  ssl: { rejectUnauthorized: false },
  application_name: 'seed-proformas-prueba',
});
await db.connect();
await db.query('BEGIN');

try {
  if (remove) await removeAll(); else await seed();
  if (execute) { await db.query('COMMIT'); console.log('\nAplicado (COMMIT).'); }
  else { await db.query('ROLLBACK'); console.log('\nSimulación: ROLLBACK, no se guardó nada. Agrega --execute para aplicar.'); }
} catch (e) {
  await db.query('ROLLBACK');
  console.error('Error, se revirtió todo:', e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}

async function removeAll() {
  const ids = (await db.query('SELECT id FROM tbl_tarifas_proformas WHERE number LIKE $1', [`${PREFIX}%`])).rows.map((r) => r.id);
  if (ids.length) {
    await db.query("DELETE FROM tbl_tarifas_audit_log WHERE entity = 'proforma' AND entity_id = ANY($1)", [ids]);
    await db.query('DELETE FROM tbl_tarifas_proforma_claims WHERE proforma_id = ANY($1)', [ids]);
    await db.query('DELETE FROM tbl_tarifas_proformas WHERE id = ANY($1)', [ids]); // fases e ítems caen en cascada
  }
  const users = (await db.query('SELECT id, auth_user_id FROM tbl_app_users WHERE email LIKE $1', [`%${DOMAIN}`])).rows;
  for (const u of users) {
    await db.query('DELETE FROM tbl_user_scopes WHERE app_user_id = $1', [u.id]);
    await db.query('DELETE FROM tbl_app_users WHERE id = $1', [u.id]);
    await db.query('DELETE FROM tbl_auth_credentials WHERE auth_user_id = $1', [u.auth_user_id]);
  }
  console.log(`Borradas ${ids.length} proformas de prueba y ${users.length} usuarios de prueba.`);
}

async function seed() {
  const { rows: [org] } = await db.query('SELECT id FROM tbl_organizations LIMIT 1');
  const { rows: roles } = await db.query("SELECT id, name FROM tbl_roles WHERE name IN ('Transportista', 'Gerente')");
  const roleId = (name) => roles.find((r) => r.name === name)?.id;
  if (!org || !roleId('Transportista') || !roleId('Gerente')) throw new Error('Faltan la organización o los roles: aplica sql/56 primero.');

  const country = (await db.query(
    countryArg ? 'SELECT id, currency FROM tbl_countries WHERE id = $1' : 'SELECT id, currency FROM tbl_countries ORDER BY name LIMIT 1',
    countryArg ? [countryArg] : [])).rows[0];
  if (!country) throw new Error('No encontré el país.');
  const carriers = (await db.query('SELECT id, name FROM tbl_carriers WHERE country_id = $1 ORDER BY name LIMIT 2', [country.id])).rows;
  if (carriers.length < 2) throw new Error('Se necesitan al menos 2 transportistas en el país para probar el aislamiento.');
  console.log(`País ${country.id} · transportistas: ${carriers.map((c) => c.name).join(' / ')}`);

  const hash = await bcrypt.hash(password, 10);
  const users = [
    { email: `transportista1${DOMAIN}`, name: `Prueba Transportista 1 (${carriers[0].name})`, role: 'Transportista', carrier: carriers[0].id },
    { email: `transportista2${DOMAIN}`, name: `Prueba Transportista 2 (${carriers[1].name})`, role: 'Transportista', carrier: carriers[1].id },
    { email: `gerente${DOMAIN}`, name: 'Prueba Gerente', role: 'Gerente', carrier: null },
  ];
  for (const u of users) {
    if ((await db.query('SELECT 1 FROM tbl_auth_credentials WHERE email = $1', [u.email])).rowCount) { console.log(`ya existe ${u.email}`); continue; }
    const authId = randomUUID();
    await db.query('INSERT INTO tbl_auth_credentials (auth_user_id, email, password_hash) VALUES ($1, $2, $3)', [authId, u.email, hash]);
    const { rows: [row] } = await db.query(
      'INSERT INTO tbl_app_users (auth_user_id, organization_id, full_name, email, role_id, is_active, carrier_id) VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING id',
      [authId, org.id, u.name, u.email, roleId(u.role), u.carrier]);
    await db.query('INSERT INTO tbl_user_scopes (app_user_id, role_id, country_id, warehouse_id, customer_id) VALUES ($1,$2,NULL,NULL,NULL)', [row.id, roleId(u.role)]);
    console.log(`usuario ${u.email} (${u.role})`);
  }

  // 2 proformas por transportista esperando al transportista, y 1 ya aprobada por él (en la cola del gerente).
  const plan = carriers.flatMap((c, i) => [
    { carrier: c, n: `${PREFIX}${i + 1}01`, total: 1250.5 + i * 100, approved: 0 },
    { carrier: c, n: `${PREFIX}${i + 1}02`, total: 830 + i * 100, approved: 0 },
    { carrier: c, n: `${PREFIX}${i + 1}03`, total: 2100 + i * 100, approved: 1 },
  ]);
  for (const p of plan) {
    const id = genId('pro');
    await db.query(
      `INSERT INTO tbl_tarifas_proformas (id, country_id, number, carrier_id, carrier_name, status, currency, total_amount, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'En Revisión',$6,$7,'prueba',now(),now())`,
      [id, country.id, p.n, p.carrier.id, p.carrier.name, country.currency ?? 'CRC', p.total]);
    const phases = [['Transportista', 'transportista'], ['Gerente', 'gerente']];
    for (const [i, [name]] of phases.entries()) {
      const done = i < p.approved;
      await db.query(
        `INSERT INTO tbl_tarifas_proforma_phases (id, proforma_id, position, name, approver_type, role_name, approver_label, state, decided_by, decided_at)
         VALUES ($1,$2,$3,$4,'role',$4,$4,$5,$6,$7)`,
        [genId('pph'), id, i + 1, name, done ? 'aprobada' : 'pendiente', done ? 'prueba' : null, done ? new Date() : null]);
    }
    console.log(`proforma ${p.n} · ${p.carrier.name} · ${p.approved ? 'esperando al Gerente' : 'esperando al Transportista'}`);
  }
}
