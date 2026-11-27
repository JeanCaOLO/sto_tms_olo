# Entrega de TMS-QA-001 para retest independiente

La regresión usa PostgreSQL en memoria con PGlite 0.5.16. Crea tablas simplificadas, inserta un fixture sintético con IDs de QA y ejecuta el SQL incluido. No necesita red hacia Aurora o S3, credenciales ni datos reales. El probador debe usar exclusivamente el entorno aislado para este retest.

## Cómo reproducir

1. Desde una carpeta aislada, guardar el primer bloque en scripts/sandbox/tms_qa_001_cleanup.sql.
2. Guardar el segundo bloque en cleanup-regression.cjs, en la raíz de esa carpeta.
3. Ejecutar los comandos desde esa raíz con Node.js y npm.

```sh
npm init -y
npm install --save-exact --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.5.16
node cleanup-regression.cjs
```

## Qué comprobar

- El borrado directo de la línea falla porque la devolución la referencia.
- Una dependencia fuera del manifiesto bloquea el retiro incluso si la FK permite borrado en cascada.
- Tras ROLLBACK, reaparecen las filas del fixture y desaparece el evento de auditoría generado por la prueba.
- El COMMIT aislado retira 15 filas, conserva el pedido ajeno y las dos cuentas inactivas, y produce un evento de auditoría.
- El proceso termina con código 0.

El script abre una transacción y verifica conteos de propiedad y dependencias antes de borrar. No incluye operaciones S3. El probador ya verificó la ausencia de las tres claves exactas en el entorno autorizado. El retiro de cuentas de 36b37d6 ya se verificó y no se debe repetir. Jean conserva la decisión sobre un ensayo con ROLLBACK y una posterior confirmación en Aurora.

## SQL de limpieza

