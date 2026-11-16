// Sentencias producidas por la API real, ejecutadas en PostgreSQL en memoria.
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
from conftest import load_stack_module,make_permissions,http_event
from test_tarifas_proforma_content import ContentDb,ITEM
from tms_common import pg
app=load_stack_module('tarifas')
caller=make_permissions(is_admin=True)
event=http_event('POST /api/tarifas/tx',user={'id':'test-user','email':'test@example.invalid'})
cases={
 'exclude':[{'op':'update','table':'tarifas_proforma_items','id':'pri_1','values':{'state':'excluded','exclusion_reason':'Test'}}],
 'include':[{'op':'update','table':'tarifas_proforma_items','id':'pri_1','values':{'state':'included','exclusion_reason':None}}],
 'parent_total':[{'op':'update','table':'tarifas_proformas','id':'pro_1','values':{'total_amount':'999'}}],
 'insert':[{'op':'insert','table':'tarifas_proforma_items','values':{**ITEM,'id':'pri_3','settlement_id':'liq_3'}}]
}
result={}
for name,ops in cases.items():
 db=ContentDb(); pg.transaction=db.transaction
 app._execute_writes(caller,[(op,app._planned(caller,op,event)) for op in ops])
 result[name]=db.tx_calls
print(json.dumps(result))
`, join(root, 'backend/tests')], { encoding: 'utf8' }));
let db;
before(async () => {
  db = new PGlite('memory://');
  await db.waitReady;
  await db.exec(`CREATE TABLE tbl_tarifas_proformas(id text PRIMARY KEY,country_id uuid,carrier_id uuid,
    status text,total_amount numeric,updated_at timestamptz);
    CREATE TABLE tbl_tarifas_proforma_items(id text PRIMARY KEY,proforma_id text,settlement_id text,
      state text,exclusion_reason text,amount numeric,UNIQUE(proforma_id,settlement_id));
    CREATE TABLE tbl_tarifas_proforma_phases(id text PRIMARY KEY,proforma_id text,state text);
    CREATE TABLE tbl_tarifas_settlements(id text PRIMARY KEY,total_amount numeric,country_id uuid,carrier_id uuid,
      status text,superseded_by text,updated_at timestamptz);`);
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`TRUNCATE tbl_tarifas_proforma_items,tbl_tarifas_proformas,tbl_tarifas_settlements;
    INSERT INTO tbl_tarifas_proformas VALUES('pro_1','22222222-2222-2222-2222-222222222221',
      '22222222-2222-2222-2222-222222222221','En Revisión',999,now());
    INSERT INTO tbl_tarifas_settlements
      SELECT 'liq_'||n,10,'22222222-2222-2222-2222-222222222221',
        '22222222-2222-2222-2222-222222222221','En Revisión',NULL,now() FROM generate_series(1,3)n;
    INSERT INTO tbl_tarifas_proforma_items VALUES('pri_1','pro_1','liq_1','included',NULL,10),
      ('pri_2','pro_1','liq_2','included',NULL,20);`);
});
async function execute(name) {
  await db.exec('BEGIN');
  try {
    for (const [sql, params] of cases[name]) {
      let n = 0;
      await db.query(sql.replace(/%s/g, () => `$${++n}`), params);
    }
    await db.exec('COMMIT');
  } catch (error) { await db.exec('ROLLBACK'); throw error; }
}
async function total() {
  return Number((await db.query("SELECT total_amount FROM tbl_tarifas_proformas WHERE id='pro_1'")).rows[0].total_amount);
}
test('exclusion recalculates the exact total from included rows in the same transaction', async () => {
  await execute('exclude');
  assert.equal(await total(), 20);
  assert.equal((await db.query("SELECT status FROM tbl_tarifas_settlements WHERE id='liq_1'")).rows[0].status,'Borrador');
});
test('reincluding restores the total without accepting the client total', async () => {
  await execute('exclude');
  await execute('include');
  assert.equal(await total(), 30);
  assert.equal((await db.query("SELECT status FROM tbl_tarifas_settlements WHERE id='liq_1'")).rows[0].status,'En Revisión');
});
test('a standalone parent total PATCH derives its value from actual items', async () => {
  await execute('parent_total');
  assert.equal(await total(), 30);
});
test('adding an item recalculates the parent from the actual inserted amount', async () => {
  await execute('insert');
  assert.equal(await total(), 40);
});
