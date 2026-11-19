// Resolucion de novedades con SQL real en PostgreSQL en memoria (PGlite de una instancia: no prueba concurrencia).
import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {PGlite}=await import(pathToFileURL(resolve(process.env.TMS_T03_PGLITE_MODULE||join(tmpdir(),'tms-t03-postgres-tools/node_modules/@electric-sql/pglite/dist/index.js'))).href);
const forward70=readFileSync(join(root,'sql/70_return_incidents.sql'),'utf8');
const forward=readFileSync(join(root,'sql/75_return_incident_resolutions.sql'),'utf8');
const rollback=readFileSync(join(root,'sql/75_return_incident_resolutions_rollback.sql'),'utf8');
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
 await db.exec(forward70);
});
async function migrate(){await db.exec(forward);}
async function record({id=50,key=60,text='Falta una caja.'}={}){
 await db.exec('BEGIN');
 try{
  const row=(await db.query(bound(source.RETURN_SQL.replace('{scope}','')+' FOR UPDATE OF rt'),[u(40),u(1)])).rows[0];
  await db.query(bound(source.INSERT_INCIDENT_SQL),[u(id),u(1),u(40),u(key),text,u(10),row.status,row.received_quantity,row.received_condition]);
  await db.query(bound(source.MARK_REVIEW_SQL),[u(40),u(1)]);
  await db.exec('COMMIT');
 }catch(error){await db.exec('ROLLBACK');throw error;}
}
// Mismo orden que el handler: primero la resolucion, luego el cambio de estado, en una transaccion.
async function resolveIncident({incident=50,id=70,key=80,by=10,org=1,outcome='restored',status,quantity=null,condition=null,stamp=false}={}){
 await db.exec('BEGIN');
 try{
  const inc=(await db.query('SELECT * FROM tbl_return_incidents WHERE id=$1',[u(incident)])).rows[0];
  const target=status??(outcome==='restored'?inc.previous_status:'received');
  await db.query(bound(source.INSERT_RESOLUTION_SQL),[u(id),u(org),u(40),u(incident),u(key),outcome,'Revisado con bodega.',u(by),target,quantity,condition]);
  await db.query(bound(source.LEAVE_REVIEW_SQL),[target,quantity,condition,stamp,stamp,u(by),u(40),u(1)]);
  await db.exec('COMMIT');
 }catch(error){await db.exec('ROLLBACK');throw error;}
}
const status=async()=>(await db.query('SELECT status,received_quantity,received_condition,received_by FROM tbl_returns')).rows[0];
const gateOpen=async()=>(await db.query(bound(gate),[u(20)])).rows[0].open_returns;

