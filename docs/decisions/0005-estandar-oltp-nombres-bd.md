# 0005 — Aplicar el estándar OLTP Intelix a los nombres de tms_olo con vistas de compatibilidad

- **Status**: Proposed (la migración está probada en ensayo; pasa a Accepted cuando se aplique con `--execute`)
- **Date**: 2026-11-03
- **Owner role**: data-architect
- **Affects**: Aurora `tms_olo` (esquemas `public` y `audit`), `sql/59_*`, todos los stacks de `backend/`, `server/`, `scripts/`, tests contra Aurora

## Context

El estándar OLTP de Intelix (`grupomayoreo/template_base`, `templates/docs/estandares-base-de-datos-oltp-intelix.md`,
master `1722ac8`) pide prefijos por tipo de objeto (`tbl_`, `vw_`, `seq_`, `pk_`, `fk_`, `uq_`, `ck_`, `idx_`,
`uidx_`, `trg_`, `fn_`), minúsculas, snake_case y ASCII. Medido el 2026-11-03 en `tms_olo` (el único cluster; es QA):
80/80 tablas, 72/81 PK, 127/149 FK, 21/27 unique, 45/62 check, 188/286 índices y 68/73 triggers de `public` no
cumplían. Las Lambdas desplegadas (`tms-api`, `tms-mobile-api`, usuario `tms_app`) usan los nombres viejos y no se
redespliegan todas a la vez, así que el renombrado no puede romperlas el día que se aplica.

## Decision

Renombrar todos los objetos propios de `public` y `audit` al estándar en una sola migración generada desde el
catálogo (`sql/59_estandar_oltp_renombrado.sql`), y dejar en la misma transacción una vista de compatibilidad con
cada nombre viejo, hasta que todos los stacks corran el código nuevo.

Reglas aplicadas (las genera `scripts/estandar-bd/generar_renombrado.py`):

- **Tablas**: `tbl_` + nombre actual, sin traducir ni agregar compañía/ambiente/aplicativo (`orders → tbl_orders`,
  `costos_fijos → tbl_costos_fijos`). El esquema sigue siendo `public` (renombrarlo es otra fase).
  Las particiones de `audit.events` también: `audit.tbl_events_2026_09`, `audit.tbl_events_default`.
- **Vistas**: `vw_` + nombre sin el marcador `v_` (`tarifas_v_viajes → vw_tarifas_viajes`,
  `v_costo_fijo_mensual → vw_costo_fijo_mensual`).
- **Constraints, índices y triggers**: `pk_<entidad>`, `fk_|uq_|ck_<entidad>_<resto>`, `idx_|uidx_<entidad>_<resto>`,
  `trg_<entidad>_<resto>`; la entidad es el nombre de la tabla sin `tbl_` y el resto es el nombre viejo sin el
  prefijo de la tabla ni el sufijo `_pkey/_fkey/_key/_check/_idx` (`orders_customer_id_fkey → fk_orders_customer_id`).
  Lo que ya tenía el prefijo correcto se deja. Si un nombre pasa de 63 caracteres: 54 caracteres + `_` + 8 de md5.
- **Secuencias**: `seq_<entidad>_<columna>` (`costos_fijos_id_seq → seq_costos_fijos_id`,
  `audit.event_ids → audit.seq_events_id`). Los `nextval()` por defecto y las identity van por OID.
- **Columnas**: ninguna columna incumple fuera de la tabla excluida (verificado por catálogo).
- **Vistas de compatibilidad**: `create view public.orders as select * from public.tbl_orders` (85: 79 tablas y
  6 vistas), con los mismos GRANT que el objeto físico (`tms_app` y cualquier otro rol, copiados del ACL) y un
  comentario `compat:estandar-oltp-59` para encontrarlas. No hay RLS en `public`/`audit`, así que no llevan
  `security_invoker` (PostgreSQL 17.7 lo soporta si algún día hace falta). Son vistas simples: Postgres las hace
  auto-actualizables y acepta SELECT, INSERT con los defaults de la tabla, UPDATE, DELETE, `RETURNING` e
  `INSERT ... ON CONFLICT DO UPDATE` (probado en ensayo).
- **Auditoría**: `audit.tbl_tracked_tables` pasa al nombre físico (lo que ve `tg_table_name`); si no,
  `password_hash` de `tbl_auth_credentials` se registraría sin enmascarar. `audit.capture_row_change()` busca por el
  nombre físico pero sigue escribiendo `entity_table` con el nombre LÓGICO (`orders`), para no cortar la bitácora
  ni el filtro "tabla" de `/auditoria`. `audit.ensure_partitions()` crea `audit.tbl_events_YYYY_MM`.
- **Código**: el SQL literal usa los nombres físicos. El contrato HTTP (`/api/data/<tabla>`,
  `/api/tarifas/<tabla>`, embeds del `select`) sigue con nombres LÓGICOS y el backend traduce en un solo lugar:
  `backend/common-services/layers/tms_common/tms_common/db_names.py` (y su gemelo generado
  `server/tms-db-names.mjs` para el server Express legado).

Desviaciones (no se tocan, quedan documentadas):

