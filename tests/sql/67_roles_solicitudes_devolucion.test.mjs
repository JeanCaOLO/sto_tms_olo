// PostgreSQL en memoria exclusivamente. No lee .env ni acepta URL de conexion.
// Instalar PGlite 0.5.16 fuera del proyecto; ver docs/devoluciones/ENTREGA_JEAN_SQL67.md.
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const modulePath = process.env.TMS_T03_PGLITE_MODULE || join(tmpdir(),
  'tms-t03-postgres-tools/node_modules/@electric-sql/pglite/dist/index.js');
const { PGlite } = await import(pathToFileURL(resolve(modulePath)).href);
const forwardPath = join(root, 'sql/67_roles_solicitudes_devolucion.sql');
const rollbackPath = join(root, 'sql/67_roles_solicitudes_devolucion_rollback.sql');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const orgA = uuid(1), orgB = uuid(2), companyA = uuid(3), companyB = uuid(4);
const authorA = uuid(5), authorB = uuid(6), reviewerA = uuid(7), reviewerB = uuid(8);
const orderA = uuid(9), orderB = uuid(10), routeA = uuid(11), guideA = uuid(12), guideB = uuid(13);
const requestA = uuid(14), requestB = uuid(15), itemA = uuid(16), itemB = uuid(17), oldReturn = uuid(18);
let db;

const source64 = readFileSync(join(root, 'sql/64_devoluciones_solicitudes_cliente.sql'), 'utf8');
const requestsDDL = source64.slice(source64.indexOf('create table if not exists tbl_return_requests ('),
  source64.indexOf('-- 3.'));
assert.ok(requestsDDL.includes('ck_return_request_status'));

function pythonSQL(file, symbol) {
  const source = readFileSync(join(root, file), 'utf8');
  const found = source.match(new RegExp(symbol + ' = """([\\s\\S]*?)"""'));
  assert.ok(found, `Missing SQL symbol ${symbol}`);
  let count = 0;
  return found[1].replace(/%s/g, () => `$${++count}`);
}

