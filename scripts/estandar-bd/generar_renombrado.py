"""Genera sql/59_estandar_oltp_renombrado.sql (+ _rollback.sql) leyendo el catálogo de tms_olo.

Solo LEE el catálogo (SELECT). Aplica el estándar OLTP Intelix
(docs/decisions/0014-estandar-oltp-nombres-bd.md):
  tablas tbl_, vistas vw_, secuencias seq_, pk_/fk_/uq_/ck_, idx_/uidx_, trg_.
Entidad = nombre de la tabla sin tbl_. Lo que ya cumple su prefijo se deja.
Nombres > 63: 54 caracteres + '_' + 8 de md5 (determinista).

Fuera de alcance (desviaciones documentadas): objetos de extensiones (pg_depend.deptype='e'),
schema_migrations, mobile_migrations, sim_expedicionescabecera (tabla de simulación, con todos sus
objetos) y las funciones propias (todas se llaman por nombre desde código o migraciones).

Uso:  python scripts/estandar-bd/generar_renombrado.py
"""

import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db import ROOT, connect  # noqa: E402

SCHEMAS = ("public", "audit")
EXCLUDED_TABLES = {"schema_migrations", "mobile_migrations", "sim_expedicionescabecera"}
OUT = ROOT / "sql" / "59_estandar_oltp_renombrado.sql"
OUT_RB = ROOT / "sql" / "59_estandar_oltp_renombrado_rollback.sql"
COMPAT = "compat:estandar-oltp-59"
SUFFIX = re.compile(r"_(pkey|fkey|key|check\d*|idx|index|uniq|unique|uk|fk|trg)$")
PREFIX_OK = {"p": "pk_", "f": "fk_", "u": "uq_", "c": "ck_"}


def fit(name: str) -> str:
    name = re.sub(r"[^a-z0-9_]", "_", name.lower())
    name = re.sub(r"_+", "_", name).strip("_")
    if len(name) <= 63:
        return name
    return name[:54].rstrip("_") + "_" + hashlib.md5(name.encode()).hexdigest()[:8]


def ent(table: str) -> str:
    return table[4:] if table.startswith("tbl_") else table


def core(name: str, olds: list[str]) -> str:
    n = name
    for p in ("uidx_", "idx_", "uix_", "ux_", "ix_", "pk_", "fk_", "uq_", "uk_", "ck_", "trg_"):
        if n.startswith(p):
            n = n[len(p):]
            break
    for old in sorted(olds, key=len, reverse=True):
        if n == old:
            return ""
        if n.startswith(old + "_"):
            n = n[len(old) + 1:]
            break
    n = SUFFIX.sub("", n)
    return n if n not in olds else ""


def ident(s: str) -> str:
    return s if re.fullmatch(r"[a-z_][a-z0-9_]*", s) else '"' + s.replace('"', '""') + '"'


