// Datos de prueba aislados para solicitudes, recolectas y recepción. No ejecuta DDL.
// Por defecto inserta y valida dentro de una transacción que revierte. --execute confirma.
// --verify comprueba el lote; --clean solo permite retirar un lote intacto y sin referencias ajenas.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const args=process.argv.slice(2),day=new Date().toISOString().slice(0,10);
const index=args.indexOf('--batch');
const batch=index<0?`MOCKDEV-${day.replaceAll('-','').slice(2)}`:args[index+1];
assert.match(batch||'',/^MOCKDEV-[A-Z0-9-]{6,15}$/,'El lote debe ser MOCKDEV- seguido de 6 a 15 caracteres seguros.');
const mode=args.includes('--clean')?'clean':args.includes('--verify')?'verify':args.includes('--execute')?'execute':'dry-run';
assert.ok(!(args.includes('--clean')&&args.includes('--verify')),'Elige limpieza o verificación.');
const folder=path.resolve('.test/devoluciones/mocks',batch);
fs.mkdirSync(folder,{recursive:true});
const planFile=path.join(folder,`${batch}-plan.json`),proofFile=path.join(folder,`${batch}-proof.json`);
const order=['tbl_final_customers','tbl_orders','tbl_order_items','tbl_routes','tbl_dispatch_guides','tbl_return_requests','tbl_return_request_items','tbl_returns','tbl_return_forms','tbl_return_form_sections','tbl_return_form_items'];
const quote=name=>{assert.match(name,/^[a-z_][a-z0-9_]*$/);return `"${name}"`;};
const keyColumns=table=>table==='tbl_return_form_items'?['form_id','return_id']:['id'];
const key=(table,row)=>keyColumns(table).map(k=>row[k]).join('|');
const keySql=table=>keyColumns(table).map(k=>`${quote(k)}::text`).join(" || '|' || ");
const id=()=>crypto.randomUUID();
const report={at:new Date().toISOString(),batch,mode,ddl:false,scenarios:[],checks:{}};
const client=new pg.Client({host:process.env.TMS_DB_HOST,port:Number(process.env.TMS_DB_PORT),user:process.env.TMS_DB_USER,password:process.env.TMS_DB_PASSWORD,database:process.env.TMS_DB_NAME,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,application_name:`mock-devoluciones ${batch}`});

async function context(){
 const authors=(await client.query(`select u.id,u.organization_id,u.customer_id,c.name as customer_name,c.country_id,c.warehouse_id
  from tbl_app_users u join tbl_roles r on r.id=u.role_id
  join tbl_customers c on c.id=u.customer_id and c.organization_id=u.organization_id
  join tbl_warehouses w on w.id=c.warehouse_id and w.organization_id=c.organization_id and w.country_id=c.country_id
  where u.is_active and lower(r.name)='cliente' order by u.id`)).rows;
 assert.ok(authors.length,'No hay Cliente activo con empresa/país/almacén coherentes; no se crean usuarios ni permisos.');
 const author=authors[0];
 const operator=(await client.query(`select u.id from tbl_app_users u join tbl_roles r on r.id=u.role_id
  where u.organization_id=$1 and u.is_active and lower(r.name)='devoluciones'
   and (lower(coalesce(u.email,'')) like '%demo%' or lower(coalesce(u.full_name,'')) like '%demo%')
   and exists(select 1 from tbl_user_scopes s where s.app_user_id=u.id and
    (s.customer_id=$2 or (s.customer_id is null and s.warehouse_id=$3) or
     (s.customer_id is null and s.warehouse_id is null and (s.country_id=$4 or s.country_id is null))))
  order by u.id limit 1`,[author.organization_id,author.customer_id,author.warehouse_id,author.country_id])).rows[0];
 assert.ok(operator,'No hay operador DEMO de Devoluciones con scope compatible; no se modifican permisos.');
 const companies=(await client.query(`select c.id,c.name,c.organization_id,c.country_id,c.warehouse_id,
  (select b.id from tbl_branches b where b.customer_id=c.id order by b.id limit 1) as branch_id
  from tbl_customers c join tbl_warehouses w on w.id=c.warehouse_id and w.organization_id=c.organization_id and w.country_id=c.country_id
  where c.organization_id=$1 and c.country_id=$2 order by c.id`,[author.organization_id,author.country_id])).rows.filter(c=>c.branch_id);
 const company=companies.find(c=>c.id===author.customer_id);assert.ok(company,'Falta sucursal de la empresa del Cliente.');
 const route=(await client.query(`select r.store_id,r.driver_id,r.vehicle_id,r.carrier_id
  from tbl_routes r join tbl_stores s on s.id=r.store_id
  where r.organization_id=$1 and s.organization_id=$1 and s.country_id=$2
  order by exists(select 1 from tbl_drivers d join tbl_app_users u on u.id=d.app_user_id
    where d.id=r.driver_id and (lower(coalesce(u.email,'')) like '%demo%' or lower(coalesce(u.full_name,'')) like '%demo%')) desc,
   r.route_date desc,r.id limit 1`,[author.organization_id,author.country_id])).rows[0];
 assert.ok(route,'No existe sede de viaje compatible con el país de la empresa.');
 return {author,operator,company,companies,route};
}

