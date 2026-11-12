# Cómo escribir una migración de `tms_olo`

Guía práctica para la próxima migración. Desde la `sql/59` (2026-11-03), la base `tms_olo` (Aurora
PostgreSQL, el único cluster; es QA) sigue el **estándar OLTP Intelix**. Toda migración nueva tiene
que respetarlo.

- Norma completa: [`docs/estandares-base-de-datos-oltp-intelix.md`](../docs/estandares-base-de-datos-oltp-intelix.md).
- Por qué y cómo se aplicó, con las excepciones: [ADR-0005](../docs/decisions/0005-estandar-oltp-nombres-bd.md).

## Reglas en 30 segundos

1. **Escribe contra el nombre físico `tbl_*`**: `alter table tbl_orders ...`. **Nunca** `alter table orders`:
   `orders` es una vista de compatibilidad, así que ese ALTER falla.
2. Todo en minúsculas, snake_case y ASCII (sin tildes ni ñ). No se traduce el idioma: `delivery_date` se queda así.
3. Cada objeto lleva su prefijo (tabla de abajo).
4. Un archivo por cambio, `sql/NN_descripcion.sql`, idempotente, con su sección `ROLLBACK` y una consulta de validación.
5. Primero se corre en ensayo y después se aplica con `--execute`.

## Prefijos

| Objeto | Formato | Ejemplo |
|---|---|---|
| Tabla | `tbl_<nombre>` | `tbl_orders` |
| Vista / vista materializada | `vw_<nombre>` / `mvw_<nombre>` | `vw_tarifas_viajes` |
| Función / procedimiento | `fn_<nombre>` / `sp_<nombre>` | `fn_calcular_tarifa` |
| Secuencia | `seq_<entidad>_<columna>` | `seq_costos_fijos_id` |
| Primary key | `pk_<entidad>` | `pk_costos_fijos` |
| Foreign key | `fk_<entidad>_<destino o columna>` | `fk_order_customer` |
| Unique | `uq_<entidad>_<columnas>` | `uq_mi_tabla_codigo` |
| Check | `ck_<entidad>_<regla>` | `ck_order_delivery_date_change_count` |
| Índice / índice único | `idx_<entidad>_<columnas>` / `uidx_<entidad>_<columnas>` | `idx_mi_tabla_fecha` |
| Trigger | `trg_<entidad>_<acción>` | `trg_orders_audit_row_change`, `trg_costos_fijos_updated` |

**Entidad**:
- En una **tabla nueva**, la entidad es el nombre de la tabla sin `tbl_`: en `tbl_mi_tabla`, la entidad es `mi_tabla`, como en el
  ejemplo del estándar (`pk_clientes`).
- En una **tabla existente**, usa la forma que ya usan sus constraints. Por ejemplo, los de `tbl_orders` usan el
  singular `order` (`fk_order_customer`, `ck_order_...`), que viene de la regla del 2026-10-16 y la 59 conservó.
  Antes de nombrar algo, mira lo que ya existe:
  `select conname from pg_constraint where conrelid = 'tbl_orders'::regclass;`

Si un nombre pasa de los 63 caracteres de PostgreSQL, acórtalo a 54 caracteres + `_` + 8 caracteres de su md5.

Nombra **siempre** los constraints e índices de forma explícita. Si los dejas sin nombre, PostgreSQL
genera `tbl_mi_tabla_pkey` o `tbl_mi_tabla_customer_id_fkey`, que no cumplen el estándar.

## Excepciones (no se tocan)

- `sim_expedicionescabecera`: es la tabla de **simulación**, espejo de eFlow. Sus columnas siguen en MAYÚSCULAS, igual que en eFlow.
- `schema_migrations` y `mobile_migrations`: los historiales de los runners de migración.
- Los objetos de PostGIS (`spatial_ref_sys`, sus funciones).
- Las funciones que ya existían (`set_updated_at`, `audit.capture_row_change`, `assign_zones_by_map`, etc.) conservan
  su nombre porque el código las llama por nombre. Las **nuevas** sí llevan `fn_`.

## Mientras existan las vistas de compatibilidad

La 59 dejó 85 vistas con los nombres viejos (`orders`, `order_items`, …) para que no se rompan las Lambdas desplegadas
con código viejo. Las vistas tienen el comentario `compat:estandar-oltp-59` y se retiran cuando todo esté
redesplegado (ADR-0005, Migration notes). Hasta entonces:

- **Si agregas o quitas columnas en `tbl_x`, recrea la vista `x` en la misma migración**, porque el `select *` de la vista
  congela la lista de columnas:
  ```sql
  create or replace view public.x as select * from public.tbl_x;
  ```
  `create or replace` mantiene los GRANT de la vista y solo admite columnas **agregadas al final**. Si quitas o
  renombras una columna, haz `drop view` + `create view`, y copia los GRANT y el comentario.
- Las **tablas nuevas no llevan vista de compatibilidad**: nacen como `tbl_*` y el código nuevo las usa directo.
- No vuelvas a correr `sql/16` ni `sql/17` (crean triggers sobre `public.orders`, que ahora es una vista).

## Al crear una tabla nueva