| Objeto | Por qué |
|---|---|
| `schema_migrations`, `mobile_migrations` | Bitácoras de los runners de migración (`scripts/run-migration.mjs`, móvil): renombrarlas obliga a cambiar los runners y su historial |
| `sim_expedicionescabecera` (tabla, 56 columnas en MAYÚSCULAS, constraints, índices, triggers) | Tabla de SIMULACIÓN, espejo 1:1 de eFlow `EXPEDICIONESCABECERA` |
| Objetos de extensiones (`pg_depend.deptype = 'e'`: PostGIS `spatial_ref_sys`, `geometry_columns`, `geography_columns`, ~800 funciones) | Los administra la extensión |
| Funciones propias (`audit.capture_row_change`, `audit.ensure_partitions`, `audit.forbid_change`, `assign_zones_by_map`, `zone_for_point`, `set_updated_at`, `tarifas_forbid_change`, `delivery_points_zone_source`, `zones_reassign_points`, `addresses_reassign_point`) | Todas se llaman por nombre desde el código o las migraciones (`backend/admin/src/audit_maintenance.py`, `backend/local/ingest_delivery_points*.py`, `sql/16..51`). Conservan el nombre; la 59 solo cambia los cuerpos que nombran tablas |
| Nombres de esquema `public`/`audit` | El estándar pide `sch_`; es otra fase |

## Considered alternatives

- **Renombrar sin vistas de compatibilidad, con ventana de corte** — aplicar la 59 y redesplegar todos los stacks a la
  vez. Rechazada: las Lambdas desplegadas fallarían entre el `COMMIT` y el último redespliegue, y no hay un solo
  pipeline que despliegue todo a la vez.
- **Vistas con el nombre NUEVO sobre las tablas viejas** — `create view tbl_orders as select * from orders`.
  Rechazada: el catálogo seguiría incumpliendo (las tablas reales con nombres viejos) y los constraints/índices
  no cambiarían.
- **Mantener `audit.tracked_tables` con nombres lógicos y quitar `tbl_` en la función** — Rechazada para que la
  tabla de configuración diga el nombre real de la tabla auditada; `entity_table` se mantiene lógico por continuidad.

## Consequences

- **Positive**: el catálogo de `tms_olo` cumple el estándar (la validación de la 59 lo comprueba fila a fila); el
  rollback es exacto (el humo deja el catálogo idéntico al de antes); las Lambdas viejas siguen funcionando.
- **Negative**: 85 vistas de compatibilidad hasta retirarlas. `select *` **congela la lista de columnas**: si una
  migración agrega una columna a `tbl_x` mientras exista la vista `x`, hay que recrear la vista
  (`create or replace view x as select * from tbl_x`) o el código viejo no verá la columna. Las migraciones nuevas
  deben escribirse contra `tbl_*` (un `alter table orders` falla: `orders` es una vista). `sql/16` y `sql/17` ya
  no se pueden re-correr tal cual (crean triggers sobre `public.orders`, que ahora es vista, y fallan).
- **Neutral**: el código nuevo SOLO funciona con la 59 aplicada (usa `tbl_*`): el orden es **aplicar la 59 →
  desplegar**. Los tests de `src/` que van directo a Aurora quedan en rojo hasta aplicarla.

## Migration notes

Guía para escribir las migraciones posteriores a la 59: [`sql/README.md`](../../sql/README.md).

1. `node --env-file=.env.local scripts/run-migration.mjs sql/59_estandar_oltp_renombrado.sql` (ensayo, ROLLBACK)
   y `python scripts/estandar-bd/humo_59.py --codigo` (todo OK).
2. Aplicar con `--execute` (humano). Rollback exacto: `sql/59_estandar_oltp_renombrado_rollback.sql`.
3. Redesplegar todos los stacks de `backend/` (y el frontend no cambia).
4. **Retiro de las vistas de compatibilidad**: cuando TODOS los stacks desplegados corran el código posterior a
   este ADR (verificar por stack en CloudFormation/Lambda que la versión desplegada incluye el commit
   `refactor(bd): Usar los nombres físicos...`) y CloudWatch no muestre consultas a los nombres viejos durante una
   semana (p. ej. `pg_stat_statements` o `log_statement` en QA), crear `sql/NN_retirar_vistas_compat_59.sql`:
   `drop view` de cada vista con comentario `compat:estandar-oltp-59`, en una transacción, con su rollback
   (recrearlas). Hasta entonces, cada migración que agregue columnas a una tabla con vista debe recrear la vista.
5. Si se agrega una tabla nueva: crearla ya como `tbl_<nombre>`, registrarla en `audit.tbl_tracked_tables` con el
   nombre físico y regenerar `db_names.py`/`tms-db-names.mjs` (`python scripts/estandar-bd/generar_renombrado.py`
   antes de aplicar la 59; después, agregar la entrada a mano en ambos archivos).

## Open coordination points

- Dueño de backend (Claude, ver `.agents/CANAL.md`): este cambio toca `backend/`, `server/` y `sql/` por pedido
  explícito del usuario ("hacé todo").
- Infra: el orden aplicar → desplegar, y la ventana para retirar las vistas.