async function buildPlan(){
 const ctx=await context(),rows=Object.fromEntries(order.map(t=>[t,[]])),scenarios=[];
 const now=new Date().toISOString(),org=ctx.author.organization_id;
 const add=(table,row)=>{const value={id:id(),...row};rows[table].push(value);return value;};
 const product=(scenario,n,reason='danado',quantity=3)=>({product_code:`MD-${scenario}-${n}`,product_name:`[MOCK ${batch}] Artículo ${scenario}-${n}`,quantity,reason_code:reason,description:reason==='otro'?'[MOCK] Diferencia detectada durante revisión de prueba.':`[MOCK] Escenario ${scenario}`});
 const request=(code,status,items,label)=>{
  const decision=status==='pendiente_asignacion'?{}:{decided_by:ctx.operator.id,decided_at:now,rejection_reason:status==='rechazada'?'[MOCK] Solicitud rechazada: artículo fuera de la política de devolución.':null};
  const r=add('tbl_return_requests',{organization_id:org,customer_id:ctx.company.id,requested_by:ctx.author.id,request_number:`${batch}-${code}`,status,created_at:now,...decision});
  const lines=items.map((item,i)=>add('tbl_return_request_items',{request_id:r.id,line_number:i+1,...item}));
  scenarios.push({code,label,requestId:r.id,requestNumber:r.request_number,requestStatus:status,itemIds:lines.map(x=>x.id),routeIds:[],returnIds:[]});
  return {request:r,items:lines,scenario:scenarios.at(-1)};
 };
 const fcByCompany=new Map();
 function finalCustomer(company){
  if(!fcByCompany.has(company.id))fcByCompany.set(company.id,add('tbl_final_customers',{customer_id:company.id,external_code:`${batch}-${fcByCompany.size+1}`,name:`[MOCK ${batch}] Destino de pruebas`,customer_type:'TIENDA',status:'active'}));
  return fcByCompany.get(company.id);
 }
 let orderSeq=0,routeSeq=0,returnSeq=0,guideSeq=0;
 function route(scenario){
  const r=add('tbl_routes',{organization_id:org,...ctx.route,route_number:`${batch}-V${String(++routeSeq).padStart(2,'0')}`,route_date:day,status:'Finalizado',notes:`${batch}: ${scenario.code}`,total_stops:0,completed_stops:0});
  scenario.routeIds.push(r.id);return r;
 }
 function physical(scenario,r,{item=null,company=ctx.company,status='pending',receivedQuantity=null,type='recolecta',condition='Bueno'}={}){
  const q=item?.quantity||3,n=String(++orderSeq).padStart(3,'0'),code=item?.product_code||`MD-CC-${n}`,name=item?.product_name||`[MOCK ${batch}] Contracamión ${n}`;
  const o=add('tbl_orders',{organization_id:org,customer_id:company.id,warehouse_id:company.warehouse_id,branch_id:company.branch_id,final_customer_id:finalCustomer(company).id,order_number:`${batch}-P${n}`,invoice_number:`MD-FAC-${n}`,order_date:day,delivery_date:day,delivery_address:`[MOCK ${batch}] Dirección ficticia ${n}`,total_items:1,total_weight:q,total_volume:0.1,total_amount:q*100,status:'delivered',notes:batch,oms_processed_at:now});
  add('tbl_order_items',{order_id:o.id,line_number:1,product_code:code,product_name:name,quantity:q,weight:q,volume:0.1,unit_price:100,total_price:q*100});
  const g=add('tbl_dispatch_guides',{organization_id:org,route_id:r.id,order_id:o.id,guide_number:`${batch}-G${String(++guideSeq).padStart(3,'0')}`,sequence_number:++r.total_stops,stop_type:type==='recolecta'?'collection':'delivery',status:'completed',delivery_status:type==='recolecta'?'collected':'returned',notes:batch});
  r.completed_stops=r.total_stops;
  const receipt=status==='received'?{received_at:now,received_by:ctx.operator.id,received_quantity:receivedQuantity??q,received_condition:condition}:{};
  const rt=add('tbl_returns',{organization_id:org,order_id:o.id,dispatch_guide_id:g.id,request_item_id:item?.id||null,return_number:`${batch}-D${String(++returnSeq).padStart(3,'0')}`,return_type:type,return_date:now,reason:`[MOCK] ${scenario.label}`,product_code:code,product_name:name,quantity:q,notes:batch,status,...receipt});
  scenario.returnIds.push(rt.id);return {rt,g,company};
 }
 request('S01','pendiente_asignacion',[product('S01',1,'no_solicitado',2)],'Solicitud simple pendiente de revisión');
 request('S02','pendiente_asignacion',['no_solicitado','danado','cantidad_de_mas','rechazado','otro'].map((reason,i)=>product('S02',i+1,reason,i+1)),'Solicitud con cinco artículos y todos los motivos');
 request('S03','pendiente_asignacion',[{...product('S03',1,'otro',1000000),product_name:('[MOCK] Nombre largo de artículo ').repeat(10).slice(0,255),description:('[MOCK] Descripción de límite. ').repeat(25).slice(0,500)}],'Límites válidos de nombre, descripción y cantidad');
 request('S04','aprobada',[product('S04',1,'danado',10)],'Aprobada comercialmente, todavía sin viaje');
 request('S05','rechazada',[product('S05',1,'rechazado',4)],'Rechazo comercial con motivo y decisor');
 const a=request('S06','aprobada',[product('S06',1,'danado',5)],'Recolecta pendiente de recepción física');physical(a.scenario,route(a.scenario),{item:a.items[0]});
 const b=request('S07','aprobada',[product('S07',1,'cantidad_de_mas',6)],'Recolecta aprobada operativamente, sin recepción');physical(b.scenario,route(b.scenario),{item:b.items[0],status:'approved'});
 const c=request('S08','aprobada',[product('S08',1,'danado',5)],'Recolecta recibida completa, sin formulario');physical(c.scenario,route(c.scenario),{item:c.items[0],status:'received'});
 const d=request('S09','aprobada',[product('S09',1,'danado',10)],'Recepción de cantidad menor: 4 de 10 unidades');physical(d.scenario,route(d.scenario),{item:d.items[0],status:'received',receivedQuantity:4,condition:'Incompleto'});
 const e=request('S10','aprobada',[product('S10',1,'danado',3),product('S10',2,'otro',4)],'Viaje mixto: una recolecta recibida y otra pendiente');const er=route(e.scenario);physical(e.scenario,er,{item:e.items[0],status:'received'});physical(e.scenario,er,{item:e.items[1]});
 const cc={code:'S11',label:'Contracamión pendiente sin solicitud de cliente',routeIds:[],returnIds:[]};scenarios.push(cc);physical(cc,route(cc),{type:'contracamion'});
 const formCase={code:'S12',label:'Dos empresas en un viaje, recibidas y en formularios separados',routeIds:[],returnIds:[]};scenarios.push(formCase);
 const fr=route(formCase),other=ctx.companies.find(x=>x.id!==ctx.company.id);assert.ok(other,'Se necesita otra empresa del mismo país para el caso multiempresa.');
 for(const [position,company] of [ctx.company,other].entries()){
  const {rt,g}=physical(formCase,fr,{company,type:'contracamion',status:'received',condition:position?'Dañado':'Bueno'});
  const f=add('tbl_return_forms',{organization_id:org,route_id:fr.id,form_number:`${batch}-F${position+1}`,physical_receipt_number:`MD-REC-${position+1}`,return_kind:position?'cambio':'devolucion',merchandise_for:`[MOCK] ${company.name}`,observations:batch,received_by_name:'Operador DEMO Devoluciones',received_date:day,created_by:ctx.operator.id});
  add('tbl_return_form_sections',{form_id:f.id,dispatch_guide_id:g.id,sort_order:1,customer_code:`MOCK-${position+1}`,customer_name:`[MOCK] Empresa ${position+1}`,invoice_number:`MD-FAC-${position+1}`,address:'[MOCK] Dirección ficticia',route_label:fr.route_number});
  rows.tbl_return_form_items.push({form_id:f.id,return_id:rt.id});
 }
 const cancelled={code:'S13',label:'Contracamión cancelado: no debe bloquear pendientes',routeIds:[],returnIds:[]};scenarios.push(cancelled);physical(cancelled,route(cancelled),{type:'contracamion',status:'cancelled'});
 for(let i=1;i<=22;i++)request(`P${String(i).padStart(2,'0')}`,i%6===0?'rechazada':i%4===0?'aprobada':'pendiente_asignacion',[product(`P${i}`,1,'no_solicitado',(i%5)+1)],`Paginación y filtros: solicitud ${i}`);
 return {batch,day,database:'tms_olo',createdAt:now,context:{authorId:ctx.author.id,operatorId:ctx.operator.id,customerId:ctx.company.id,countryId:ctx.company.country_id,organizationId:org},rows,scenarios,limitations:['Sin adjuntos S3 ficticios: los casos no apuntan a objetos inexistentes.','No incluye rechazo físico con campos de SQL 66: la migración no está aplicada.','La recepción 4/10 no presupone implementado el futuro ciclo automático de saldos/reasignación.']};
}