before(async () => {
  db = new PGlite('memory://');
  await db.waitReady;
  console.log('Test engine: ' + (await db.query('select version() AS v')).rows[0].v);
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  // Este esquema solo existe dentro de la instancia memory:// creada arriba.
  await db.exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
    SET client_min_messages=warning;
    CREATE TABLE tbl_organizations(id uuid PRIMARY KEY);
    CREATE TABLE tbl_customers(id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES tbl_organizations(id));
    CREATE TABLE tbl_app_users(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES tbl_organizations(id),
      customer_id uuid REFERENCES tbl_customers(id));
    CREATE TABLE tbl_orders(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES tbl_organizations(id),
      customer_id uuid REFERENCES tbl_customers(id));
    CREATE TABLE tbl_routes(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES tbl_organizations(id));
    CREATE TABLE tbl_dispatch_guides(id uuid PRIMARY KEY,organization_id uuid NOT NULL,
      order_id uuid REFERENCES tbl_orders(id),route_id uuid REFERENCES tbl_routes(id));
    CREATE TABLE tbl_returns(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,
      dispatch_guide_id uuid REFERENCES tbl_dispatch_guides(id),order_id uuid REFERENCES tbl_orders(id),
      return_number text NOT NULL,return_type text NOT NULL DEFAULT 'contracamion',status text DEFAULT 'pending',
      reason text,product_code text,product_name text,quantity integer,photo_url text,notes text,
      UNIQUE(organization_id,return_number));`);
  await db.exec(requestsDDL);
  await db.query('INSERT INTO tbl_organizations VALUES ($1),($2)', [orgA, orgB]);
  await db.query('INSERT INTO tbl_customers VALUES ($1,$2),($3,$4)', [companyA, orgA, companyB, orgB]);
  await db.query('INSERT INTO tbl_app_users VALUES ($1,$2,$3),($4,$5,$6),($7,$2,NULL),($8,$5,NULL)',
    [authorA, orgA, companyA, authorB, orgB, companyB, reviewerA, reviewerB]);
  await db.query('INSERT INTO tbl_orders VALUES ($1,$2,$3),($4,$5,$6)', [orderA, orgA, companyA, orderB, orgB, companyB]);
  await db.query('INSERT INTO tbl_routes VALUES ($1,$2)', [routeA, orgA]);
  await db.query('INSERT INTO tbl_dispatch_guides VALUES ($1,$2,$3,$4),($5,$6,$7,$4)',
    [guideA, orgA, orderA, routeA, guideB, orgB, orderB]);
  await db.query(`INSERT INTO tbl_return_requests(id,organization_id,customer_id,requested_by,request_number,created_at)
    VALUES($1,$2,$3,$4,'SOL-TEST-A','2026-01-01Z'),($5,$6,$7,$8,'SOL-TEST-B','2026-01-02Z')`,
    [requestA, orgA, companyA, authorA, requestB, orgB, companyB, authorB]);
  await db.query(`INSERT INTO tbl_return_request_items(id,request_id,line_number,product_code,product_name,quantity,reason_code,description)
    VALUES($1,$2,1,'TEST-A','Producto sintetico A',2,'danado',NULL),
          ($3,$4,1,'TEST-B','Producto sintetico B',1,'otro','Caso sintetico')`,
    [itemA, requestA, itemB, requestB]);
  await db.query(`INSERT INTO tbl_returns(id,organization_id,dispatch_guide_id,order_id,return_number,quantity)
    VALUES($1,$2,$3,$4,'TEST-OLD',2)`, [oldReturn, orgA, guideA, orderA]);
});

// Durante RED, SQL inexistente equivale al esquema anterior; falla la capacidad, no un ENOENT.
async function migrate() { await db.exec(existsSync(forwardPath) ? readFileSync(forwardPath, 'utf8') : 'SELECT 1'); }
async function rollback() { await db.exec(existsSync(rollbackPath) ? readFileSync(rollbackPath, 'utf8') : 'SELECT 1'); }
async function columns(table) {
  return (await db.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table])).rows.map(r=>r.column_name);
}
async function denied(work, code = '23514') {
  await assert.rejects(work, e => { assert.equal(e.code, code); return true; });
  await db.exec('ROLLBACK'); // Tambien recupera transacciones explicitas abortadas por DDL.
}
async function approve(id = requestA, actor = reviewerA) {
  return db.query(`UPDATE tbl_return_requests SET status='aprobada',decided_by=$2,decided_at='2026-11-12Z' WHERE id=$1`, [id, actor]);
}
async function link({ item = itemA, order = orderA, guide = guideA, org = orgA, type = 'recolecta', number = 'TEST-LINK' } = {}) {
  return db.query(`INSERT INTO tbl_returns(organization_id,order_id,dispatch_guide_id,return_number,return_type,quantity,request_item_id)
    VALUES($1,$2,$3,$4,$5,2,$6) RETURNING id`, [org, order, guide, number, type, item]);
}

test('keeps legacy rows and adds decision and traceability schema', async () => {
  const before = (await db.query('SELECT * FROM tbl_return_requests ORDER BY id')).rows;
  await migrate();
  const names = await columns('tbl_return_requests');
  for (const name of ['decided_by', 'decided_at', 'rejection_reason']) assert.ok(names.includes(name), `Missing ${name}`);
  assert.ok((await columns('tbl_returns')).includes('request_item_id'));
  const rows = (await db.query('SELECT * FROM tbl_return_requests ORDER BY id')).rows;
  for (let n = 0; n < rows.length; n++) for (const [key, value] of Object.entries(before[n])) assert.deepEqual(rows[n][key], value);
  assert.equal(rows[0].status, 'pendiente_asignacion');
  assert.equal(rows[0].decided_by, null);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM tbl_returns')).rows[0].n, 1);
});

test('forward is idempotent and old backend SQL still reads and writes', async () => {
  await migrate(); await migrate();
  const create = pythonSQL('backend/admin/src/admin_return_requests_sql.py', 'INSERT_REQUEST_SQL');
  const created = await db.query(create, [orgA, companyA, authorA, 'SOL-TEST-NEW']);
  assert.equal(created.rows[0].status, 'pendiente_asignacion');
  const mine = pythonSQL('backend/admin/src/admin_return_requests_sql.py', 'MINE_SQL');
  assert.equal((await db.query(mine, [orgA, companyA, authorA])).rows.length, 2);
  const mobile = pythonSQL('backend/mobile/src/mobile_api/sql.py', 'INSERT_RETURN_SQL');
  assert.equal((await db.query(mobile, [orgA, guideA, orderA, 'TEST-MOBILE', 'danado','CODE','Nombre',1,null,null])).rows.length, 1);
});

test('approval requires actor and timestamp', async () => {
  await migrate();
  await denied(() => db.query("UPDATE tbl_return_requests SET status='aprobada' WHERE id=$1", [requestA]));
  await approve();
  assert.equal((await db.query('SELECT status FROM tbl_return_requests WHERE id=$1', [requestA])).rows[0].status, 'aprobada');
});

test('rejection requires a nonblank reason limited to 500 characters', async () => {
  await migrate();
  for (const reason of [null, '', '   ', 'x'.repeat(501)]) {
    await denied(() => db.query(`UPDATE tbl_return_requests SET status='rechazada',decided_by=$2,
      decided_at='2026-11-12Z',rejection_reason=$3 WHERE id=$1`, [requestA, reviewerA, reason]));
  }
  await db.query(`UPDATE tbl_return_requests SET status='rechazada',decided_by=$2,
    decided_at='2026-11-12Z',rejection_reason='Motivo de prueba' WHERE id=$1`, [requestA, reviewerA]);
});

test('pending and approved requests cannot carry rejection metadata', async () => {
  await migrate();
  await denied(() => db.query('UPDATE tbl_return_requests SET decided_by=$2 WHERE id=$1', [requestA, reviewerA]));
  await denied(() => db.query(`UPDATE tbl_return_requests SET status='aprobada',decided_by=$2,
    decided_at='2026-11-12Z',rejection_reason='No corresponde' WHERE id=$1`, [requestA, reviewerA]));
});

test('a decision cannot use an actor from another organization', async () => {
  await migrate(); await denied(() => approve(requestA, reviewerB));
});

test('a final decision cannot be rewritten or returned to pending', async () => {
  await migrate(); await approve();
  await db.query('UPDATE tbl_return_requests SET status=status WHERE id=$1', [requestA]);
  await denied(() => db.query(`UPDATE tbl_return_requests SET status='pendiente_asignacion',
    decided_by=NULL,decided_at=NULL WHERE id=$1`, [requestA]));
  await denied(() => db.query("UPDATE tbl_return_requests SET decided_at='2026-11-13Z' WHERE id=$1", [requestA]));
});

test('request identity and historical destination cannot be reassigned', async () => {
  await migrate();
  await denied(() => db.query('UPDATE tbl_return_requests SET customer_id=$2 WHERE id=$1', [requestA, companyB]));
});

test('new requests reject a company or author from another organization', async () => {
  await migrate();
  const create = pythonSQL('backend/admin/src/admin_return_requests_sql.py', 'INSERT_REQUEST_SQL');
  await denied(() => db.query(create, [orgA, companyB, authorA, 'SOL-BAD-COMPANY']));
  await denied(() => db.query(create, [orgA, companyA, authorB, 'SOL-BAD-AUTHOR']));
});

test('physical links require an approved request and matching operational identity', async () => {
  await migrate(); await denied(() => link());
  await approve();
  await denied(() => link({ guide: guideB }));
  await denied(() => link({ item: itemB }));
  await denied(() => link({ type: 'contracamion' }));
  assert.equal((await link()).rows.length, 1);
});

test('same request item and guide cannot create duplicate physical returns', async () => {
  await migrate(); await approve(); await link();
  await denied(() => link({ number: 'TEST-LINK-RETRY' }), '23505');
});

test('physical links cannot be removed but warehouse status updates remain possible', async () => {
  await migrate(); await approve(); const id = (await link()).rows[0].id;
  await db.query("UPDATE tbl_returns SET status='received' WHERE id=$1", [id]);
  await denied(() => db.query('UPDATE tbl_returns SET request_item_id=NULL WHERE id=$1', [id]));
});

test('rollback before use preserves all legacy data and is idempotent', async () => {
  const requests = (await db.query('SELECT * FROM tbl_return_requests ORDER BY id')).rows;
  const returns = (await db.query('SELECT * FROM tbl_returns ORDER BY id')).rows;
  await migrate(); await rollback(); await rollback();
  assert.deepEqual((await db.query('SELECT * FROM tbl_return_requests ORDER BY id')).rows, requests);
  assert.deepEqual((await db.query('SELECT * FROM tbl_returns ORDER BY id')).rows, returns);
  await denied(() => db.query("UPDATE tbl_return_requests SET status='aprobada' WHERE id=$1", [requestA]));
  await migrate();
  assert.ok((await columns('tbl_returns')).includes('request_item_id'));
});

test('rollback refuses to erase a decision or link and leaves schema intact', async () => {
  await migrate(); await approve(); await link();
  await denied(() => rollback(), 'P0001');
  assert.ok((await columns('tbl_returns')).includes('request_item_id'));
  assert.equal((await db.query('SELECT status FROM tbl_return_requests WHERE id=$1', [requestA])).rows[0].status, 'aprobada');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM tbl_returns WHERE request_item_id IS NOT NULL')).rows[0].n, 1);
});

test('a commercial decision alone blocks rollback even before a physical return exists', async () => {
  await migrate(); await approve();
  await denied(() => rollback(), 'P0001');
  assert.ok((await columns('tbl_return_requests')).includes('decided_by'));
  assert.equal((await db.query('SELECT decided_by FROM tbl_return_requests WHERE id=$1', [requestA])).rows[0].decided_by, reviewerA);
});

test('historical destination survives a later reassignment of the client user', async () => {
  await migrate();
  await db.query('UPDATE tbl_app_users SET customer_id=NULL WHERE id=$1', [authorA]);
  await approve();
  assert.equal((await db.query('SELECT customer_id FROM tbl_return_requests WHERE id=$1', [requestA])).rows[0].customer_id, companyA);
});

test('rollback preserves requested items and evidence, and linked records resist cascading deletion', async () => {
  await db.query(`INSERT INTO tbl_return_request_files(item_id,s3_key,kind,mime_type,size_bytes)
    VALUES($1,'TEST-ONLY/evidence.jpg','photo','image/jpeg',123)`, [itemA]);
  const items = (await db.query('SELECT * FROM tbl_return_request_items ORDER BY id')).rows;
  const files = (await db.query('SELECT * FROM tbl_return_request_files ORDER BY id')).rows;
  await migrate(); await rollback();
  assert.deepEqual((await db.query('SELECT * FROM tbl_return_request_items ORDER BY id')).rows, items);
  assert.deepEqual((await db.query('SELECT * FROM tbl_return_request_files ORDER BY id')).rows, files);
  await migrate(); await approve(); await link();
  await denied(() => db.query('DELETE FROM tbl_return_requests WHERE id=$1', [requestA]), '23001'); // restrict_violation
  assert.deepEqual((await db.query('SELECT * FROM tbl_return_request_files ORDER BY id')).rows, files);
});

test('outer migration-runner transaction can dry-run without persisting schema', async () => {
  // Mismas expresiones que scripts/run-migration.mjs; BEGIN debe ir antes del encabezado.
  const sql = readFileSync(forwardPath, 'utf8')
    .replace(/^\s*begin\s*;\s*/i, '').replace(/\s*commit\s*;\s*$/i, '');
  await db.exec('BEGIN'); await db.exec(sql); await db.exec('ROLLBACK');
  assert.ok(!(await columns('tbl_returns')).includes('request_item_id'));
});