```sql
-- Fixture QAFL-20261127-HTTP-590570. Ejecutar en una conexión dedicada.
-- Validar primero que las tres claves exactas de S3 sigan sin versiones ni marcadores.
-- El archivo termina con la transacción abierta. ROLLBACK para ensayar.
-- Jean puede confirmar con COMMIT tras revisar las validaciones y los conteos.
BEGIN;
SET LOCAL application_name = 'tms-qa-001-fixture-cleanup';
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

CREATE TEMP TABLE tms_qa_001_targets (
    relation regclass,
    row_location tid,
    PRIMARY KEY (relation, row_location)
) ON COMMIT DROP;

CREATE TEMP TABLE tms_qa_001_plan (
    delete_order integer PRIMARY KEY,
    relation regclass UNIQUE NOT NULL,
    expected integer NOT NULL
) ON COMMIT DROP;

INSERT INTO pg_temp.tms_qa_001_plan VALUES
    (1, 'public.tbl_tracking_evidences', 3),
    (2, 'public.tbl_tracking_events', 3),
    (3, 'public.tbl_driver_presence', 1),
    (4, 'public.tbl_returns', 1),
    (5, 'public.tbl_dispatch_guides', 1),
    (6, 'public.tbl_routes', 1),
    (7, 'public.tbl_order_items', 2),
    (8, 'public.tbl_orders', 1),
    (9, 'public.tbl_drivers', 1),
    (10, 'public.tbl_vehicles', 1);

DO $cleanup$
DECLARE
    qa_order constant uuid := 'c0a25168-0fb4-4c52-b5c9-b942bbd25957';
    qa_items constant uuid[] := ARRAY[
        'c365ee15-96dd-41a6-86ee-d8be0a11363a', '0ae40778-4475-4da8-b90e-28eff1768057'
    ]::uuid[];
    qa_route constant uuid := '2e345292-5315-4e2b-a37d-d156dc4bf288';
    qa_guide constant uuid := 'dc64a19b-4a0f-4184-9330-45b11bd8ce74';
    qa_return constant uuid := '954aed29-67ce-439d-9f3d-03f01610f846';
    qa_driver constant uuid := '1997e511-f3ff-44ed-8931-cb3da19b2d0e';
    qa_vehicle constant uuid := '7a082387-2966-43b1-9e34-495b5a73f89c';
    qa_driver_user constant uuid := '48f64d51-170b-4272-89b9-79f1c08a935b';
    qa_operator_user constant uuid := 'fb79e737-e79b-4276-abe3-15794f7bbfc0';
    marker constant text := 'QAFL-20261127-HTTP-590570';
    target record;
    fk record;
    expected_count bigint;
    deleted_count bigint;
    has_unlisted_dependency boolean;
BEGIN
    IF current_setting('session_replication_role') <> 'origin' THEN
        RAISE EXCEPTION 'TMS-QA-001: la sesión debe ejecutar los triggers normales';
    END IF;
    IF (SELECT count(*) FROM public.tbl_app_users
        WHERE id IN (qa_driver_user, qa_operator_user) AND is_active IS FALSE) <> 2
        OR EXISTS (SELECT 1 FROM public.tbl_mobile_refresh_tokens
                   WHERE app_user_id IN (qa_driver_user, qa_operator_user) AND revoked_at IS NULL) THEN
        RAISE EXCEPTION 'TMS-QA-001: retirar el acceso de ambas cuentas antes de limpiar';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM pg_temp.tms_qa_001_plan plan JOIN pg_class rel ON rel.oid = plan.relation
        WHERE rel.relkind <> 'r' OR rel.relhassubclass OR row_security_active(rel.oid)
    ) THEN
        RAISE EXCEPTION 'TMS-QA-001: la sesión no puede verificar todas las filas del manifiesto';
    END IF;

    -- Bloquea las filas verificadas para impedir nuevas referencias durante la limpieza.
    INSERT INTO pg_temp.tms_qa_001_targets
        SELECT 'public.tbl_orders', ctid FROM public.tbl_orders
        WHERE id = qa_order AND strpos(order_number, marker) > 0 FOR UPDATE;
    INSERT INTO pg_temp.tms_qa_001_targets
        SELECT 'public.tbl_order_items', ctid FROM public.tbl_order_items
        WHERE id = ANY(qa_items) AND order_id = qa_order FOR UPDATE;
    INSERT INTO pg_temp.tms_qa_001_targets
        SELECT 'public.tbl_drivers', ctid FROM public.tbl_drivers
        WHERE id = qa_driver AND app_user_id = qa_driver_user FOR UPDATE;
    INSERT INTO pg_temp.tms_qa_001_targets
        SELECT 'public.tbl_vehicles', ctid FROM public.tbl_vehicles WHERE id = qa_vehicle FOR UPDATE;
    INSERT INTO pg_temp.tms_qa_001_targets
        SELECT 'public.tbl_routes', ctid FROM public.tbl_routes
        WHERE id = qa_route AND driver_id = qa_driver AND vehicle_id = qa_vehicle FOR UPDATE;
    INSERT INTO pg_temp.tms_qa_001_targets
        SELECT 'public.tbl_dispatch_guides', ctid FROM public.tbl_dispatch_guides
        WHERE id = qa_guide AND route_id = qa_route AND order_id = qa_order FOR UPDATE;
    INSERT INTO pg_temp.tms_qa_001_targets
        SELECT 'public.tbl_returns', ctid FROM public.tbl_returns
        WHERE id = qa_return AND dispatch_guide_id = qa_guide AND order_item_id = ANY(qa_items)
          AND order_id = qa_order FOR UPDATE;
    INSERT INTO pg_temp.tms_qa_001_targets
        SELECT 'public.tbl_tracking_evidences', ctid FROM public.tbl_tracking_evidences
        WHERE route_id = qa_route AND dispatch_guide_id = qa_guide AND order_id = qa_order
          AND strpos(order_number, marker) > 0
          AND strpos(storage_key, 'pedidos/' || order_number || '/' || qa_order || '/') = 1
        FOR UPDATE;
    INSERT INTO pg_temp.tms_qa_001_targets
        SELECT 'public.tbl_tracking_events', ctid FROM public.tbl_tracking_events
        WHERE route_id = qa_route AND (dispatch_guide_id IS NULL OR dispatch_guide_id = qa_guide)
        FOR UPDATE;
    INSERT INTO pg_temp.tms_qa_001_targets
        SELECT 'public.tbl_driver_presence', ctid FROM public.tbl_driver_presence
        WHERE driver_id = qa_driver
          AND organization_id = (SELECT organization_id FROM public.tbl_orders WHERE id = qa_order)
        FOR UPDATE;

    FOR target IN SELECT * FROM pg_temp.tms_qa_001_plan ORDER BY delete_order LOOP
        SELECT count(*) INTO expected_count
        FROM pg_temp.tms_qa_001_targets t WHERE t.relation = target.relation;
        IF expected_count <> target.expected THEN
            RAISE EXCEPTION 'TMS-QA-001: % tiene % filas verificadas, se esperaban %',
                target.relation, expected_count, target.expected;
        END IF;
    END LOOP;

    -- Incluye las referencias CASCADE y SET NULL para evitar cambios indirectos
    -- sobre filas que no estén dentro del manifiesto verificado.
    FOR fk IN
        SELECT c.conname, c.conrelid::regclass AS child, c.confrelid::regclass AS parent,
               string_agg(format('child.%I = parent.%I', ca.attname, pa.attname), ' AND ') AS relationship
        FROM pg_constraint c
        CROSS JOIN LATERAL unnest(c.conkey, c.confkey) AS keys(child_key, parent_key)
        JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = keys.child_key
        JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = keys.parent_key
        WHERE c.contype = 'f' AND c.confrelid IN (SELECT DISTINCT relation FROM pg_temp.tms_qa_001_targets)
        GROUP BY c.oid, c.conname, c.conrelid, c.confrelid
    LOOP
        IF row_security_active(fk.child) THEN
            RAISE EXCEPTION 'TMS-QA-001: la sesión no puede verificar todas las referencias en %', fk.child;
        END IF;
        EXECUTE format(
            'SELECT EXISTS (
                SELECT 1 FROM %s parent
                JOIN pg_temp.tms_qa_001_targets owned ON owned.relation = $1 AND owned.row_location = parent.ctid
                JOIN %s child ON %s
                WHERE NOT EXISTS (
                    SELECT 1 FROM pg_temp.tms_qa_001_targets actual
                    WHERE actual.relation = $2 AND actual.row_location = child.ctid
                )
            )', fk.parent, fk.child, fk.relationship
        ) INTO has_unlisted_dependency USING fk.parent, fk.child;
        IF has_unlisted_dependency THEN
            RAISE EXCEPTION 'TMS-QA-001: dependencia fuera del manifiesto: % en %', fk.conname, fk.child;
        END IF;
    END LOOP;

    FOR target IN SELECT * FROM pg_temp.tms_qa_001_plan ORDER BY delete_order LOOP
        EXECUTE format(
            'DELETE FROM %s target USING pg_temp.tms_qa_001_targets own
             WHERE own.relation = $1 AND own.row_location = target.ctid', target.relation
        ) USING target.relation;
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        IF deleted_count <> target.expected THEN
            RAISE EXCEPTION 'TMS-QA-001: % retiró % filas, se esperaban %',
                target.relation, deleted_count, target.expected;
        END IF;
        RAISE NOTICE 'TMS-QA-001: % retiró % filas en la transacción abierta', target.relation, deleted_count;
    END LOOP;
END;
$cleanup$;

SET CONSTRAINTS ALL IMMEDIATE;
```

