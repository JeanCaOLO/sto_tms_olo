// Ejecuta el guard real de marcas en PostgreSQL aislado. Sin Aurora ni archivos de entorno.
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const modulePath = process.env.TMS_T03_PGLITE_MODULE || join(tmpdir(),
  'tms-t03-postgres-tools/node_modules/@electric-sql/pglite/dist/index.js');
const { PGlite } = await import(pathToFileURL(resolve(modulePath)).href);
const cases = JSON.parse(execFileSync('python', ['-c', `
import json,sys
sys.path.insert(0,sys.argv[1])
from conftest import load_stack_module
sql=load_stack_module('tarifas','tarifas_sql')
schema=load_stack_module('tarifas','tarifas_schema')
t=schema.table('tarifas_trip_order_marks')
cases={'clear': {'reason':None}, 'annul': {'mark':'ANULADO'},
       'defer': {'mark':'DIFERIDO','reason':None}, 'valid': {'mark':'ANULADO','reason':' Nuevo motivo '}}
print(json.dumps({key:sql.build_update(t,'mark-1',value,None) for key,value in cases.items()}))
`, join(root, 'backend/tests')], { encoding: 'utf8' }));
function query(name) {
  const [sql, params] = cases[name];
  let n = 0;
  return db.query(sql.replace(/%s/g, () => `$${++n}`), params);
}
let db;
before(async () => {
  db = new PGlite('memory://');
  await db.waitReady;
  await db.exec('CREATE TABLE tbl_tarifas_trip_order_marks(id text PRIMARY KEY,mark text,reason text)');
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("DELETE FROM tbl_tarifas_trip_order_marks; INSERT INTO tbl_tarifas_trip_order_marks VALUES('mark-1','ANULADO','Motivo original')");
});
test('reason-only update cannot erase the reason of an annulled order', async () => {
  assert.equal((await query('clear')).rows.length, 0);
  assert.equal((await db.query('SELECT reason FROM tbl_tarifas_trip_order_marks')).rows[0].reason, 'Motivo original');
});
test('a deferred order may have no reason, but cannot become annulled until a reason exists', async () => {
  await db.exec("UPDATE tbl_tarifas_trip_order_marks SET mark='DIFERIDO',reason=NULL");
  assert.equal((await query('clear')).rows.length, 1);
  assert.equal((await query('annul')).rows.length, 0);
});
test('annul without replacing an existing valid reason remains compatible', async () => {
  assert.equal((await query('annul')).rows.length, 1);
  assert.equal((await query('valid')).rows[0].reason, 'Nuevo motivo');
});
test('switching to deferred permits clearing the old annulment reason atomically', async () => {
  const row = (await query('defer')).rows[0];
  assert.equal(row.mark, 'DIFERIDO');
  assert.equal(row.reason, null);
});