function ids(plan,table){return [...new Set(plan.rows[table].map(r=>r[table==='tbl_return_form_items'?'form_id':'id']))];}
async function fingerprint(plan,excludeOwn=false){
 const result={};
 for(const table of order){
  const column=table==='tbl_return_form_items'?'form_id':'id';
  result[table]=(await client.query(`select count(*)::int as count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by to_jsonb(t)::text),'')) as digest from ${quote(table)} t where ${quote(column)} ${excludeOwn?'<> ALL':'= ANY'}($1::uuid[])`,[ids(plan,table)])).rows[0];
 }
 return result;
}
async function insert(table,rows){
 if(!rows.length)return;
 const columns=[...new Set(rows.flatMap(r=>Object.keys(r)))],values=[];
 const tuples=rows.map(row=>'('+columns.map(col=>{if(!Object.hasOwn(row,col))return 'DEFAULT';values.push(row[col]);return '$'+values.length;}).join(',')+')');
 await client.query(`insert into ${quote(table)} (${columns.map(quote).join(',')}) values ${tuples.join(',')}`,values);
}
async function verify(plan){
 let checks=0;
 for(const table of order){
  const column=table==='tbl_return_form_items'?'form_id':'id';
  const found=(await client.query(`select to_jsonb(t) as data from ${quote(table)} t where ${quote(column)}=any($1::uuid[])`,[ids(plan,table)])).rows.map(row=>row.data);
  assert.equal(found.length,plan.rows[table].length,`Conteo incorrecto: ${table}`);
  const byKey=new Map(found.map(row=>[key(table,row),row]));
  for(const expected of plan.rows[table]){
   const actual=byKey.get(key(table,expected));assert.ok(actual,`Falta fila propia: ${table}`);
   for(const [column,value]of Object.entries(expected)){
    const actualValue=actual[column] instanceof Date?actual[column].toISOString():actual[column];
    if(typeof value==='number')assert.equal(Number(actualValue),value,`${table}.${column}`);
    else if(column==='return_date'||column.endsWith('_at'))assert.equal(new Date(actualValue).getTime(),new Date(value).getTime(),`${table}.${column}`);
    else assert.equal(actualValue,value,`${table}.${column}`);
    checks++;
   }
  }
 }
 assert.ok(checks>0,'No se ejecutaron comprobaciones de contenido.');
 const linked=(await client.query(`select count(*)::int as n from tbl_returns r join tbl_return_request_items i on i.id=r.request_item_id join tbl_return_requests q on q.id=i.request_id where r.id=any($1::uuid[]) and q.status='aprobada' and r.return_type='recolecta'`,[ids(plan,'tbl_returns')])).rows[0].n;
 assert.equal(linked,plan.rows.tbl_returns.filter(r=>r.request_item_id).length,'Vínculos de solicitudes/recolectas incorrectos');
 return {contentChecks:checks,linkedReturns:linked,rowCounts:Object.fromEntries(order.map(t=>[t,plan.rows[t].length]))};
}

