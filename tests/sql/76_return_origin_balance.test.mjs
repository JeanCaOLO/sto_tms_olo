import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const modulePath=process.env.TMS_T03_PGLITE_MODULE||join(tmpdir(),'tms-t03-postgres-tools/node_modules/@electric-sql/pglite/dist/index.js');
const {PGlite}=await import(pathToFileURL(resolve(modulePath)).href);
const forward=readFileSync(new URL('../../sql/76_return_request_origin_balance.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../../sql/76_return_request_origin_balance_rollback.sql',import.meta.url),'utf8');
const u=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let db;
before(async()=>{db=new PGlite('memory://');await db.waitReady;});
after(async()=>{await db?.close();});
beforeEach(async()=>{
 await db.exec(`DROP SCHEMA public CASCADE;CREATE SCHEMA public;
 CREATE TABLE tbl_orders(id uuid primary key,organization_id uuid,customer_id uuid);
 CREATE TABLE tbl_order_items(id uuid primary key,order_id uuid,line_number int,product_code text,product_name text,
 presentation text,quantity int,quantity_cancelled int);
 CREATE TABLE tbl_delivery_points(id uuid primary key);
 CREATE TABLE tbl_return_requests(id uuid primary key,organization_id uuid,status text);
 CREATE TABLE tbl_return_request_items(id uuid primary key,request_id uuid,product_code text,quantity int);
 CREATE TABLE tbl_returns(id uuid primary key,organization_id uuid,order_id uuid,request_item_id uuid,
 product_code text,product_name text,quantity int,status text);
 INSERT INTO tbl_orders VALUES('${u(1)}','${u(2)}','${u(3)}');
 INSERT INTO tbl_order_items VALUES('${u(4)}','${u(1)}',1,'SKU','Producto','CAJA',10,1);
 INSERT INTO tbl_delivery_points VALUES('${u(5)}');`);
 await db.exec(forward);
});
async function remaining(){return Number((await db.query('SELECT remaining FROM return_balance_76($1,$2)',[u(2),u(1)])).rows[0].remaining);}
async function reserve(quantity=3){await db.exec(`INSERT INTO tbl_return_requests VALUES('${u(6)}','${u(2)}','aprobada');
 INSERT INTO tbl_return_request_origins(request_id,order_id,delivery_point_id,snapshot) VALUES('${u(6)}','${u(1)}','${u(5)}','{}');
 INSERT INTO tbl_return_request_items VALUES('${u(7)}','${u(6)}','SKU',${quantity},'${u(4)}');`);}