## Regresión aislada

```javascript
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const cleanup = fs.readFileSync('scripts/sandbox/tms_qa_001_cleanup.sql','utf8');
const fixture = cleanup.match(/constant uuid(?:\[\])? := (?:ARRAY\[[\s\S]*?\]::uuid\[\]|'[^']+');/g).flatMap(x => x.match(/[0-9a-f-]{36}/g));
const [order,itemA,itemB,route,guide,rma,driver,vehicle,userA,userB] = fixture;
const qaNumber = 'QAFL-20261127-HTTP-590570-PED';
const schema = [
 'CREATE TABLE tbl_app_users(id uuid PRIMARY KEY, is_active boolean)',
 'CREATE TABLE tbl_mobile_refresh_tokens(app_user_id uuid REFERENCES tbl_app_users, revoked_at timestamptz)',
 'CREATE TABLE tbl_orders(id uuid PRIMARY KEY, order_number text, organization_id uuid)',
 'CREATE TABLE tbl_order_items(id uuid PRIMARY KEY, order_id uuid REFERENCES tbl_orders ON DELETE CASCADE)',
 'CREATE TABLE tbl_drivers(id uuid PRIMARY KEY, app_user_id uuid REFERENCES tbl_app_users)',
 'CREATE TABLE tbl_vehicles(id uuid PRIMARY KEY)',
 'CREATE TABLE tbl_driver_presence(driver_id uuid PRIMARY KEY REFERENCES tbl_drivers ON DELETE CASCADE, organization_id uuid)',
 'CREATE TABLE tbl_routes(id uuid PRIMARY KEY, driver_id uuid REFERENCES tbl_drivers ON DELETE SET NULL, vehicle_id uuid REFERENCES tbl_vehicles ON DELETE SET NULL)',
 'CREATE TABLE tbl_dispatch_guides(id uuid PRIMARY KEY, route_id uuid REFERENCES tbl_routes ON DELETE CASCADE, order_id uuid REFERENCES tbl_orders ON DELETE CASCADE)',
 'CREATE TABLE tbl_returns(id uuid PRIMARY KEY, dispatch_guide_id uuid REFERENCES tbl_dispatch_guides ON DELETE SET NULL, order_item_id uuid REFERENCES tbl_order_items ON DELETE RESTRICT, order_id uuid REFERENCES tbl_orders ON DELETE CASCADE)',
 'CREATE TABLE tbl_tracking_evidences(route_id uuid REFERENCES tbl_routes, dispatch_guide_id uuid REFERENCES tbl_dispatch_guides, order_id uuid REFERENCES tbl_orders ON DELETE SET NULL, order_number text, storage_key text)',
 'CREATE TABLE tbl_tracking_events(route_id uuid REFERENCES tbl_routes ON DELETE CASCADE, dispatch_guide_id uuid REFERENCES tbl_dispatch_guides ON DELETE CASCADE)',
 'CREATE TABLE unrelated_return_child(return_id uuid REFERENCES tbl_returns ON DELETE CASCADE)',
 'CREATE TABLE qa_test_audit(ref uuid)',
 'CREATE FUNCTION qa_test_audit_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO qa_test_audit VALUES(OLD.id); RETURN OLD; END; $$',
 'CREATE TRIGGER qa_audit AFTER DELETE ON tbl_orders FOR EACH ROW EXECUTE FUNCTION qa_test_audit_delete()',
].join(';');
const unrelated = '00100000-0000-0000-0000-000000000001';
(async () => {
 const db = new PGlite();
 try {
  await db.exec(schema);
  await db.query('INSERT INTO tbl_app_users VALUES ($1,false),($2,false)',[userA,userB]);
  await db.query('INSERT INTO tbl_orders VALUES ($1,$2,$3),($3,$4,$3)',[order,qaNumber,unrelated,'OTHER']);
  await db.query('INSERT INTO tbl_order_items VALUES ($1,$3),($2,$3)',[itemA,itemB,order]);
  await db.query('INSERT INTO tbl_drivers VALUES ($1,$2)',[driver,userA]);
  await db.query('INSERT INTO tbl_vehicles VALUES ($1)',[vehicle]);
  await db.query('INSERT INTO tbl_driver_presence VALUES ($1,$2)',[driver,unrelated]);
  await db.query('INSERT INTO tbl_routes VALUES ($1,$2,$3)',[route,driver,vehicle]);
  await db.query('INSERT INTO tbl_dispatch_guides VALUES ($1,$2,$3)',[guide,route,order]);
  await db.query('INSERT INTO tbl_returns VALUES ($1,$2,$3,$4)',[rma,guide,itemA,order]);
  await db.query("INSERT INTO tbl_tracking_evidences SELECT $1,$2,$3,$4,'pedidos/'||$4||'/'||$3::uuid||'/'||counter FROM generate_series(1,3) counter", [route,guide,order,qaNumber]);
  await db.query('INSERT INTO tbl_tracking_events VALUES ($1,$2),($1,$2),($1,NULL)', [route,guide]);
  const count = async (table) => (await db.query('SELECT count(*)::int AS count FROM '+table)).rows[0].count;
  await assert.rejects(db.query('DELETE FROM tbl_order_items WHERE id=$1',[itemA]), error => ['23001','23503'].includes(error.code) && /foreign key constraint/.test(error.message));
  console.log('Reproducción: el borrado de una línea referenciada falla por la clave foránea.');
  await db.query('INSERT INTO unrelated_return_child VALUES ($1)',[rma]);
  await assert.rejects(db.exec(cleanup), /dependencia fuera del manifiesto/);
  await db.exec('ROLLBACK');
  assert.equal(await count('unrelated_return_child'),1);
  assert.equal(await count('tbl_returns'),1);
  assert.equal(await count('tbl_tracking_evidences'),3);
  assert.equal(await count('qa_test_audit'),0);
  console.log('Una FK CASCADE fuera del manifiesto bloquea la limpieza completa.');
  await db.query('DELETE FROM unrelated_return_child WHERE return_id=$1',[rma]);
  await db.exec(cleanup);
  assert.equal(await count('tbl_returns'),0);
  assert.equal(await count('qa_test_audit'),1);
  await db.exec('ROLLBACK');
  assert.equal(await count('tbl_returns'),1);
  assert.equal(await count('qa_test_audit'),0);
  console.log('El ensayo con ROLLBACK conserva el fixture.');
  await db.exec(cleanup);
  await db.exec('COMMIT');
  for (const table of ['tbl_returns','tbl_dispatch_guides','tbl_routes','tbl_order_items','tbl_tracking_evidences','tbl_tracking_events','tbl_driver_presence','tbl_drivers','tbl_vehicles']) {
   assert.equal(await count(table),0,table);
  }
  assert.equal(await count('tbl_app_users'),2);
  assert.equal(await count('tbl_orders'),1);
  assert.equal((await db.query('SELECT id FROM tbl_orders')).rows[0].id,unrelated);
  assert.equal(await count('qa_test_audit'),1);
  console.log('COMMIT aislado: 15 filas QA retiradas, ambas cuentas y el pedido ajeno preservados; trigger ejecutado.');
 } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
```