async function clean(plan){
 assert.ok(fs.existsSync(proofFile),'Falta comprobante de aplicación; no se borra nada.');
 const proof=JSON.parse(fs.readFileSync(proofFile,'utf8'));
 assert.deepEqual(await fingerprint(plan),proof.ownFingerprint,'El lote cambió después de generarlo: revisar antes de retirarlo.');
 const references=(await client.query(`select p.relname as parent,c.relname as child,a.attname as column,array_length(f.conkey,1) as child_columns,array_length(f.confkey,1) as parent_columns from pg_constraint f join pg_class p on p.oid=f.confrelid join pg_class c on c.oid=f.conrelid join pg_attribute a on a.attrelid=c.oid and a.attnum=f.conkey[1] where f.contype='f' and p.relname=any($1::text[])`,[order])).rows;
 for(const ref of references){
  assert.ok(ref.child_columns===1&&ref.parent_columns===1,'Una FK compuesta requiere revisión manual antes de limpiar.');
  const own=order.includes(ref.child)?plan.rows[ref.child].map(r=>key(ref.child,r)):[];
  const restriction=own.length?`and (${keySql(ref.child)})<>all($2::text[])`:'';
  const params=own.length?[ids(plan,ref.parent),own]:[ids(plan,ref.parent)];
  const count=(await client.query(`select count(*)::int as n from ${quote(ref.child)} where ${quote(ref.column)}=any($1::uuid[]) ${restriction}`,params)).rows[0].n;
  assert.equal(count,0,`Hay referencias ajenas en ${ref.child}; no se retira el lote.`);
 }
 for(const table of [...order].reverse()){
  const keys=plan.rows[table].map(row=>key(table,row));
  if(keys.length)await client.query(`delete from ${quote(table)} where (${keySql(table)})=any($1::text[])`,[keys]);
 }
 return {removed:true};
}

