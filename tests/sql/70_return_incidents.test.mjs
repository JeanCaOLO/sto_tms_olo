// Novedades, foto existente, conteos y gate con SQL real en PostgreSQL en memoria.
import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {PGlite}=await import(pathToFileURL(resolve(process.env.TMS_T03_PGLITE_MODULE||join(tmpdir(),'tms-t03-postgres-tools/node_modules/@electric-sql/pglite/dist/index.js'))).href);
const forward=readFileSync(join(root,'sql/70_return_incidents.sql'),'utf8');
const rollback=readFileSync(join(root,'sql/70_return_incidents_rollback.sql'),'utf8');
const source=JSON.parse(execFileSync('python',['-c',`import json,runpy,sys
root=sys.argv[1]
m=runpy.run_path(root+'/backend/admin/src/admin_returns_sql.py')
n=runpy.run_path(root+'/backend/admin/src/admin_return_incidents_sql.py')
print(json.dumps({**{k:v for k,v in m.items() if k.endswith('_SQL')},**{k:v for k,v in n.items() if k.endswith('_SQL')}}))`,root],{encoding:'utf8'}));
const gate=readFileSync(join(root,'backend/tarifas/src/returns_gate.py'),'utf8').match(/OPEN_RETURNS_SQL = """([\s\S]*?)"""/)[1];
const u=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function bound(sql){let n=0;return sql.replace(/%s/g,()=>`$${++n}`);}
let db;
before(async()=>{db=new PGlite('memory://');await db.waitReady;});
after(async()=>{await db?.close();});
beforeEach(async()=>{
 await db.exec(`DROP SCHEMA public CASCADE;CREATE SCHEMA public;SET client_min_messages=warning;
 CREATE TABLE tbl_organizations(id uuid PRIMARY KEY);
 CREATE TABLE tbl_app_users(id uuid PRIMARY KEY,organization_id uuid);
 CREATE TABLE tbl_stores(id uuid PRIMARY KEY,country_id uuid);
 CREATE TABLE tbl_drivers(id uuid PRIMARY KEY,full_name text);
 CREATE TABLE tbl_carriers(id uuid PRIMARY KEY,name text);
 CREATE TABLE tbl_routes(id uuid PRIMARY KEY,organization_id uuid,route_number varchar(100),route_date date,
  plan_trip_id uuid,status text,driver_id uuid,carrier_id uuid,store_id uuid);
 CREATE TABLE tbl_dispatch_guides(id uuid PRIMARY KEY,route_id uuid,sequence_number integer);
 CREATE TABLE tbl_orders(id uuid PRIMARY KEY,order_number text,invoice_number text);
 CREATE TABLE tbl_returns(id uuid PRIMARY KEY,organization_id uuid,dispatch_guide_id uuid,order_id uuid,status text,
  return_date timestamptz,quantity integer,received_quantity integer,received_condition text,updated_at timestamptz,
  return_number text,return_type text,reason text,product_code text,product_name text,photo_url text,notes text,
  received_at timestamptz,received_by uuid,
  CONSTRAINT ck_return_status CHECK(status IN ('pending','approved','received','completed','rejected','cancelled')));
 CREATE TABLE tbl_return_forms(id uuid PRIMARY KEY,route_id uuid,form_number text);
 CREATE TABLE tbl_return_form_items(return_id uuid,form_id uuid);`);
 await db.query('INSERT INTO tbl_organizations VALUES($1),($2)',[u(1),u(2)]);
 await db.query('INSERT INTO tbl_app_users VALUES($1,$2),($3,$4)',[u(10),u(1),u(11),u(2)]);
 await db.query('INSERT INTO tbl_stores VALUES($1,$2)',[u(5),u(3)]);
 await db.query("INSERT INTO tbl_routes(id,organization_id,route_number,route_date,status,store_id) VALUES($1,$2,'TEST','2026-11-12','completed',$3)",[u(20),u(1),u(5)]);
 await db.query('INSERT INTO tbl_dispatch_guides VALUES($1,$2,1)',[u(30),u(20)]);
 await db.query("INSERT INTO tbl_orders VALUES($1,'ORDER-TEST','INV-TEST')",[u(35)]);
 await db.query(`INSERT INTO tbl_returns(id,organization_id,dispatch_guide_id,order_id,status,quantity,return_number,return_type,photo_url)
 VALUES($1,$2,$3,$4,'pending',3,'RET-TEST','recolecta','pedidos/TEST/photo_return-test.jpg')`,[u(40),u(1),u(30),u(35)]);
 const original=readFileSync(join(root,'sql/65_fix_pending_returns_count.sql'),'utf8').match(/create view vw_return_trips as[\s\S]*?;/i)[0];
 await db.exec(original);
});
async function migrate(){if(process.env.TMS_TEST_SKIP_SQL70!=='1')await db.exec(forward);}
async function record({author=10,org=1,text='Falta una caja.',id=50,key=60}={}){
 await db.exec('BEGIN');
 try{
  const row=(await db.query(bound(source.RETURN_SQL.replace('{scope}','')+' FOR UPDATE OF rt'),[u(40),u(1)])).rows[0];
  await db.query(bound(source.INSERT_INCIDENT_SQL),[u(id),u(org),u(40),u(key),text,u(author),row.status,row.received_quantity,row.received_condition]);
  await db.query(bound(source.MARK_REVIEW_SQL),[u(40),u(1)]);
  await db.exec('COMMIT');
 }catch(error){await db.exec('ROLLBACK');throw error;}
}
test('new review blocks the real gate and cannot appear ready or normally pending',async()=>{
 await migrate();await record();
 const trip=(await db.query('SELECT * FROM vw_return_trips')).rows[0];
 assert.equal(trip.pending_returns,1);assert.equal(trip.open_returns,0);assert.equal(trip.incident_returns,1);
 assert.equal((await db.query(bound(gate),[u(20)])).rows[0].open_returns,1);
 const summary=(await db.query(bound(source.SUMMARY_SQL.replace('{filters}','').replace('{scope}','')),[u(1)])).rows[0];
 assert.equal(summary.trips_ready,0);assert.equal(summary.trips_pending,0);assert.equal(summary.returns_pending,0);assert.equal(summary.returns_incidents,1);
 for(const [filter,expected] of [[' AND open_returns > 0',0],[' AND incident_returns > 0',1],[' AND pending_returns = 0',0]]){
  const rows=(await db.query(bound(source.TRIPS_SQL.replace('{filters}',filter).replace('{scope}','')),[u(1),100])).rows;
  assert.equal(rows.length,expected);
 }
});
test('detail retains the same tracking photo and displays the immutable incident text',async()=>{
 await migrate();await record();
 const row=(await db.query(bound(source.RETURNS_SQL),[u(20),u(1)])).rows[0];
 assert.equal(row.photo_url,'pedidos/TEST/photo_return-test.jpg');assert.equal(row.incident_explanation,'Falta una caja.');
 assert.equal(row.status,'in_review');
});
test('history cannot be edited/deleted or attributed to a foreign organization',async()=>{
 await migrate();await assert.rejects(record({author:11}),e=>e.code==='23514');
 await record();
 await assert.rejects(db.query('UPDATE tbl_return_incidents SET explanation=$1',['Otra historia']),e=>e.code==='23514');
 await assert.rejects(db.exec('DELETE FROM tbl_return_incidents'),e=>e.code==='23514');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM tbl_return_incidents')).rows[0].n,1);
});
test('normal receive-all cannot erase a review incident',async()=>{
 await migrate();await record();
 const received=await db.query(bound(source.RECEIVE_ALL_SQL),[u(10),'Bueno',u(20),u(1)]);
 assert.equal(received.rows.length,0);
 assert.equal((await db.query('SELECT status FROM tbl_returns')).rows[0].status,'in_review');
});
test('a direct incident insert cannot commit without moving its return into review',async()=>{
 await migrate();
 await assert.rejects(db.query(bound(source.INSERT_INCIDENT_SQL),
  [u(50),u(1),u(40),u(60),'Falta una caja.',u(10),'pending',null,null]),e=>e.code==='23514');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM tbl_return_incidents')).rows[0].n,0);
});
test('unused rollback preserves data and is idempotent',async()=>{
 const before=(await db.query('SELECT * FROM tbl_returns')).rows;
 await migrate();await migrate();await db.exec(rollback);await db.exec(rollback);
 assert.deepEqual((await db.query('SELECT * FROM tbl_returns')).rows,before);
});
test('rollback refuses to remove a used incident or unblock a review',async()=>{
 await migrate();await record();
 await assert.rejects(db.exec(rollback),e=>e.code==='P0001');await db.exec('ROLLBACK');
 assert.equal((await db.query('SELECT status FROM tbl_returns')).rows[0].status,'in_review');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM tbl_return_incidents')).rows[0].n,1);
});
