-- ============================================================================
-- 64 ROLLBACK — deshace sql/64_devoluciones_solicitudes_cliente.sql. Idempotente.
--
-- Respalda las solicitudes en tablas _bak antes de borrarlas. El rol "Cliente" se quita solo si ningún
-- usuario lo tiene asignado (puede existir de antes: sql/15 lo siembra con permisos de pedidos/tracking).
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.tbl_return_requests') is not null then
    execute 'create table if not exists tbl_return_requests_bak as select * from tbl_return_requests';
    execute 'create table if not exists tbl_return_request_items_bak as select * from tbl_return_request_items';
    execute 'create table if not exists tbl_return_request_files_bak as select * from tbl_return_request_files';
  end if;
end $$;

drop table if exists tbl_return_request_files;
drop table if exists tbl_return_request_items;
drop table if exists tbl_return_requests;

delete from tbl_role_permissions where module_key = 'devoluciones_solicitud';
delete from tbl_app_modules where key = 'devoluciones_solicitud';

delete from tbl_roles r
 where lower(r.name) = 'cliente'
   and not exists (select 1 from tbl_app_users u where u.role_id = r.id)
   and not exists (select 1 from tbl_role_permissions p where p.role_id = r.id);

drop index if exists idx_app_user_customer;
alter table tbl_app_users drop constraint if exists fk_app_user_customer;
alter table tbl_app_users drop column if exists customer_id;

commit;
