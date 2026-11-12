// Compatibilidad de captura por Cliente, Gerente y superusuarios. Solo PostgreSQL en memoria.
import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const modulePath=process.env.TMS_T03_PGLITE_MODULE||join(tmpdir(),'tms-t03-postgres-tools/node_modules/@electric-sql/pglite/dist/index.js');
const {PGlite}=await import(pathToFileURL(resolve(modulePath)).href);
const forward=join(root,'sql/68_return_requests_operator_capture.sql');
const rollback=join(root,'sql/68_return_requests_operator_capture_rollback.sql');
const original=readFileSync(join(root,'sql/67_roles_solicitudes_devolucion.sql'),'utf8')
 .match(/create or replace function public.guard_return_request_decision_67\(\)[\s\S]*?\$\$;/i)[0];
const u=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let db;
before(async()=>{db=new PGlite('memory://');await db.waitReady;
 await db.exec(`CREATE TABLE tbl_roles(id uuid PRIMARY KEY,name text);
 CREATE TABLE tbl_customers(id uuid PRIMARY KEY,organization_id uuid);
 CREATE TABLE tbl_app_users(id uuid PRIMARY KEY,organization_id uuid,customer_id uuid,role_id uuid);
 CREATE TABLE tbl_return_requests(id uuid PRIMARY KEY,organization_id uuid,customer_id uuid,requested_by uuid,
 request_number text,status text DEFAULT 'pendiente_asignacion',decided_by uuid,decided_at timestamptz,rejection_reason text);
 ${original}
 CREATE TRIGGER tr_return_request_decision_67 BEFORE INSERT OR UPDATE ON tbl_return_requests
 FOR EACH ROW EXECUTE FUNCTION public.guard_return_request_decision_67();`);
 await db.query("INSERT INTO tbl_roles VALUES($1,'Cliente'),($2,'Gerente'),($3,'SuperUsuario'),($4,'Devoluciones')",[u(10),u(11),u(12),u(13)]);
 await db.query('INSERT INTO tbl_customers VALUES($1,$2),($3,$4)',[u(20),u(1),u(21),u(2)]);
 await db.query(`INSERT INTO tbl_app_users VALUES($1,$2,$3,$4),($5,$2,NULL,$6),($7,$2,NULL,$8),($9,$2,NULL,$10),($11,$12,NULL,$6)`,
 [u(30),u(1),u(20),u(10),u(31),u(11),u(32),u(12),u(33),u(13),u(34),u(2)]);
});
after(async()=>{await db?.close();});
beforeEach(async()=>{await db.exec('TRUNCATE tbl_return_requests');await db.exec(original);});
async function migrate(){await db.exec(existsSync(forward)?readFileSync(forward,'utf8'):'SELECT 1');}
async function create(author,company=20,id=40){return db.query(
 "INSERT INTO tbl_return_requests(id,organization_id,customer_id,requested_by,request_number) VALUES($1,$2,$3,$4,$5) RETURNING *",
 [u(id),u(1),u(company),u(author),'TEST-'+id]);}
test('manager may capture for a company in the same organization without personal assignment',async()=>{
 await migrate();assert.equal((await create(31)).rows.length,1);
});
test('superuser may capture without personal assignment and the real author is retained',async()=>{
 await migrate();const row=(await create(32)).rows[0];assert.equal(row.requested_by,u(32));assert.equal(row.customer_id,u(20));
});
test('client assignment still works; other operators and cross-organization identities remain rejected',async()=>{
 await migrate();await create(30);
 for(const [author,company,id] of [[33,20,41],[34,20,42],[31,21,43]])
  await assert.rejects(create(author,company,id),e=>e.code==='23514');
});
test('historical identity and decided status remain immutable',async()=>{
 await migrate();await create(31);
 await assert.rejects(db.query('UPDATE tbl_return_requests SET customer_id=$1 WHERE id=$2',[u(21),u(40)]),e=>e.code==='23514');
 await db.query("UPDATE tbl_return_requests SET status='aprobada',decided_by=$1,decided_at=now() WHERE id=$2",[u(31),u(40)]);
 await assert.rejects(db.query("UPDATE tbl_return_requests SET status='pendiente_asignacion' WHERE id=$1",[u(40)]),e=>e.code==='23514');
});
test('forward is idempotent and rollback preserves operator-created history',async()=>{
 await migrate();await create(31);const before=(await db.query('SELECT * FROM tbl_return_requests')).rows;
 await migrate();assert.deepEqual((await db.query('SELECT * FROM tbl_return_requests')).rows,before);
 assert.ok(existsSync(rollback));await db.exec(readFileSync(rollback,'utf8'));
 assert.deepEqual((await db.query('SELECT * FROM tbl_return_requests')).rows,before);
 await db.query("UPDATE tbl_return_requests SET status=status WHERE id=$1",[u(40)]);
 await assert.rejects(create(31,20,41),e=>e.code==='23514');await create(30,20,42);
});