try{
 assert.equal(process.env.TMS_DB_HOST,'localhost','Solo se permite el túnel local documentado.');assert.equal(Number(process.env.TMS_DB_PORT),15432,'Solo se permite el puerto del túnel verificado.');assert.equal(process.env.TMS_DB_NAME,'tms_olo');
 await client.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='25s'");
 assert.equal((await client.query('select current_database() as db')).rows[0].db,'tms_olo');
 assert.ok((await client.query("select 1 from information_schema.columns where table_schema='public' and table_name='tbl_returns' and column_name='request_item_id'")).rowCount,'Falta SQL 67; solo Intelix puede aplicar migraciones.');
 let plan;
 if(fs.existsSync(planFile))plan=JSON.parse(fs.readFileSync(planFile,'utf8'));
 else {assert.ok(['dry-run','execute'].includes(mode),'No hay un plan de lote para verificar o retirar.');plan=await buildPlan();fs.writeFileSync(planFile,JSON.stringify(plan,null,2)+'\n');}
 assert.equal(plan.batch,batch);assert.deepEqual(Object.keys(plan.rows),order);assert.ok(plan.scenarios.length>0);
 const existing=await fingerprint(plan);
 const ownCount=Object.values(existing).reduce((n,x)=>n+x.count,0),plannedCount=Object.values(plan.rows).reduce((n,x)=>n+x.length,0);
 if(mode==='clean')report.result=await clean(plan);
 else if(mode==='verify'||ownCount){assert.equal(ownCount,plannedCount,'Lote parcial o colisión de identificadores: no se modifica nada.');report.result=await verify(plan);report.alreadyApplied=mode!=='verify';}
 else {
  const collisions=(await client.query('select request_number from tbl_return_requests where request_number like $1 union all select route_number from tbl_routes where route_number like $1',[`${batch}-%`])).rows;
  assert.equal(collisions.length,0,'Existe otro lote con la misma marca; no se mezcla.');
  const before=await fingerprint(plan,true);
  for(const table of order)await insert(table,plan.rows[table]);
  report.result=await verify(plan);
  assert.deepEqual(await fingerprint(plan,true),before,'Cambió contenido ajeno al lote: se revierte.');
  report.checks.existingRowsPreserved=true;
 }
 const ownFingerprint=mode==='clean'?null:await fingerprint(plan);
 const commit=mode==='execute'||mode==='clean'&&args.includes('--execute');
 // Un fallo de disco al guardar la propiedad debe ocurrir antes del COMMIT, para revertir la BD.
 if(mode==='execute'&&!report.alreadyApplied)fs.writeFileSync(proofFile,JSON.stringify({batch,preparedAt:new Date().toISOString(),ownFingerprint},null,2)+'\n');
 await client.query(commit?'COMMIT':'ROLLBACK');report.committed=commit;report.status='verified';report.scenarios=plan.scenarios;report.limitations=plan.limitations;
 console.log(JSON.stringify({batch,mode,committed:commit,status:report.status,scenarios:plan.scenarios.length,...report.result,limitations:plan.limitations},null,2));
}catch(error){await client.query('ROLLBACK').catch(()=>{});report.status='failed';report.error={code:error.code||error.name,constraint:error.constraint,table:error.table,column:error.column,message:error instanceof assert.AssertionError?error.message.split('\n')[0]:'Operación de mock fallida; credenciales y valores de conexión omitidos.'};console.error(JSON.stringify(report.error));process.exitCode=1;}
finally{await client.end().catch(()=>{});fs.writeFileSync(path.join(folder,`${batch}-${mode}-${Date.now()}.json`),JSON.stringify(report,null,2)+'\n');}
