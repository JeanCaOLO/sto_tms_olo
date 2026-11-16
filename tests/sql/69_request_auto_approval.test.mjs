// Autoaprobación persistida, legado e idempotencia sobre PostgreSQL aislado.
import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const modulePath=process.env.TMS_T03_PGLITE_MODULE||join(tmpdir(),'tms-t03-postgres-tools/node_modules/@electric-sql/pglite/dist/index.js');
const {PGlite}=await import(pathToFileURL(resolve(modulePath)).href);
const source=readFileSync(join(root,'backend/admin/src/admin_return_requests_sql.py'),'utf8');
const forward=readFileSync(join(root,'sql/69_return_request_auto_approval.sql'),'utf8');
const rollback=readFileSync(join(root,'sql/69_return_request_auto_approval_rollback.sql'),'utf8');
const u=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function sql(name){let n=0;return source.match(new RegExp(name+' = """([\\s\\S]*?)"""'))[1].replace(/%s/g,()=>`$${++n}`);}
let db;
before(async()=>{db=new PGlite('memory://');await db.waitReady;});
after(async()=>{await db?.close();});
beforeEach(async()=>{
 await db.exec(`DROP SCHEMA public CASCADE;CREATE SCHEMA public;SET client_min_messages=warning;
 CREATE TABLE tbl_return_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,
 customer_id uuid,requested_by uuid,request_number text,status text DEFAULT 'pendiente_asignacion',
 created_at timestamptz DEFAULT now(),decided_by uuid,decided_at timestamptz,rejection_reason text,
 UNIQUE(organization_id,request_number));`);
 await db.query("INSERT INTO tbl_return_requests VALUES($1,$2,$3,$4,'LEGACY','pendiente_asignacion',now(),NULL,NULL,NULL)",[u(10),u(1),u(2),u(3)]);
});
async function migrate(){if(process.env.TMS_TEST_SKIP_SQL69!=='1')await db.exec(forward);}
async function autoCreate(){return db.query(sql('INSERT_REQUEST_SQL'),[u(1),u(2),u(3),'AUTO',u(3)]);}
test('adds explicit approval provenance without approving existing requests',async()=>{
 await migrate();
 const columns=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='tbl_return_requests'")).rows.map(r=>r.column_name);
 assert.ok(columns.includes('approval_mode'));
 const legacy=(await db.query("SELECT * FROM tbl_return_requests WHERE request_number='LEGACY'")).rows[0];
 assert.equal(legacy.approval_mode,'legacy');assert.equal(legacy.status,'pendiente_asignacion');assert.equal(legacy.decided_at,null);
});
test('production INSERT creates approval with automatic provenance and server timestamp',async()=>{
 await migrate();const row=(await autoCreate()).rows[0];
 assert.equal(row.status,'aprobada');assert.equal(row.approval_mode,'automatic');
 const stored=(await db.query("SELECT * FROM tbl_return_requests WHERE request_number='AUTO'")).rows[0];
 assert.equal(stored.decided_by,stored.requested_by);assert.ok(stored.decided_at);assert.equal(stored.rejection_reason,null);
});
test('idempotent INSERT does not approve again or replace the decision time',async()=>{
 await migrate();const query=sql('INSERT_IDEMPOTENT_SQL'),params=[u(20),u(1),u(2),u(3),'AUTO-IDEM',u(3)];
 assert.equal((await db.query(query,params)).rows.length,1);
 const before=(await db.query('SELECT * FROM tbl_return_requests WHERE id=$1',[u(20)])).rows[0];
 assert.equal((await db.query(query,params)).rows.length,0);
 assert.deepEqual((await db.query('SELECT * FROM tbl_return_requests WHERE id=$1',[u(20)])).rows[0],before);
});
test('automatic approval origin cannot be forged later or lose approved metadata',async()=>{
 await migrate();await autoCreate();
 await assert.rejects(db.query("UPDATE tbl_return_requests SET approval_mode='legacy' WHERE request_number='AUTO'"),e=>e.code==='23514');
 await assert.rejects(db.query("UPDATE tbl_return_requests SET status='pendiente_asignacion' WHERE request_number='AUTO'"),e=>e.code==='23514');
});
test('forward is idempotent; unused rollback preserves the legacy rows',async()=>{
 await migrate();await migrate();const before=(await db.query('SELECT id,status,requested_by FROM tbl_return_requests')).rows;
 await db.exec(rollback);await db.exec(rollback);
 assert.deepEqual((await db.query('SELECT id,status,requested_by FROM tbl_return_requests')).rows,before);
});
test('rollback refuses to erase automatic provenance once used',async()=>{
 await migrate();await autoCreate();
 await assert.rejects(db.exec(rollback),e=>e.code==='P0001');await db.exec('ROLLBACK');
 assert.equal((await db.query("SELECT approval_mode FROM tbl_return_requests WHERE request_number='AUTO'")).rows[0].approval_mode,'automatic');
});
