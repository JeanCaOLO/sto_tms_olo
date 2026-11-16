// SQL real de T04 contra PostgreSQL en memoria. No lee .env ni conecta a Aurora.
import {before, beforeEach, after, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {PGlite}=await import(pathToFileURL(resolve(process.env.TMS_T03_PGLITE_MODULE ||
 join(tmpdir(),'tms-t03-postgres-tools/node_modules/@electric-sql/pglite/dist/index.js'))).href);
const source=readFileSync(join(root,'backend/admin/src/admin_return_requests_sql.py'),'utf8');
const u=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function sql(name){
 const found=source.match(new RegExp(name+' = """([\\s\\S]*?)"""'));
 if(found)return found[1];
 const single=source.match(new RegExp(name+' = ("[^"\\n]*")'));
 assert.ok(single,name);return JSON.parse(single[1]);
}
function placeholders(query){let n=0; return query.replace(/%s/g,()=>`$${++n}`);}
function inbox({countries=null,limit=100,offset=0,filter='',values=[]}={}){
 const access=sql('OPERATOR_SCOPE_SQL')+(countries===null?'': ' AND COALESCE(c.country_id,w.country_id) = ANY(%s::uuid[])');
 return {query:placeholders(sql('INBOX_SQL').replace('{source}',sql('REQUEST_FROM_SQL')).replace('{access}',access).replace('{filters}',filter)),
 params:[u(1),u(20),...(countries===null?[]:[countries.map(u)]),...values,limit,offset]};
}
let db;
before(async()=>{db=new PGlite('memory://');await db.waitReady;});
after(async()=>{await db?.close();});
beforeEach(async()=>{
 await db.exec(`DROP SCHEMA public CASCADE;CREATE SCHEMA public;SET client_min_messages=warning;
 CREATE TABLE tbl_organizations(id uuid PRIMARY KEY);
 CREATE TABLE tbl_warehouses(id uuid PRIMARY KEY,organization_id uuid,country_id uuid);
 CREATE TABLE tbl_customers(id uuid PRIMARY KEY,organization_id uuid,warehouse_id uuid,country_id uuid,name text);
 CREATE TABLE tbl_app_users(id uuid PRIMARY KEY,organization_id uuid,customer_id uuid,full_name text);
 CREATE TABLE tbl_user_scopes(app_user_id uuid,customer_id uuid,warehouse_id uuid,country_id uuid);
 CREATE TABLE tbl_orders(id uuid PRIMARY KEY,organization_id uuid,customer_id uuid);
 CREATE TABLE tbl_routes(id uuid PRIMARY KEY,organization_id uuid);
 CREATE TABLE tbl_dispatch_guides(id uuid PRIMARY KEY,organization_id uuid,order_id uuid,route_id uuid);
 CREATE TABLE tbl_returns(id uuid PRIMARY KEY,organization_id uuid,order_id uuid,dispatch_guide_id uuid,return_type text);`);
 const ddl=readFileSync(join(root,'sql/64_devoluciones_solicitudes_cliente.sql'),'utf8');
 await db.exec(ddl.slice(ddl.indexOf('create table if not exists tbl_return_requests ('),ddl.indexOf('-- 3.')));
 await db.query('INSERT INTO tbl_organizations VALUES($1),($2)',[u(1),u(2)]);
 for(const [id,org,country] of [[5,1,3],[6,1,3],[7,1,4],[8,2,3]])
  await db.query('INSERT INTO tbl_warehouses VALUES($1,$2,$3)',[u(id),u(org),u(country)]);
 for(const [index,org,warehouse,country] of [[0,1,5,3],[1,1,6,3],[2,1,7,4],[3,2,8,3],[4,1,8,3],[5,1,5,4]]){
  const company=u(9+index),user=u(21+index),request=u(31+index);
  await db.query('INSERT INTO tbl_customers VALUES($1,$2,$3,$4,$5)',[company,u(org),u(warehouse),u(country),'Empresa sintetica '+index]);
  await db.query('INSERT INTO tbl_app_users VALUES($1,$2,$3,$4)',[user,u(org),company,'Solicitante sintetico']);
  await db.query('INSERT INTO tbl_return_requests(id,organization_id,customer_id,requested_by,request_number,created_at) VALUES($1,$2,$3,$4,$5,$6)',
   [request,u(org),company,user,'TEST-'+index,'2026-01-01T00:00:00Z']);
 }
 await db.query('INSERT INTO tbl_app_users VALUES($1,$2,NULL,$3)',[u(20),u(1),'Operador sintetico']);
 await db.exec(readFileSync(join(root,'sql/67_roles_solicitudes_devolucion.sql'),'utf8'));
 await db.exec(readFileSync(join(root,'sql/69_return_request_auto_approval.sql'),'utf8'));
});
async function scope({company=null,warehouse=null,country=null}={}){
 await db.query('INSERT INTO tbl_user_scopes VALUES($1,$2,$3,$4)',[u(20),company&&u(company),warehouse&&u(warehouse),country&&u(country)]);
}
async function ids(options){const {query,params}=inbox(options);return (await db.query(query,params)).rows.map(r=>r.id).sort();}

test('no scopes means no visible requests, including with no country restriction',async()=>{
 assert.deepEqual(await ids(),[]);
});
test('company scope excludes other companies sharing a country',async()=>{
 await scope({company:9});assert.deepEqual(await ids(),[u(31)]);
});
test('warehouse scope excludes other warehouses of the same country',async()=>{
 await scope({warehouse:5});assert.deepEqual(await ids(),[u(31)]);
});
test('country scope excludes other countries and organizations',async()=>{
 await scope({country:3});assert.deepEqual(await ids(),[u(31),u(32)]);
});
test('explicit global scope still respects organization and valid operational chain',async()=>{
 await scope();assert.deepEqual(await ids(),[u(31),u(32),u(33)]);
});
test('role countries intersect global scope and an empty role country set denies all',async()=>{
 await scope();assert.deepEqual(await ids({countries:[3]}),[u(31),u(32)]);
 assert.deepEqual(await ids({countries:[]}),[]);
});
test('company filter cannot widen an operator scope',async()=>{
 await scope({company:9});assert.deepEqual(await ids({filter:' AND r.customer_id = %s',values:[u(10)]}),[]);
});
test('pagination is stable for equal timestamps and contains only authorized rows',async()=>{
 await scope({country:3});const a=await ids({limit:1}),b=await ids({limit:1,offset:1});
 assert.equal(a.length,1);assert.equal(b.length,1);assert.notDeepEqual(a,b);
});
test('client detail checks author even when two users share a company',async()=>{
 await db.query('INSERT INTO tbl_app_users VALUES($1,$2,$3,$4)',[u(40),u(1),u(9),'Otro solicitante']);
 const detail=placeholders(sql('DETAIL_SQL').replace('{source}',sql('REQUEST_FROM_SQL'))
  .replace('{access}', 'r.organization_id = %s AND c.organization_id = r.organization_id AND r.customer_id = %s AND r.requested_by = %s').replace('{lock}',''));
 assert.equal((await db.query(detail,[u(31),u(1),u(9),u(21)])).rows.length,1);
 assert.equal((await db.query(detail,[u(31),u(1),u(9),u(40)])).rows.length,0);
});
test('conditional decision permits only one effective transition and creates no physical return',async()=>{
 const decide=placeholders(sql('DECIDE_SQL'));
 assert.equal((await db.query(decide,['aprobada',u(20),null,u(31),u(1)])).rows.length,1);
 assert.equal((await db.query(decide,['rechazada',u(20),'Tarde',u(31),u(1)])).rows.length,0);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM tbl_returns')).rows[0].n,0);
});
test('deterministic request id and organization number cannot be duplicated',async()=>{
 const insert=placeholders(sql('INSERT_IDEMPOTENT_SQL'));
 const params=[u(50),u(1),u(9),u(21),'TEST-NEW',u(21)];
 assert.equal((await db.query(insert,params)).rows.length,1);
 assert.equal((await db.query(insert,params)).rows.length,0);
 assert.equal((await db.query(insert,[u(51),...params.slice(1)])).rows.length,0);
});
test('authorized detail resolves decision actor name within the same organization',async()=>{
 await scope({company:9});
 await db.query(placeholders(sql('DECIDE_SQL')),['aprobada',u(20),null,u(31),u(1)]);
 const detail=placeholders(sql('DETAIL_SQL').replace('{source}',sql('REQUEST_FROM_SQL'))
  .replace('{access}',sql('OPERATOR_SCOPE_SQL')).replace('{lock}',''));
 const rows=(await db.query(detail,[u(31),u(1),u(20)])).rows;
 assert.equal(rows[0].decided_by_name,'Operador sintetico');
});
test('company options use operational scopes rather than a general company catalog',async()=>{
 await scope({company:9});
 const query=placeholders(sql('INBOX_COMPANIES_SQL').replace('{source}',sql('REQUEST_FROM_SQL'))
  .replace('{access}',sql('OPERATOR_SCOPE_SQL')).replace('{filters}',''));
 assert.deepEqual((await db.query(query,[u(1),u(20)])).rows.map(r=>r.id),[u(9)]);
});
test('company options are distinct across requests and intersect selected country with role countries',async()=>{
 await scope();
 await db.query('INSERT INTO tbl_return_requests(id,organization_id,customer_id,requested_by,request_number) VALUES($1,$2,$3,$4,$5)',
  [u(60),u(1),u(9),u(21),'TEST-DUP-COMPANY']);
 const query=placeholders(sql('INBOX_COMPANIES_SQL').replace('{source}',sql('REQUEST_FROM_SQL'))
  .replace('{access}',sql('OPERATOR_SCOPE_SQL')+' AND COALESCE(c.country_id,w.country_id) = ANY(%s::uuid[])')
  .replace('{filters}',' AND COALESCE(c.country_id,w.country_id) = %s::uuid'));
 assert.deepEqual((await db.query(query,[u(1),u(20),[u(3)],u(3)])).rows.map(r=>r.id).sort(),[u(9),u(10)]);
 assert.deepEqual((await db.query(query,[u(1),u(20),[u(3)],u(4)])).rows,[]);
});
function creationCatalog({countries=null,country=null,company=null}={}){
 let access=sql('OPERATOR_SCOPE_SQL').replaceAll('r.organization_id','c.organization_id').replaceAll('r.customer_id','c.id');
 const params=[u(1),u(20)];let filters='';
 if(countries!==null){access+=sql('COUNTRY_SCOPE_SQL');params.push(countries.map(u));}
 if(country!==null){filters+=' AND COALESCE(c.country_id,w.country_id) = %s::uuid';params.push(u(country));}
 if(company!==null){filters+=' AND c.id = %s::uuid';params.push(u(company));}
 return {query:placeholders(sql('CREATION_COMPANIES_SQL').replace('{access}',access).replace('{filters}',filters)),params};
}
test('creation catalog includes companies without requests and excludes foreign or inconsistent relationships',async()=>{
 await scope();await db.exec('DELETE FROM tbl_return_requests');
 const {query,params}=creationCatalog();
 assert.deepEqual((await db.query(query,params)).rows.map(r=>r.id).sort(),[u(9),u(10),u(11)]);
});
test('creation catalog intersects role countries, selected country and company scopes',async()=>{
 await scope({company:9});
 for(const options of [{countries:[3],country:4},{countries:[]},{company:10}]){
  const {query,params}=creationCatalog(options);assert.deepEqual((await db.query(query,params)).rows,[]);
 }
 const {query,params}=creationCatalog({countries:[3],country:3,company:9});
 assert.deepEqual((await db.query(query,params)).rows.map(r=>r.id),[u(9)]);
});
