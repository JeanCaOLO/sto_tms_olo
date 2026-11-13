# 01 — Días de anticipo por zona: cierre del rollout

**Estado:** pendiente por implementar (el código del OMS ya está; falta aplicar y poblar).

Ver el cambio base en `docs/work/2026-11/2026-11-10-dias-anticipo-por-zona-oms.md`.

## Qué falta

### 1. Aplicar la migración en Aurora — ✅ HECHO (2026-11-10), renumerada 64→65 (2026-11-11)
`sql/65_zonas_dias_anticipo.sql` aplicada y registrada en `schema_migrations`. Verificado:
`dias_anticipo smallint NOT NULL DEFAULT 1` + `tipo_zona text`; las 41 zonas quedaron en
`dias_anticipo = 1`. Rollback disponible: `sql/65_zonas_dias_anticipo_rollback.sql`. Para
referencia, así se corrió (túnel en localhost:15432, credenciales admin en `.env`):

```
node --env-file=.env scripts/run-migration.mjs sql/65_zonas_dias_anticipo.sql            # dry-run
node --env-file=.env scripts/run-migration.mjs sql/65_zonas_dias_anticipo.sql --execute  # aplica
```
Rollback: `sql/65_zonas_dias_anticipo_rollback.sql`.

> **OJO (renumeración 64→65).** Se aplicó como `64_zonas_dias_anticipo.sql`, así que en Aurora
> la fila de `schema_migrations` quedó con `name='64_zonas_dias_anticipo.sql'`. El runner
> registra por `basename`, así que al desplegar verá `65_zonas_dias_anticipo.sql` como NO
> aplicada y la re-correrá. Es **idempotente** (`ADD COLUMN IF NOT EXISTS` / `DROP CONSTRAINT
> IF EXISTS`), así que re-correrla es inocuo. Opcional, para dejar el historial limpio (toca
> Aurora, requiere OK): `UPDATE schema_migrations SET name='65_zonas_dias_anticipo.sql' WHERE
> name='64_zonas_dias_anticipo.sql';`

Tras aplicar: todas las zonas quedan en `dias_anticipo = 1` (default). CR queda correcto de
una; VE necesita el paso 2.

### 2. Poblar `dias_anticipo` de las zonas de Venezuela
CR = 1 para todo (default). **VE varía (1, 2, 3+ por zona)** y ese mapeo aún no existe —
hay que levantarlo con negocio/Planificación y hacer un `UPDATE tbl_zones SET dias_anticipo =
... WHERE id = ...` (o un SQL de carga). Mientras no se pueble, VE corre con 1 (seguro,
gracias al default y al fallback).

### 3. Refrescar metadata que apunta al viejo `orders.route_type_id` (no urgente)
El rename de Planificación (`route_type_id` → `tms_zone_id` en `tbl_orders`) dejó referencias
al nombre viejo. No rompe runtime del OMS, pero conviene actualizar a `tms_zone_id`:
- `backend/data/src/relations.py:84` (`("orders", "route_type_id", "zones")`).
- `server/tms-relations.mjs:85`.
- `scripts/diccionario-datos.py:101` (texto de doc).
- `src/pages/planificacion/fallback-rutas.ts` (solo comentarios).

OJO: `routes.route_type_id` es **otra** columna (no la renombró Planificación); no tocarla.

### 4. Vista de compatibilidad `public.zones` (solo si algún consumidor la necesita)
`public.zones` (sql/59) es `select *` y **no** expone las columnas nuevas hasta recrearse. El
OMS lee `tbl_zones` directo, así que no la necesita. Si otro módulo quisiera leer
`zones.dias_anticipo` por la vista, recrearla:
`create or replace view public.zones as select * from public.tbl_zones;`

## Cómo verificar (tras aplicar)
1. En `tms_olo`: `SELECT dias_anticipo, tipo_zona FROM tbl_zones LIMIT 5;` → columnas existen,
   default 1.
2. OMS en `live` (`OMS_SOURCE=live`): un pedido de una zona con `dias_anticipo > 1` debe
   liberarse antes (su ventana abre `dispatch_date − dias_anticipo`).
3. Un pedido con `tms_zone_id` NULL debe seguir liberándose con 1 día (fallback a
   `dias_prep_picking`).