test('restoring leaves review, restores the previous state and releases the gate',async()=>{
 await migrate();await record();
 assert.equal(await gateOpen(),1);
 await resolveIncident({outcome:'restored'});
 const row=await status();
 assert.equal(row.status,'pending');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM tbl_return_incident_resolutions')).rows[0].n,1);
 // pending sigue bloqueando hasta recibir: resolver no libera el viaje por si solo.
 assert.equal(await gateOpen(),1);
});
test('accepting with explicit amounts marks the return received and releases the gate',async()=>{
 await migrate();await record();
 await resolveIncident({outcome:'accepted',quantity:2,condition:'Dañado',stamp:true});
 const row=await status();
 assert.equal(row.status,'received');assert.equal(row.received_quantity,2);assert.equal(row.received_condition,'Dañado');
 assert.equal(row.received_by,u(10));
 assert.equal(await gateOpen(),0);
 const trip=(await db.query('SELECT * FROM vw_return_trips')).rows[0];
 assert.equal(trip.incident_returns,0);assert.equal(trip.pending_returns,0);
});
test('history joins the resolution to its incident',async()=>{
 await migrate();await record();await resolveIncident({outcome:'accepted',quantity:2,condition:'Dañado',stamp:true});
 const rows=(await db.query(bound(source.HISTORY_SQL),[u(1),u(40),25,0])).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].resolution_outcome,'accepted');assert.equal(rows[0].resolved_by,u(10));
 assert.equal(rows[0].resulting_status,'received');
});
test('a plain status update cannot take a return out of review',async()=>{
 await migrate();await record();
 for(const target of ['received','pending','approved','rejected']){
  await assert.rejects(db.query('UPDATE tbl_returns SET status=$1',[target]),e=>e.code==='23514');
 }
 assert.equal((await status()).status,'in_review');
});
test('a resolution that does not move the return commits nothing',async()=>{
 await migrate();await record();
 await db.exec('BEGIN');
 await db.query(bound(source.INSERT_RESOLUTION_SQL),[u(70),u(1),u(40),u(50),u(80),'restored','Motivo.',u(10),'pending',null,null]);
 await assert.rejects(db.exec('COMMIT'),e=>e.code==='23514');await db.exec('ROLLBACK');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM tbl_return_incident_resolutions')).rows[0].n,0);
 assert.equal((await status()).status,'in_review');
});
test('resolution history is immutable and one per incident',async()=>{
 await migrate();await record();await resolveIncident({outcome:'restored'});
 await assert.rejects(db.query("UPDATE tbl_return_incident_resolutions SET note='otra'"),e=>e.code==='23514');
 await assert.rejects(db.exec('DELETE FROM tbl_return_incident_resolutions'),e=>e.code==='23514');
 await assert.rejects(resolveIncident({id:71,key:81}),e=>e.code==='23514');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM tbl_return_incident_resolutions')).rows[0].n,1);
});
test('only the latest incident of a review can be resolved, and not by a foreign user',async()=>{
 await migrate();await record();await resolveIncident({outcome:'restored'});
 await record({id:51,key:61,text:'Otra vez.'});
 await assert.rejects(resolveIncident({incident:50,id:72,key:82}),e=>e.code==='23514');
 await assert.rejects(resolveIncident({incident:51,id:73,key:83,by:11}),e=>e.code==='23514');
 assert.equal((await status()).status,'in_review');
 await resolveIncident({incident:51,id:74,key:84});
 assert.equal((await status()).status,'pending');
});
test('a return that is not in review cannot be resolved',async()=>{
 await migrate();await record();await resolveIncident({outcome:'restored'});
 await db.exec("UPDATE tbl_returns SET status='pending'");
 await assert.rejects(resolveIncident({incident:50,id:75,key:85}),e=>e.code==='23514');
});
test('unused rollback preserves data and is idempotent',async()=>{
 const before=(await db.query('SELECT * FROM tbl_returns')).rows;
 await migrate();await migrate();await db.exec(rollback);await db.exec(rollback);
 assert.deepEqual((await db.query('SELECT * FROM tbl_returns')).rows,before);
 assert.equal((await db.query("SELECT to_regclass('public.tbl_return_incident_resolutions') AS t")).rows[0].t,null);
});
test('rollback refuses to remove a used resolution',async()=>{
 await migrate();await record();await resolveIncident({outcome:'restored'});
 await assert.rejects(db.exec(rollback),e=>e.code==='P0001');await db.exec('ROLLBACK');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM tbl_return_incident_resolutions')).rows[0].n,1);
});

test('leaving review rejects receipt values different from the resolution',async()=>{
 await migrate();await record();await db.exec('BEGIN');
 await db.query(bound(source.INSERT_RESOLUTION_SQL),[u(70),u(1),u(40),u(50),u(80),'accepted','Motivo.',u(10),'received',1,'Bueno']);
 await assert.rejects(db.query(bound(source.LEAVE_REVIEW_SQL),['received',2,'Incompleto',true,true,u(10),u(40),u(1)]),e=>e.code==='23514');
 await db.exec('ROLLBACK');
 assert.equal((await status()).status,'in_review');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM tbl_return_incident_resolutions')).rows[0].n,0);
});

test('deferred guard rejects receipt changes after the valid transition in the same transaction',async()=>{
 await migrate();await record();await db.exec('BEGIN');
 await db.query(bound(source.INSERT_RESOLUTION_SQL),[u(70),u(1),u(40),u(50),u(80),'accepted','Motivo.',u(10),'received',1,'Bueno']);
 await db.query(bound(source.LEAVE_REVIEW_SQL),['received',1,'Bueno',true,true,u(10),u(40),u(1)]);
 await db.exec("UPDATE tbl_returns SET received_quantity=2,received_condition='Incompleto'");
 await assert.rejects(db.exec('COMMIT'),e=>e.code==='23514');await db.exec('ROLLBACK');
 assert.equal((await status()).status,'in_review');
});

test('an old resolution cannot authorize a new exit from review',async()=>{
 await migrate();await record();await resolveIncident({outcome:'restored'});
 await db.exec("UPDATE tbl_returns SET status='in_review'");
 await assert.rejects(db.exec("UPDATE tbl_returns SET status='pending'"),e=>e.code==='23514');
 assert.equal((await status()).status,'in_review');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM tbl_return_incident_resolutions')).rows[0].n,1);
});
