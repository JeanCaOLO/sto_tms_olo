// Compilación y rollback repetibles. Las carreras y hechos se prueban con PostgreSQL real.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(resolve(process.env.TMS_T03_PGLITE_MODULE||join(tmpdir(),'tms-t03-postgres-tools/node_modules/@electric-sql/pglite/dist/index.js'))).href);
const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');

test('77 compila, no crea outbox, se repite y permite rollback antes del uso',async()=>{
 const db=new PGlite('memory://');
 try {
  await db.waitReady;
  const foundation=read('tests/postgres/test_returns_concurrency.py').match(/run\(connection,'''([\s\S]*?)'''\)/)[1];
  await db.exec(foundation);
  await db.exec(read('sql/76_return_request_origin_balance.sql'));
  const forward=read('sql/77_return_collection_contract.sql');
  await db.exec(forward);await db.exec(forward);
  assert.equal((await db.query("SELECT to_regclass('public.tbl_return_request_outbox') AS name")).rows[0].name,null);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM vw_return_collection_candidates")).rows[0].n,0);
  const rollback=read('sql/77_return_collection_contract_rollback.sql');
  await db.exec(rollback);await db.exec(rollback);await db.exec(forward);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM vw_return_collection_candidates")).rows[0].n,0);
 } finally {await db.close();}
});
