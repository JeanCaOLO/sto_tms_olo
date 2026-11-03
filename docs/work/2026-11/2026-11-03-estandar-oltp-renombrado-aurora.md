# 2026-11-03 — Estándar OLTP Intelix en la Aurora del TMS (renombrado probado en ensayo)

## What changed

- `scripts/estandar-bd/generar_renombrado.py`: lee el catálogo de `tms_olo` (solo SELECT) y escribe
  `sql/59_estandar_oltp_renombrado.sql`, su rollback exacto `sql/59_estandar_oltp_renombrado_rollback.sql` y el
  mapa lógico→físico (`backend/common-services/layers/tms_common/tms_common/db_names.py`, `server/tms-db-names.mjs`).
- `sql/59`: una transacción idempotente que renombra
  - 96 tablas → `tbl_` (79 de `public` + `audit.events`, `audit.tracked_tables` y las 17 particiones de `audit.events`),
  - 6 vistas → `vw_`, 4 secuencias → `seq_`,
  - 281 constraints → `pk_/fk_/uq_/ck_` (incluye los PK de las particiones, por su índice),
  - 185 índices → `idx_/uidx_`, 87 triggers → `trg_` (los clones de partición los renombra el padre),
  - crea 85 vistas de compatibilidad con el nombre viejo (mismos GRANT, comentario `compat:estandar-oltp-59`),
  - pasa `audit.tbl_tracked_tables` al nombre físico, reescribe `audit.capture_row_change`,
    `audit.ensure_partitions`, `assign_zones_by_map`, `zone_for_point` y `delivery_points_zone_source` a los
    nombres físicos (sin cambiarles el nombre),
  - termina con una validación que aborta la transacción si algún control no da `OK`.
- Código: SQL literal de `backend/`, `server/`, `scripts/` y de los tests contra Aurora reescrito a `tbl_*`/`vw_*`
  (`scripts/estandar-bd/reescribir_codigo.py`); la data API, tarifas y el server Express traducen el nombre lógico
  del contrato HTTP a físico en un solo lugar. Inventario: `2026-11-03-impacto-renombrado-codigo.md`.
- ADR: `docs/decisions/0005-estandar-oltp-nombres-bd.md`.
- **La 59 NO se aplicó.** Solo ensayos con ROLLBACK.

## Why

Pedido del usuario: poner `tms_olo` al estándar OLTP de Intelix (`template_base` master `1722ac8`) sin romper las
Lambdas desplegadas ni `main-v2`. Cambio de alcance del mismo día: `sim_expedicionescabecera` queda fuera
completa (tabla de simulación) y el alcance incluye corregir el código.

## How

- Reglas de nombre y desviaciones: ver ADR-0005. Exclusiones explícitas en el generador:
  `schema_migrations`, `mobile_migrations`, `sim_expedicionescabecera`, y todo objeto con `pg_depend.deptype = 'e'`.
- Columnas: con `sim_expedicionescabecera` fuera, el catálogo no tiene ninguna columna fuera de
  `^[a-z0-9_]+$` en `public`/`audit` (control "columnas en minúsculas/ASCII" de la validación).
- Funciones: las 10 propias se llaman por nombre desde código o migraciones → se conservan (desviación).
- Ensayo: `node --env-file=.env.local scripts/run-migration.mjs sql/59_estandar_oltp_renombrado.sql`
  → `DRY RUN de "59_estandar_oltp_renombrado.sql" completado sin errores. Base de datos SIN cambios (ROLLBACK).`
- Humo: `python scripts/estandar-bd/humo_59.py --codigo` → **48/48 OK**, ROLLBACK. Aplica la 59 dos veces
  (idempotencia) y prueba, a través de las vistas de compatibilidad: SELECT, INSERT con defaults + RETURNING,
  UPDATE, DELETE, `INSERT ... ON CONFLICT DO UPDATE` en `orders` y `order_items` (las ingestas), GRANT de
  `tms_app` idénticos en las 85 vistas, `to_regclass`/`information_schema` (lo que usan la data API y las sondas),
  auditoría (`entity_table` lógico; `password_hash` sigue `[oculto]` al hacer UPDATE en `auth_credentials`),
  `audit.ensure_partitions` creando `tbl_events_2028_01` y un insert cayendo ahí, secuencias (`pg_get_serial_sequence`
  + `nextval`), `PREPARE` de 192 constantes SQL del código nuevo y de 202 del desplegado (`6551778`) sin errores,
  `bandeja.listar`, data API con embed, tarifas sobre `vw_tarifas_viajes`, `ingest_items._UPSERT` real, y el
  rollback dentro de la misma transacción (catálogo idéntico al de antes, idempotente).
- Linter del estándar (`validar_sql.py`) sobre la 59 y su rollback: `[OK] Nomenclatura conforme`. Ojo: para OLTP
  solo revisa reglas generales (minúsculas/ASCII) de los `CREATE`; no exige prefijos (probado: acepta
  `create view public.orders`). Los prefijos los verifica la validación de la propia 59.
- Tests: `pytest` en `backend/` 544 passed; `backend/mobile` 146 passed, 23 skipped;
  `npx tsc --noEmit -p tsconfig.app.json` sin errores; `npx vitest run` 1723 passed, 1 failed:
  `src/__tests__/db-connectivity.test.ts` consulta `to_regclass('public.tbl_zones')` en Aurora viva y falla hasta
  aplicar la 59 (esperado).

## Promoted knowledge

- ADR-0005 (estándar aplicado, desviaciones, vistas de compatibilidad y su retiro).
- Orden de despliegue: **aplicar la 59 → desplegar el código**. El código nuevo no funciona sin la 59.

## Estimación

**No se capturaron datos de estimación para esta iteración** (esfuerzo/puntos/tiempo). No se reconstruyen ni se
inventan. `team.md` no afirma un umbral de estimación obligatoria; queda explícito como gap. Si el proceso del
equipo la exige para esta iteración, falta agregarla con cifras reales.

## Follow-ups

- Aplicar la 59 con `--execute` (humano). `humo_59.py` está pensado para ANTES de aplicarla (compara contra el
  catálogo sin renombrar); después, verificar copiando la consulta de validación del final de la 59 (sección 9).
- Redesplegar todos los stacks; luego retirar las vistas de compatibilidad (`sql/NN_retirar_vistas_compat_59.sql`)
  según ADR-0005 §Migration notes.
- Mientras existan las vistas: toda migración que agregue columnas a `tbl_x` debe recrear la vista `x`
  (`select *` congela columnas). Las migraciones nuevas se escriben contra `tbl_*`.
- No re-correr `sql/16`/`sql/17` ni `scripts/print-tarifas-ddl.ts` contra la base (usan los nombres viejos;
  `src/lib/tarifas/data/schema.ts` sigue siendo la fuente lógica de tarifas).
- `schema_probe.tabla_existe()` no existe en este worktree (`backend-planif/` tampoco); cualquier sonda por
  `to_regclass` o `information_schema` sigue viendo los nombres viejos (vistas) y los nuevos.
- Nombres feos pero deterministas que vale revisar con arquitectura: índices sin el prefijo de su tabla quedan
  con la entidad duplicada (`ix_mobile_refresh_user → idx_mobile_refresh_tokens_mobile_refresh_user`).
- Renombrar los esquemas (`sch_`) y las funciones (`fn_`) queda para otra fase.
