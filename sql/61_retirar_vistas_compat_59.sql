-- ============================================================================
-- 61_retirar_vistas_compat_59.sql — retira las vistas de compatibilidad de la sql/59
-- (los nombres viejos: orders, order_items, audit.events, …).
--
-- ADR-0005, Migration notes paso 4. Se verificó el 2026-11-05:
--   - todos los stacks dev-tms-* están redesplegados desde main con los nombres tbl_*;
--   - el código de main (backend, server, scripts, src) no consulta ningún nombre viejo;
--   - ninguna función de public/audit nombra una tabla vieja;
--   - ningún objeto de la base depende de estas vistas.
-- Aviso: las ramas que no hayan traído main después del 2026-11-03 (p. ej. `josef`)
-- todavía tienen SQL con los nombres viejos; tienen que traer main antes de mergear.
--
-- Borra SOLO las vistas con el comentario 'compat:estandar-oltp-59' (84), sin CASCADE: si
-- algo dependiera de una, falla y no borra nada.
-- Rollback exacto (definición, dueño, GRANT y comentario): sql/61_retirar_vistas_compat_59_rollback.sql
--
-- Estándar OLTP INTELIX (sql/README.md). Aurora PostgreSQL. Idempotente.
-- ============================================================================

do $$
declare
  v record;
begin
  for v in
    select n.nspname as esquema, c.relname as vista
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'v' and obj_description(c.oid, 'pg_class') like 'compat:estandar-oltp-59%'
  loop
    execute format('drop view %I.%I', v.esquema, v.vista);
  end loop;
end $$;

-- ============================================================================
-- ROLLBACK: correr sql/61_retirar_vistas_compat_59_rollback.sql
-- ============================================================================

-- Validación (debe dar 0)
select count(*) as vistas_compat_restantes
from pg_class where relkind = 'v' and obj_description(oid, 'pg_class') like 'compat:estandar-oltp-59%';