def lit(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def q(cur, sql, args=None):
    cur.execute(sql, args)
    return cur.fetchall()


NOT_EXT = """not exists (select 1 from pg_depend d where d.objid = {oid} and d.classid = '{cls}'::regclass
             and d.deptype = 'e')"""


def main() -> None:
    conn = connect(app_name="generar_renombrado")
    conn.set_session(readonly=True)
    cur = conn.cursor()

    # ---------------------------------------------------------------- tablas
    rows = q(cur, f"""
      select c.oid, n.nspname, c.relname, c.relispartition,
             (select p.relname from pg_inherits i join pg_class p on p.oid = i.inhparent where i.inhrelid = c.oid)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in %s and c.relkind in ('r','p') and {NOT_EXT.format(oid='c.oid', cls='pg_class')}
       order by n.nspname, c.relispartition, c.relname""", (SCHEMAS,))
    tables = {}  # oid -> dict(schema, old, new, partition, parent_old)
    for oid, sch, name, ispart, parent in rows:
        if name in EXCLUDED_TABLES:
            continue
        new = name if name.startswith("tbl_") else fit("tbl_" + name)
        tables[oid] = dict(schema=sch, old=name, new=new, part=ispart, parent=parent)
    # Ya aplicada: el nombre viejo es una vista de compatibilidad. Recuperar old desde el comentario.
    compat_rows = q(cur, f"""select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
                             where c.relkind='v' and obj_description(c.oid,'pg_class') like '{COMPAT}%%'""")
    if compat_rows:
        sys.exit(f"La 59 ya parece aplicada ({len(compat_rows)} vistas de compatibilidad). Genera desde un catálogo previo.")

    def olds_for(oid: int) -> list[str]:
        t = tables[oid]
        out = [t["old"], ent(t["new"])]
        if t["parent"]:
            out += [t["parent"], ent("tbl_" + t["parent"]) if not t["parent"].startswith("tbl_") else ent(t["parent"])]
        return out

    # ---------------------------------------------------------------- constraints
    cons = q(cur, """
      select co.conrelid, co.conname, co.contype, co.conislocal, co.conindid,
             (select relname from pg_class where oid = co.conindid)
        from pg_constraint co where co.conrelid = any(%s) and co.contype in ('p','f','u','c')
       order by co.conrelid, co.contype, co.conname""", (list(tables),))
    con_ren, idx_via_con = [], set()
    used_con: dict[int, set[str]] = {}
    used_idx: dict[str, set[str]] = {}
    for rel, name, typ, local, indid, idxname in cons:
        t = tables[rel]
        used_con.setdefault(rel, set()).add(name)
        if indid and typ in ("p", "u"):
            idx_via_con.add(indid)
        pfx = PREFIX_OK[typ]
        if name.startswith(pfx):
            continue
        e = ent(t["new"])
        new = fit(f"pk_{e}") if typ == "p" else fit(f"{pfx}{e}_{core(name, olds_for(rel))}".rstrip("_"))
        if not local:
            if typ == "c":
                continue  # heredado: lo renombra el RENAME CONSTRAINT del padre
            # PK/UQ de una partición: se renombra su índice (renombra también la constraint).
            con_ren.append(("idx_of_con", t, name, new, idxname))
            continue
        con_ren.append(("con", t, name, new, None))
    # desambiguar por tabla
    seen: dict[tuple, int] = {}
    fixed = []
    for kind, t, old, new, idxname in con_ren:
        key = (t["schema"], t["new"], new)
        seen[key] = seen.get(key, 0) + 1
        if seen[key] > 1:
            new = fit(f"{new}_{seen[key]}")
        fixed.append((kind, t, old, new, idxname))
    con_ren = fixed

    # ---------------------------------------------------------------- índices sueltos
    idxs = q(cur, """
      select i.indexrelid, i.indrelid, c.relname, i.indisunique, n.nspname
        from pg_index i join pg_class c on c.oid = i.indexrelid join pg_namespace n on n.oid = c.relnamespace
       where i.indrelid = any(%s) order by i.indrelid, c.relname""", (list(tables),))
    idx_ren = []
    for ioid, rel, name, uniq, sch in idxs:
        used_idx.setdefault(sch, set()).add(name)
        if ioid in idx_via_con:
            continue
        pfx = "uidx_" if uniq else "idx_"
        if name.startswith(pfx):
            continue
        t = tables[rel]
        idx_ren.append((t, name, fit(f"{pfx}{ent(t['new'])}_{core(name, olds_for(rel))}".rstrip("_"))))
    final_names: dict[str, set[str]] = {s: set() for s in SCHEMAS}
    out_idx = []
    for t, old, new in idx_ren:
        base, k = new, 1
        while new in final_names[t["schema"]]:
            k += 1
            new = fit(f"{base}_{k}")
        final_names[t["schema"]].add(new)
        out_idx.append((t, old, new))
    idx_ren = out_idx

    # ---------------------------------------------------------------- triggers (los clones de partición los renombra el padre)
    trgs = q(cur, """select t.tgrelid, t.tgname from pg_trigger t
                      where not t.tgisinternal and t.tgparentid = 0 and t.tgrelid = any(%s) order by 1, 2""", (list(tables),))
    trg_ren = []
    for rel, name in trgs:
        if name.startswith("trg_"):
            continue
        t = tables[rel]
        trg_ren.append((t, name, fit(f"trg_{ent(t['new'])}_{core(name, olds_for(rel))}".rstrip("_"))))

    # ---------------------------------------------------------------- secuencias
    seqs = q(cur, f"""
      select s.oid, n.nspname, s.relname, d.refobjid, a.attname
        from pg_class s join pg_namespace n on n.oid = s.relnamespace
        left join pg_depend d on d.objid = s.oid and d.classid = 'pg_class'::regclass
             and d.refclassid = 'pg_class'::regclass and d.deptype in ('a','i')
        left join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
       where s.relkind = 'S' and n.nspname in %s and {NOT_EXT.format(oid='s.oid', cls='pg_class')}
       order by 2, 3""", (SCHEMAS,))
    seq_ren = []
    for _, sch, name, owner, col in seqs:
        if name.startswith("seq_"):
            continue
        if owner and owner not in tables:
            continue  # pertenece a una tabla excluida
        e = ent(tables[owner]["new"]) if owner else name
        seq_ren.append((sch, name, fit(f"seq_{e}_{col}" if owner else f"seq_{name}")))

    # ---------------------------------------------------------------- vistas propias
    views = q(cur, f"""select c.oid, n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                        where c.relkind = 'v' and n.nspname in %s and {NOT_EXT.format(oid='c.oid', cls='pg_class')}
                        order by 2, 3""", (SCHEMAS,))
    view_ren = []
    for _, sch, name in views:
        if name.startswith("vw_"):
            continue
        base = re.sub(r"^v_", "", name)
        base = re.sub(r"_v_", "_", base, count=1)
        view_ren.append((sch, name, fit("vw_" + base)))

    funcs = {name: d for name, d in q(cur, """select p.proname, pg_get_functiondef(p.oid) from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
              where (n.nspname, p.proname) in (('public','zone_for_point'),('public','assign_zones_by_map'),
                    ('public','delivery_points_zone_source'),('audit','capture_row_change'),('audit','ensure_partitions'))""")}
    conn.close()

    write(tables, con_ren, idx_ren, trg_ren, seq_ren, view_ren, funcs)


# ====================================================================== SQL

HELPERS = r"""
-- Ejecuta `stmt` solo si `cond` es verdadera: hace idempotente cada renombrado.
create or replace function pg_temp.exec_if(cond boolean, stmt text) returns void language plpgsql as $f$
begin
  if cond then execute stmt; end if;
end $f$;

-- Copia a `dst` exactamente los privilegios no-dueño que tiene `src` (quita antes los que puso el
-- default ACL del esquema al crear la vista, para no ampliar permisos).
create or replace function pg_temp.copiar_grants(src regclass, dst regclass) returns void language plpgsql as $f$
declare
  r record;
  who text;
begin
  for r in select distinct a.grantee from pg_class c, aclexplode(c.relacl) a
            where c.oid = dst and a.grantee <> c.relowner loop
    who := case when r.grantee = 0 then 'public' else r.grantee::regrole::text end;
    execute format('revoke all on %s from %s', dst, who);
  end loop;
  for r in select a.grantee, a.privilege_type, a.is_grantable from pg_class c, aclexplode(c.relacl) a
            where c.oid = src and a.grantee <> c.relowner loop
    who := case when r.grantee = 0 then 'public' else r.grantee::regrole::text end;
    execute format('grant %s on %s to %s%s', r.privilege_type, dst, who,
                   case when r.is_grantable then ' with grant option' else '' end);
  end loop;
end $f$;

create or replace function pg_temp.rel_is(rel text, kinds text) returns boolean language sql as $f$
  select exists (select 1 from pg_class where oid = to_regclass(rel) and position(relkind::text in kinds) > 0)
$f$;

create or replace function pg_temp.con_on(rel text, con text) returns boolean language sql as $f$
  select exists (select 1 from pg_constraint where conrelid = to_regclass(rel) and conname = con)
$f$;

create or replace function pg_temp.trg_on(rel text, trg text) returns boolean language sql as $f$
  select exists (select 1 from pg_trigger where tgrelid = to_regclass(rel) and tgname = trg)
$f$;
"""

CAPTURE_ROW_CHANGE = r"""
-- Auditoría (sql/16): busca la configuración por el nombre FÍSICO (tg_table_name = tbl_x) en
-- audit.tbl_tracked_tables, pero registra entity_table con el nombre LÓGICO (sin tbl_) para no
-- cortar la continuidad de la bitácora ni el filtro "tabla" de /auditoria.
create or replace function audit.capture_row_change() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  cfg      audit.tbl_tracked_tables;
  actor    jsonb := nullif(current_setting('tms.audit_actor', true), '')::jsonb;
  old_row  jsonb;
  new_row  jsonb;
  diff     jsonb;
  masked   text[];
  v_app_user uuid;
  v_role     text;
begin
  select * into cfg from audit.tbl_tracked_tables where table_name = tg_table_name;
  masked := coalesce(cfg.masked_columns, '{}');
  if tg_op <> 'INSERT' then old_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_row := to_jsonb(new); end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, case when k = any(masked) then '["[oculto]", "[oculto]"]'::jsonb
                                    else jsonb_build_array(old_row -> k, new_row -> k) end)
      into diff
      from jsonb_object_keys(new_row) as k
     where (old_row -> k) is distinct from (new_row -> k) and k <> 'updated_at';
    if diff is null then
      return null;
    end if;
  end if;

  if actor ->> 'auth_user_id' is not null then
    select au.id, r.name into v_app_user, v_role
      from public.tbl_app_users au left join public.tbl_roles r on r.id = au.role_id
     where au.auth_user_id = (actor ->> 'auth_user_id')::uuid;
  end if;

  insert into audit.tbl_events (actor_type, auth_user_id, app_user_id, actor_email, role_name, source, action,
                                module_key, entity_table, entity_id, changes, before, after,
                                request_id, ip, user_agent)
  values (coalesce(actor ->> 'type', 'system'),
          (actor ->> 'auth_user_id')::uuid, v_app_user, actor ->> 'email', v_role,
          coalesce(actor ->> 'source', 'db:' || coalesce(nullif(current_setting('application_name', true), ''),
                                                         session_user::text)),
          case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,
          cfg.module_key, regexp_replace(tg_table_name, '^tbl_', ''),
          coalesce(new_row, old_row) ->> coalesce(cfg.id_column, 'id'),
          diff,
          case when tg_op = 'DELETE' then old_row - masked end,
          case when tg_op = 'INSERT' then new_row - masked end,
          actor ->> 'request_id', actor ->> 'ip', actor ->> 'user_agent');
  return null;
end $$;
"""

ENSURE_PARTITIONS = r"""
-- Particiones mensuales (sql/17) con los nombres nuevos: audit.tbl_events_YYYY_MM.
create or replace function audit.ensure_partitions(months_ahead int default 3, from_month date default null)
returns int language plpgsql as $$
declare
  first_month date := date_trunc('month', coalesce(from_month, current_date))::date;
  month_start date;
  part text;
  created int := 0;
begin
  for i in 0..months_ahead loop
    month_start := (first_month + make_interval(months => i))::date;
    part := 'tbl_events_' || to_char(month_start, 'YYYY_MM');
    if to_regclass('audit.' || part) is null then
      execute format('create table audit.%I partition of audit.tbl_events for values from (%L) to (%L)',
                     part, month_start, (month_start + interval '1 month')::date);
      execute format('create trigger %I before truncate on audit.%I '
                     'for each statement execute function audit.forbid_change()',
                     'trg_events_' || to_char(month_start, 'YYYY_MM') || '_no_truncate', part);
      created := created + 1;
    end if;
  end loop;
  return created;
end $$;
"""

FUNC_TABLES = {
    "zone_for_point": ["zones"],
    "assign_zones_by_map": ["delivery_points", "addresses"],
    "delivery_points_zone_source": ["addresses"],
}


def swap_tables(defn: str, names: list[str], to_new: bool) -> str:
    head, sep, body = defn.partition("AS $function$")
    for n in names:
        a, b = (n, "tbl_" + n) if to_new else ("tbl_" + n, n)
        body = re.sub(rf"(?<![\w.]){a}(?=\s)", b, body)
    return head + sep + body


def write(tables, con_ren, idx_ren, trg_ren, seq_ren, view_ren, funcs) -> None:
    def rel(sch, name):
        return f"{sch}.{ident(name)}"

    fwd, rb = [], []
    tops = [t for t in tables.values() if t["old"] != t["new"]]

    fwd.append("-- 1) Tablas → tbl_ (las particiones de audit.events incluidas)")
    for t in tops:
        fwd.append(f"select pg_temp.exec_if(pg_temp.rel_is({lit(rel(t['schema'], t['old']))}, 'rp'), "
                   f"{lit(f'alter table {rel(t['schema'], t['old'])} rename to {ident(t['new'])}')});")
        rb.append(f"select pg_temp.exec_if(pg_temp.rel_is({lit(rel(t['schema'], t['new']))}, 'rp'), "
                  f"{lit(f'alter table {rel(t['schema'], t['new'])} rename to {ident(t['old'])}')});")

    fwd.append("\n-- 2) Constraints → pk_/fk_/uq_/ck_ (PK/UQ de particiones: por su índice)")
    rb_con = []
    for kind, t, old, new, idxname in con_ren:
        r = rel(t["schema"], t["new"])
        if kind == "con":
            fwd.append(f"select pg_temp.exec_if(pg_temp.con_on({lit(r)}, {lit(old)}), "
                       f"{lit(f'alter table {r} rename constraint {ident(old)} to {ident(new)}')});")
            rb_con.append(f"select pg_temp.exec_if(pg_temp.con_on({lit(r)}, {lit(new)}), "
                          f"{lit(f'alter table {r} rename constraint {ident(new)} to {ident(old)}')});")
        else:
            fwd.append(f"select pg_temp.exec_if(pg_temp.rel_is({lit(rel(t['schema'], idxname))}, 'iI'), "
                       f"{lit(f'alter index {rel(t['schema'], idxname)} rename to {ident(new)}')});")
            rb_con.append(f"select pg_temp.exec_if(pg_temp.rel_is({lit(rel(t['schema'], new))}, 'iI'), "
                          f"{lit(f'alter index {rel(t['schema'], new)} rename to {ident(idxname)}')});")

    fwd.append("\n-- 3) Índices sueltos → idx_/uidx_")
    rb_idx = []
    for t, old, new in idx_ren:
        fwd.append(f"select pg_temp.exec_if(pg_temp.rel_is({lit(rel(t['schema'], old))}, 'iI'), "
                   f"{lit(f'alter index {rel(t['schema'], old)} rename to {ident(new)}')});")
        rb_idx.append(f"select pg_temp.exec_if(pg_temp.rel_is({lit(rel(t['schema'], new))}, 'iI'), "
                      f"{lit(f'alter index {rel(t['schema'], new)} rename to {ident(old)}')});")

    fwd.append("\n-- 4) Triggers → trg_ (los clones de las particiones se renombran con el padre)")
    rb_trg = []
    for t, old, new in trg_ren:
        r = rel(t["schema"], t["new"])
        fwd.append(f"select pg_temp.exec_if(pg_temp.trg_on({lit(r)}, {lit(old)}), "
                   f"{lit(f'alter trigger {ident(old)} on {r} rename to {ident(new)}')});")
        rb_trg.append(f"select pg_temp.exec_if(pg_temp.trg_on({lit(r)}, {lit(new)}), "
                      f"{lit(f'alter trigger {ident(new)} on {r} rename to {ident(old)}')});")

    fwd.append("\n-- 5) Secuencias → seq_ (los default nextval() y las identity van por OID: siguen funcionando)")
    rb_seq = []
    for sch, old, new in seq_ren:
        fwd.append(f"select pg_temp.exec_if(pg_temp.rel_is({lit(rel(sch, old))}, 'S'), "
                   f"{lit(f'alter sequence {rel(sch, old)} rename to {ident(new)}')});")
        rb_seq.append(f"select pg_temp.exec_if(pg_temp.rel_is({lit(rel(sch, new))}, 'S'), "
                      f"{lit(f'alter sequence {rel(sch, new)} rename to {ident(old)}')});")

    fwd.append("\n-- 6) Vistas propias → vw_")
    rb_view = []
    for sch, old, new in view_ren:
        fwd.append(f"select pg_temp.exec_if(pg_temp.rel_is({lit(rel(sch, old))}, 'v') and to_regclass({lit(rel(sch, new))}) is null, "
                   f"{lit(f'alter view {rel(sch, old)} rename to {ident(new)}')});")
        rb_view.append(f"select pg_temp.exec_if(pg_temp.rel_is({lit(rel(sch, new))}, 'v'), "
                       f"{lit(f'alter view {rel(sch, new)} rename to {ident(old)}')});")

    fwd.append("\n-- 7) Vistas de COMPATIBILIDAD con el nombre viejo (las Lambdas desplegadas usan los nombres viejos).\n"
               "--    `select *` congela la lista de columnas: si una migración agrega columnas a tbl_x, recrear la vista.\n"
               "--    Mismos GRANT que la tabla/vista física. No hay RLS en public/audit: sin security_invoker.")
    rb_compat = []
    compat = [(t["schema"], t["old"], t["new"]) for t in tops if not t["part"]] + list(view_ren)
    for sch, old, new in compat:
        o, n = rel(sch, old), rel(sch, new)
        stmt = f"create or replace view {o} as select * from {n}"
        fwd.append(f"select pg_temp.exec_if(to_regclass({lit(o)}) is null or pg_temp.rel_is({lit(o)}, 'v'), {lit(stmt)});")
        fwd.append(f"comment on view {o} is {lit(f'{COMPAT}: nombre viejo de {n}; se retira tras redesplegar todos los stacks (ADR-0014)')};")
        fwd.append(f"select pg_temp.copiar_grants({lit(n)}::regclass, {lit(o)}::regclass);")
        rb_compat.append(f"select pg_temp.exec_if(pg_temp.rel_is({lit(o)}, 'v') and "
                         f"coalesce(obj_description(to_regclass({lit(o)}), 'pg_class'), '') like '{COMPAT}%', "
                         f"{lit(f'drop view {o}')});")

    fwd.append("\n-- 8) Auditoría: tracked_tables al nombre FÍSICO (si no, password_hash deja de enmascararse)\n"
               "--    y funciones que nombran tablas, a los nombres físicos.")
    fwd.append("update audit.tbl_tracked_tables tt set table_name = 'tbl_' || tt.table_name\n"
               " where tt.table_name not like 'tbl\\_%' and pg_temp.rel_is('public.tbl_' || tt.table_name, 'rp')\n"
               "   and not exists (select 1 from audit.tbl_tracked_tables x where x.table_name = 'tbl_' || tt.table_name);")
    fwd.append(CAPTURE_ROW_CHANGE)
    fwd.append(ENSURE_PARTITIONS)
    for fname, names in FUNC_TABLES.items():
        if fname in funcs:
            fwd.append(swap_tables(funcs[fname], names, True).rstrip() + ";\n")

    rb_tt = ["select pg_temp.exec_if(to_regclass('audit.tbl_tracked_tables') is not null, "
             "$s$update audit.tbl_tracked_tables set table_name = substr(table_name, 5) where table_name like 'tbl\\_%'$s$);"]
    rb_fn = []
    for fname in ("capture_row_change", "ensure_partitions", *FUNC_TABLES):
        if fname in funcs:
            rb_fn.append(funcs[fname].rstrip() + ";\n")

    validation = VALIDATION.replace("{COMPAT}", COMPAT).replace(
        "{EXCL}", ", ".join(lit(x) for x in sorted(EXCLUDED_TABLES)))

    counts = (f"-- Tablas: {len(tops)} (incluye {sum(t['part'] for t in tops)} particiones de audit.events) | "
              f"constraints: {len(con_ren)} | índices: {len(idx_ren)} | triggers: {len(trg_ren)} | "
              f"secuencias: {len(seq_ren)} | vistas: {len(view_ren)} | vistas de compatibilidad: {len(compat)}")
    header = f"""-- ============================================================================
-- 59 — Estándar OLTP Intelix en tms_olo: tablas, vistas, secuencias, constraints, índices y triggers.
--
-- GENERADO por scripts/estandar-bd/generar_renombrado.py desde el catálogo. No editar a mano:
-- regenerar. Decisión: docs/decisions/0014-estandar-oltp-nombres-bd.md.
-- Corre DESPUÉS de sql/58_orders_unificar_contador_cambio_fecha.sql.
{counts}
-- Fuera de alcance (desviaciones): schema_migrations, mobile_migrations, sim_expedicionescabecera
-- (tabla de simulación, con todos sus objetos), objetos de extensiones (PostGIS) y las funciones
-- propias (se llaman por nombre desde código/migraciones; se conservan, solo cambian sus cuerpos).
-- Una transacción; idempotente (cada paso verifica el catálogo antes de actuar).
-- ROLLBACK exacto: sql/59_estandar_oltp_renombrado_rollback.sql.
-- ============================================================================
"""
    OUT.write_text(header + "\nbegin;\n" + HELPERS + "\n" + "\n".join(fwd) + "\n" + validation + "\ncommit;\n",
                   encoding="utf-8", newline="\n")
    rb_all = (rb_compat + [""] + rb_tt + [""] + rb_view + rb_seq + rb_trg + rb_idx + rb_con + [""] + rb
              + ["", "-- Funciones con su definición original (después de devolver los nombres de tabla)."] + rb_fn)
    OUT_RB.write_text(f"""-- ============================================================================
-- 59 ROLLBACK — deshace sql/59_estandar_oltp_renombrado.sql en orden inverso.
-- GENERADO por scripts/estandar-bd/generar_renombrado.py (mismo catálogo que la 59). Idempotente.
-- ============================================================================

begin;
{HELPERS}
""" + "\n".join(rb_all) + "\n\ncommit;\n", encoding="utf-8", newline="\n")
    print(counts.lstrip("- "))
    print(f"escrito {OUT.relative_to(ROOT)} y {OUT_RB.relative_to(ROOT)}")


VALIDATION = r"""
-- 9) Validación: todas las filas deben dar OK; si alguna falla, la transacción aborta.
drop table if exists estandar_59_validacion;
create temp table estandar_59_validacion on commit drop as
with rel as (
  select n.nspname, c.relname, c.relkind, c.oid,
         coalesce(obj_description(c.oid, 'pg_class'), '') like '{COMPAT}%' as compat
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'audit')
     and not exists (select 1 from pg_depend d where d.objid = c.oid and d.classid = 'pg_class'::regclass and d.deptype = 'e')
), excl as (
  select oid from rel where nspname = 'public' and relname in ({EXCL})
)
select 'tablas con tbl_' as control, count(*) filter (where relname !~ '^tbl_[a-z0-9_]+$') as fallas
  from rel where relkind in ('r','p') and oid not in (select oid from excl)
union all
select 'vistas con vw_ (sin contar compatibilidad)', count(*) filter (where relname !~ '^vw_[a-z0-9_]+$')
  from rel where relkind = 'v' and not compat
union all
select 'secuencias con seq_', count(*) filter (where relname !~ '^seq_[a-z0-9_]+$')
  from rel s where relkind = 'S'
   and not exists (select 1 from pg_depend d where d.objid = s.oid and d.refobjid in (select oid from excl))
union all
select 'constraints pk_/fk_/uq_/ck_', count(*) filter (where conname !~ ('^' || case contype when 'p' then 'pk' when 'f' then 'fk'
                                                                          when 'u' then 'uq' else 'ck' end || '_[a-z0-9_]+$'))
  from pg_constraint where contype in ('p','f','u','c') and conrelid in (select oid from rel where relkind in ('r','p'))
   and conrelid not in (select oid from excl)
union all
select 'índices idx_/uidx_', count(*) filter (where c.relname !~ case when i.indisunique then '^(uidx|pk|uq)_[a-z0-9_]+$'
                                                                    else '^idx_[a-z0-9_]+$' end)
  from pg_index i join pg_class c on c.oid = i.indexrelid
 where i.indrelid in (select oid from rel where relkind in ('r','p')) and i.indrelid not in (select oid from excl)
union all
select 'triggers trg_', count(*) filter (where tgname !~ '^trg_[a-z0-9_]+$')
  from pg_trigger where not tgisinternal and tgrelid in (select oid from rel where relkind in ('r','p'))
   and tgrelid not in (select oid from excl)
union all
select 'columnas en minúsculas/ASCII', count(*)
  from pg_attribute a where a.attnum > 0 and not a.attisdropped and a.attname !~ '^[a-z0-9_]+$'
   and a.attrelid in (select oid from rel where relkind in ('r','p','v') and not compat) and a.attrelid not in (select oid from excl)
union all
select 'auditoría: tablas con trigger de auditoría registradas por nombre físico', count(*)
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid
 where p.proname = 'capture_row_change' and not t.tgisinternal
   and not exists (select 1 from audit.tbl_tracked_tables tt where tt.table_name = (select relname from pg_class where oid = t.tgrelid))
union all
select 'auditoría: password_hash enmascarado en tbl_auth_credentials',
       case when exists (select 1 from audit.tbl_tracked_tables where table_name = 'tbl_auth_credentials'
                         and 'password_hash' = any(masked_columns)) then 0 else 1 end
union all
select 'compatibilidad: cada tabla/vista renombrada tiene su vista con el nombre viejo',
       count(*) filter (where to_regclass(nspname || '.' || quote_ident(substr(relname, case when relname like 'tbl\_%' then 5 else 4 end))) is null
                        and not (relname like 'vw\_%'))
  from rel where relkind in ('r','p') and relname like 'tbl\_%'
   and not exists (select 1 from pg_inherits i where i.inhrelid = rel.oid);

do $$
declare n int;
begin
  select count(*) into n from estandar_59_validacion where fallas > 0;
  if n > 0 then
    raise exception 'Validación 59 con % control(es) en FALLA: %', n,
      (select string_agg(control || '=' || fallas, '; ') from estandar_59_validacion where fallas > 0);
  end if;
end $$;

select control, case when fallas = 0 then 'OK' else 'FALLA (' || fallas || ')' end as resultado
  from estandar_59_validacion;
"""

if __name__ == "__main__":
    main()
