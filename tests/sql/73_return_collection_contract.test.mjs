import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const modulePath=process.env.TMS_T03_PGLITE_MODULE||join(tmpdir(),'tms-t03-postgres-tools/node_modules/@electric-sql/pglite/dist/index.js');
const {PGlite}=await import(pathToFileURL(resolve(modulePath)).href);
const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const forward=read('sql/73_return_collection_contract.sql'),rollback=read('sql/73_return_collection_contract_rollback.sql');
const source=read('backend/admin/src/admin_return_collection_sql.py');
function sql(name){let n=0;return source.match(new RegExp(name+' = """([\\s\\S]*?)"""'))[1].replace(/%s/g,()=>`$${++n}`).replace('{access}',`r.organization_id='${u(1)}'`);}
const u=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let db;
before(async()=>{db=new PGlite('memory://');await db.waitReady;});
after(async()=>{await db?.close();});
beforeEach(async()=>{
 await db.exec(`DROP SCHEMA public CASCADE;CREATE SCHEMA public;
 CREATE TABLE tbl_app_users(id uuid primary key);
 CREATE TABLE tbl_customers(id uuid primary key,warehouse_id uuid);
 CREATE TABLE tbl_warehouses(id uuid primary key,organization_id uuid);
 CREATE TABLE tbl_routes(id uuid primary key);
 CREATE TABLE tbl_dispatch_guides(id uuid primary key);
 CREATE TABLE tbl_tracking_evidences(id uuid primary key);
 CREATE TABLE tbl_returns(id uuid primary key,request_item_id uuid,received_quantity int,status text,updated_at timestamptz default now());
 CREATE TABLE tbl_return_requests(id uuid primary key,organization_id uuid,customer_id uuid,status text,created_at timestamptz default now());
 CREATE TABLE tbl_order_items(id uuid primary key,presentation text);
 CREATE TABLE tbl_return_request_items(id uuid primary key,request_id uuid,order_item_id uuid,line_number int,product_code text,product_name text,quantity int);
 CREATE TABLE tbl_return_request_origins(request_id uuid primary key,snapshot jsonb);
 INSERT INTO tbl_app_users VALUES('${u(2)}');INSERT INTO tbl_customers VALUES('${u(3)}',NULL);
 INSERT INTO tbl_return_requests(id,organization_id,customer_id,status) VALUES('${u(4)}','${u(1)}','${u(3)}','aprobada');
 INSERT INTO tbl_order_items VALUES('${u(5)}','CAJA');
 INSERT INTO tbl_return_request_items VALUES('${u(6)}','${u(4)}','${u(5)}',1,'SKU','Producto',10);
 INSERT INTO tbl_return_request_origins VALUES('${u(4)}','{"address":"Calle A"}');`);
 await db.exec(forward);
});
async function enqueue(){return (await db.query(sql('ENQUEUE_SQL'),[u(4)])).rows[0];}
test('outbox transaccional, payload versionado y deduplicación por solicitud',async()=>{
 await db.exec('BEGIN');await enqueue();await db.exec('ROLLBACK');
 assert.equal((await db.query('SELECT * FROM tbl_return_request_outbox')).rows.length,0);
 await enqueue();assert.equal(await enqueue(),undefined);
 const row=(await db.query('SELECT * FROM tbl_return_request_outbox')).rows[0];
 assert.equal(row.payload.event_id,row.id);assert.equal(row.payload.schema_version,1);
 assert.equal(row.payload.items[0].request_item_id,u(6));assert.equal(row.payload.items[0].presentation,'CAJA');
});
test('lease, caída sin acuse, recuperación, acuse con token y agotamiento',async()=>{
 const {id}=await enqueue();const first=(await db.query(sql('CLAIM_SQL'))).rows[0];
 assert.equal((await db.query(sql('CLAIM_SQL'))).rows.length,0);
 await db.exec("UPDATE tbl_return_request_outbox SET lease_until=now()-interval '1 minute',available_at=now()-interval '1 minute'");
 const second=(await db.query(sql('CLAIM_SQL'))).rows[0];
 assert.equal(second.id,id);assert.notEqual(second.lease_token,first.lease_token);assert.equal(second.attempts,2);
 assert.equal((await db.query(sql('ACK_SQL'),[u(7),id,first.lease_token])).rows.length,0);
 assert.equal((await db.query(sql('ACK_SQL'),[u(7),id,second.lease_token])).rows.length,1);
 assert.equal((await db.query(sql('CLAIM_SQL'))).rows.length,0);
 await db.exec("UPDATE tbl_return_request_outbox SET status='leased',attempts=8,lease_until=now()-interval '1 minute'");
 await db.query(sql('EXHAUST_SQL'));
 assert.equal((await db.query('SELECT status FROM tbl_return_request_outbox')).rows[0].status,'failed');
 await db.query(sql('RETRY_SQL'),[u(4)]);
 assert.equal((await db.query(sql('CLAIM_SQL'))).rows[0].id,id);
});
test('historial inmutable y rollback rechaza incluso mensajes todavía pendientes',async()=>{
 await db.exec(forward);await db.exec(rollback);await db.exec(rollback);await db.exec(forward);
 const {id}=await enqueue();
 await db.query(sql('INSERT_EVENT_SQL'),[u(7),u(4),id,'planning.received','{}',u(2),'2026-11-13T15:00:00Z']);
 await assert.rejects(db.exec("UPDATE tbl_return_collection_events SET payload='{}'"),/inmutable/);
 await assert.rejects(db.exec(rollback),/historial/);await db.exec('ROLLBACK');
 assert.equal((await db.query('SELECT * FROM tbl_return_collection_events')).rows.length,1);
});
test('consulta real de seguimiento usa cantidades aceptadas y retorno por intento',async()=>{
 const {id}=await enqueue();
 await db.exec(`INSERT INTO tbl_routes VALUES('${u(8)}');INSERT INTO tbl_dispatch_guides VALUES('${u(9)}');
 INSERT INTO tbl_tracking_evidences VALUES('${u(10)}');
 INSERT INTO tbl_return_collection_events VALUES('${u(11)}','${u(4)}','${id}','planning.assigned','{}','${u(2)}',now(),now());
 INSERT INTO tbl_return_collection_assignments VALUES('${u(12)}','${u(6)}','${u(13)}','${u(8)}','${u(9)}',5,'${u(11)}',now());
 INSERT INTO tbl_return_collection_events VALUES('${u(14)}','${u(4)}','${id}','tracking.collected','{}','${u(2)}',now(),now());
 INSERT INTO tbl_return_collection_results(attempt_id,event_id,quantity,photo_evidence_id,signature_evidence_id)
 VALUES('${u(13)}','${u(14)}',3,'${u(10)}','${u(10)}');`);
 const progress=read('backend/admin/src/admin_return_tracking.py').match(/PROGRESS_SQL = """([\s\S]*?)"""/)[1].replace('%s','$1');
 let row=(await db.query(progress,[[u(4)]])).rows[0];
 assert.equal(row.item_progress[0].assigned,0);assert.equal(row.item_progress[0].collected,3);assert.equal(row.item_progress[0].delivered,0);
 assert.equal(row.tracking[0].attempt_id,u(13));
 await assert.rejects(db.exec('UPDATE tbl_return_collection_results SET quantity=4'),/inmutables/);
 await db.exec(`INSERT INTO tbl_returns(id,request_item_id,received_quantity,status) VALUES('${u(15)}','${u(6)}',NULL,'pending');
 INSERT INTO tbl_return_collection_events VALUES('${u(16)}','${u(4)}','${id}','tracking.delivered','{}','${u(2)}',now(),now());
 UPDATE tbl_return_collection_results SET delivered_event_id='${u(16)}',return_id='${u(15)}';`);
 row=(await db.query(progress,[[u(4)]])).rows[0];assert.equal(row.item_progress[0].delivered,3);assert.equal(row.item_progress[0].received,0);
});
test('el esquema privado preparado por el arnés PostgreSQL compila sin alterar public',async()=>{
 const harness=read('tests/postgres/test_returns_concurrency.py');
 const ddl=harness.match(/run\(connection,'''([\s\S]*?)'''\)/)[1];
 const schema='returns_codex_fixture';
 await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},public;${ddl}`);
 for(const path of ['sql/72_return_request_origin_balance.sql','sql/73_return_collection_contract.sql']){
  const migration=read(path).replaceAll('public.',`${schema}.`).replace('begin;','').replace(/commit;\s*$/,'');
  await db.exec(migration);
 }
 assert.equal((await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=$1",[schema])).rows.length,18);
 await db.exec(`SET search_path TO public;DROP SCHEMA ${schema} CASCADE`);
});