1. Créala como `tbl_<nombre>` con PK, FK, unique, check e índices **con nombre**. Incluye `organization_id` (y el país o la compañía
   cuando aplique), `created_at`/`updated_at` y el trigger `trg_<entidad>_updated`
   (`before update ... execute function set_updated_at()`) si la tabla los usa.
2. **Auditoría**: regístrala en `audit.tbl_tracked_tables` con el **nombre físico** y crea su trigger. Si tiene
   columnas sensibles, ponlas en `masked_columns`; si no, quedan en claro en `audit.tbl_events`.
   ```sql
   insert into audit.tbl_tracked_tables (table_name, module_key, id_column, masked_columns)
   values ('tbl_mi_tabla', 'mi_modulo', 'id', '{}')
   on conflict (table_name) do nothing;
   create trigger trg_mi_tabla_audit_row_change after insert or update or delete on public.tbl_mi_tabla
     for each row execute function audit.capture_row_change();
   ```
3. **Mapa lógico→físico**: si la tabla se expone por `/api/data/<tabla>` o `/api/tarifas/<tabla>`, agrega la
   entrada `'mi_tabla': 'tbl_mi_tabla'` en **los dos** mapas:
   `backend/common-services/layers/tms_common/tms_common/db_names.py` y `server/tms-db-names.mjs`. Si la data API
   la expone, agrégala también en su whitelist (`backend/data/src/relations.py`). El frontend sigue usando el nombre
   lógico (`mi_tabla`).
4. Dales permisos a los roles de la app (`tms_app`), con el mismo criterio que las tablas parecidas.

## Plantilla

```sql
-- ============================================================================
-- NN_descripcion_corta.sql — qué hace y por qué (reunión, ticket o decisión de origen).
--
-- Estándar OLTP INTELIX (sql/README.md): nombres físicos tbl_*, prefijos, ROLLBACK + validación.
-- Aurora PostgreSQL. Idempotente.
--
-- Uso:  node --env-file=.env.local scripts/run-migration.mjs sql/NN_descripcion_corta.sql            (ensayo)
--       node --env-file=.env.local scripts/run-migration.mjs sql/NN_descripcion_corta.sql --execute  (aplica)
-- ============================================================================

alter table tbl_orders add column if not exists mi_columna integer not null default 0;

alter table tbl_orders drop constraint if exists ck_order_mi_columna;
alter table tbl_orders add constraint ck_order_mi_columna check (mi_columna >= 0);

create index if not exists idx_orders_mi_columna on tbl_orders (mi_columna);

comment on column tbl_orders.mi_columna is 'Qué guarda y quién la escribe.';

-- La vista de compatibilidad tiene que ver la columna nueva (mientras exista; ver sql/README.md).
create or replace view public.orders as select * from public.tbl_orders;

-- ============================================================================
-- ROLLBACK (descomentar y ejecutar en orden descendente)
-- ----------------------------------------------------------------------------
-- drop view if exists public.orders;  -- + recrearla sin la columna, con sus GRANT y comentario
-- drop index if exists idx_orders_mi_columna;
-- alter table tbl_orders drop constraint if exists ck_order_mi_columna;
-- alter table tbl_orders drop column if exists mi_columna;
-- ============================================================================

-- Validación (todo debe dar true)
select exists (select 1 from information_schema.columns
               where table_name = 'tbl_orders' and column_name = 'mi_columna')         as columna_ok,
       exists (select 1 from pg_constraint where conname = 'ck_order_mi_columna')      as check_ok,
       exists (select 1 from pg_indexes where indexname = 'idx_orders_mi_columna')     as indice_ok;
```

## Numeración y ejecución

- **Número**: el siguiente libre, mirando `sql/` y también las ramas abiertas. Ya hubo tres `56_*` el mismo día porque
  varias personas tomaron el mismo número. Si dos ramas chocan, la que entra segunda se renumera antes de aplicarse.
- **Ensayo** (siempre primero): sin `--execute`, el runner corre todo en una transacción y hace ROLLBACK.
- **Aplicar**: con `--execute`. El runner registra el archivo en `schema_migrations` con su checksum y no deja
  reaplicarlo; solo se puede con `--force`, y solo si la migración es idempotente.
- Antes de aplicar en la base compartida, revisa que nadie tenga transacciones largas abiertas (`pg_stat_activity`) y
  limita la espera de locks: `$env:PGOPTIONS='-c lock_timeout=10s'` (PowerShell).
- La conexión sale de `.env.local` (`TMS_DB_*` y `TMS_DB_ADMIN_*`, túnel en `localhost:15432`; ver
  `docs/guides/tunel-ssm-a-rds.md`). Aurora solo está encendida de lunes a viernes de 04:45 a 17:00, hora de Costa Rica.
- **Orden de despliegue**: primero la migración y después el código que la usa.

## Checklist antes del `--execute`

- [ ] Nombres físicos `tbl_*`; cada constraint, índice y trigger con nombre y prefijo.
- [ ] Idempotente (`if not exists` / `drop ... if exists`) y con `ROLLBACK` y validación.
- [ ] Si tocaste columnas de `tbl_x`, recreaste la vista `x`.
- [ ] Si es tabla nueva: auditoría, mapas lógico→físico, whitelist de la data API y permisos.
- [ ] El ensayo pasa sin errores y la validación da todo `true`.
- [ ] El código que la usa está listo para desplegarse **después** de aplicarla.
