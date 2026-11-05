-- ============================================================================
-- 60 ROLLBACK — deshace sql/60_devoluciones_recepcion.sql. Idempotente.
--
-- Antes de quitar las columnas de recepción de tbl_returns y las tablas del formulario, copia sus datos a
-- tablas _bak (si no existen aún) para no perder lo capturado. El rol "Devoluciones" se quita solo si
-- ningún usuario lo tiene asignado.
-- ============================================================================

begin;

-- Respaldo de lo capturado
create table if not exists tbl_return_received_bak as
  select id, received_at, received_by, received_quantity, received_condition, status
    from tbl_returns
   where received_at is not null or received_by is not null or received_quantity is not null
      or received_condition is not null or status = 'received';
do $$
begin
  if to_regclass('public.tbl_return_forms') is not null then
    execute 'create table if not exists tbl_return_forms_bak as select * from tbl_return_forms';
  end if;
  if to_regclass('public.tbl_return_form_sections') is not null then
    execute 'create table if not exists tbl_return_form_sections_bak as select * from tbl_return_form_sections';
  end if;
end $$;

-- Lo recibido vuelve a pendiente para que ningún estado quede fuera del CHECK original (libre)
update tbl_returns set status = 'pending' where status = 'received';

drop view if exists vw_return_trips;
drop table if exists tbl_return_form_sections;
drop table if exists tbl_return_forms;

drop index if exists idx_return_dispatch_guide_status;
alter table tbl_returns drop constraint if exists ck_return_received_quantity;
alter table tbl_returns drop constraint if exists ck_return_status;
alter table tbl_returns drop constraint if exists fk_return_received_by;
alter table tbl_returns drop column if exists received_condition;
alter table tbl_returns drop column if exists received_quantity;
alter table tbl_returns drop column if exists received_by;
alter table tbl_returns drop column if exists received_at;

-- Rol: solo si nadie lo usa
do $$
declare
  rid uuid;
begin
  select id into rid from tbl_roles where lower(name) = 'devoluciones';
  if rid is not null and not exists (select 1 from tbl_app_users u where u.role_id = rid) then
    delete from tbl_role_permissions where role_id = rid;
    delete from tbl_roles where id = rid;
  end if;
end $$;

commit;