test('saldo descuenta anulaciones, reservas y físico histórico sin doble consumo vinculado',async()=>{
 assert.equal(await remaining(),9);await reserve();assert.equal(await remaining(),6);
 await db.exec(`INSERT INTO tbl_returns VALUES('${u(8)}','${u(2)}','${u(1)}','${u(7)}','SKU','Producto',3,'pending','${u(4)}')`);
 assert.equal(await remaining(),6);
 await db.exec(`INSERT INTO tbl_returns VALUES('${u(9)}','${u(2)}','${u(1)}',NULL,'SKU','Producto',2,'received',NULL)`);
 assert.equal(await remaining(),4);
 assert.equal((await db.query('SELECT * FROM return_balance_76($1,$2)',[u(99),u(1)])).rows.length,0);
});
test('líneas repetidas conservan presentación y las reservas suman',async()=>{
 await reserve(2);
 await db.exec(`INSERT INTO tbl_order_items VALUES('${u(10)}','${u(1)}',2,'SKU','Producto','UNIDAD',20,0);
 INSERT INTO tbl_return_request_items VALUES('${u(11)}','${u(6)}','SKU',3,'${u(4)}');`);
 const rows=(await db.query('SELECT * FROM return_balance_76($1,$2) ORDER BY line_number',[u(2),u(1)])).rows;
 assert.deepEqual(rows.map(r=>[r.presentation,Number(r.remaining)]),[['CAJA',4],['UNIDAD',20]]);
});
test('forward repetible, rollback sin uso y rechazo del rollback con historial',async()=>{
 await db.exec(forward);await db.exec(rollback);await db.exec(rollback);await db.exec(forward);
 await reserve();await assert.rejects(db.exec(rollback),/historial/);await db.exec('ROLLBACK');
 assert.equal(await remaining(),6);
 await assert.rejects(db.query('UPDATE tbl_return_request_origins SET snapshot=$1',['{}']),/inmutable/);
});
test('origen real rechaza otros países y almacenes aunque pertenezcan a la misma empresa',async()=>{
 await db.exec(`ALTER TABLE tbl_orders ADD COLUMN order_number text,ADD COLUMN final_customer_id uuid,
 ADD COLUMN warehouse_id uuid,ADD COLUMN created_at timestamptz DEFAULT now();
 ALTER TABLE tbl_delivery_points ADD COLUMN final_customer_id uuid,ADD COLUMN address_id uuid,
 ADD COLUMN zone_id uuid,ADD COLUMN active boolean DEFAULT true,ADD COLUMN name text;
 CREATE TABLE tbl_customers(id uuid,organization_id uuid);
 CREATE TABLE tbl_final_customers(id uuid,customer_id uuid,name text);
 CREATE TABLE tbl_addresses(id uuid,line1 text,city text,latitude numeric,longitude numeric,country_id uuid);
 CREATE TABLE tbl_warehouses(id uuid,organization_id uuid,country_id uuid);
 CREATE TABLE tbl_zones(id uuid,organization_id uuid,country_id uuid,name text);
 CREATE TABLE tbl_user_scopes(app_user_id uuid,customer_id uuid,warehouse_id uuid,country_id uuid);
 INSERT INTO tbl_customers VALUES('${u(3)}','${u(2)}');
 INSERT INTO tbl_final_customers VALUES('${u(20)}','${u(3)}','Destino');
 INSERT INTO tbl_addresses VALUES('${u(21)}','Calle A','Ciudad',9.93,-84.08,'${u(22)}');
 INSERT INTO tbl_warehouses VALUES('${u(23)}','${u(2)}','${u(22)}');
 INSERT INTO tbl_zones VALUES('${u(24)}','${u(2)}','${u(22)}','Zona');
 UPDATE tbl_delivery_points SET final_customer_id='${u(20)}',address_id='${u(21)}',zone_id='${u(24)}',name='Punto';
 UPDATE tbl_orders SET order_number='PED-1',final_customer_id='${u(20)}',warehouse_id='${u(23)}';
 INSERT INTO tbl_user_scopes VALUES('${u(25)}',NULL,'${u(26)}',NULL);`);
 const source=readFileSync(new URL('../../backend/admin/src/admin_return_requests_sql.py',import.meta.url),'utf8');
 const extract=name=>source.match(new RegExp(name+' = """([\\s\\S]*?)"""'))[1];
 let n=0;const query=extract('ORIGINS_SQL').replace('{filters}',extract('ORIGIN_SCOPE_SQL')+' AND a.country_id=ANY(%s::uuid[])')
  .replace(/%s/g,()=>`$${++n}`);
 assert.equal((await db.query(query,[u(2),u(3),u(25),[u(22)]])).rows.length,0);
 await db.exec(`UPDATE tbl_user_scopes SET warehouse_id='${u(23)}'`);
 assert.equal((await db.query(query,[u(2),u(3),u(25),[u(22)]])).rows.length,1);
 assert.equal((await db.query(query,[u(2),u(3),u(25),[u(99)]])).rows.length,0);
 await db.exec("UPDATE tbl_addresses SET line1=NULL");
 assert.equal((await db.query(query,[u(2),u(3),u(25),[u(22)]])).rows.length,0);
});
