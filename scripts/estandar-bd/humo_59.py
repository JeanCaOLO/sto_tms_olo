"""Humo de la 59 contra Aurora, TODO dentro de una transacciÃ³n que termina en ROLLBACK.

Aplica sql/59 (dos veces: idempotencia), prueba las vistas de compatibilidad (SELECT, INSERT con
defaults, UPDATE, DELETE, RETURNING, INSERT ... ON CONFLICT DO UPDATE), los GRANT, la auditorÃ­a
(password_hash enmascarado), las secuencias, audit.ensure_partitions, la visibilidad de las vistas
(to_regclass / information_schema) y el rollback exacto (catÃ¡logo idÃ©ntico al de antes).
Con --codigo ademÃ¡s corre consultas reales del cÃ³digo nuevo contra los nombres tbl_*.

Uso:  python scripts/estandar-bd/humo_59.py [--codigo]
Nunca hace COMMIT.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db import ROOT, connect  # noqa: E402

SQL59 = ROOT / "sql" / "59_estandar_oltp_renombrado.sql"
SQL59_RB = ROOT / "sql" / "59_estandar_oltp_renombrado_rollback.sql"
results: list[tuple[str, bool, str]] = []


def body(path: Path) -> str:
    with path.open(encoding="utf-8", newline="") as f:  # conserva \r\n: los cuerpos originales lo traen
        s = f.read().strip()
    s = s.split("\nbegin;", 1)[1]
    return s.rsplit("commit;", 1)[0]


def check(name, ok, detail=""):
    results.append((name, bool(ok), str(detail)))


SIGNATURE = """
select string_agg(x, E'\\n' order by x) from (
  select 'rel ' || n.nspname || '.' || c.relname || ' ' || c.relkind::text || ' ' || coalesce(array_to_string(c.relacl, ','), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','audit')
  union all select 'con ' || conrelid::regclass || ' ' || conname from pg_constraint
   where connamespace in ('public'::regnamespace, 'audit'::regnamespace)
  union all select 'trg ' || tgrelid::regclass || ' ' || tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relnamespace in ('public'::regnamespace, 'audit'::regnamespace) and not tgisinternal
  union all select 'fn ' || md5(pg_get_functiondef(p.oid)) || ' ' || p.proname from pg_proc p
   where pronamespace = 'audit'::regnamespace or proname in ('zone_for_point','assign_zones_by_map','delivery_points_zone_source')
  union all select 'tt ' || table_name || ' ' || masked_columns::text from audit.tracked_tables
) s(x)"""


def one(cur, sql, args=None):
    cur.execute(sql, args)
    r = cur.fetchone()
    return r[0] if r and len(r) == 1 else r


def main(codigo: bool) -> int:
    conn = connect(app_name="humo_59")
    cur = conn.cursor()
    try:
        before = one(cur, SIGNATURE)
        cur.execute(body(SQL59))
        cur.execute("select control, case when fallas = 0 then 'OK' else 'FALLA (' || fallas || ')' end from estandar_59_validacion")
        for control, res in cur.fetchall():
            check(f"validaciÃ³n 59: {control}", res == "OK", res)
        cur.execute(body(SQL59))  # idempotencia
        check("59 idempotente (segunda corrida sin errores)", True)
        after_once = one(cur, SIGNATURE)

        # --- 4) visibilidad (schema_probe/to_regclass/information_schema)
        for rel in ("public.orders", "public.order_items", "public.auth_credentials", "public.tarifas_v_viajes",
                    "audit.events", "audit.tracked_tables"):
            check(f"to_regclass('{rel}') sigue resolviendo", one(cur, "select to_regclass(%s) is not null", [rel]))
        check("information_schema.columns ve public.orders (data API)",
              one(cur, "select count(*) from information_schema.columns where table_schema='public' and table_name='orders'") > 10)
        check("information_schema.tables ve public.orders",
              one(cur, "select count(*) from information_schema.tables where table_schema='public' and table_name='orders'") == 1)

        # --- 2) permisos: cada vista de compatibilidad = mismos privilegios que su fÃ­sico
        cur.execute("""
          select c.oid::regclass::text, substring(obj_description(c.oid, 'pg_class') from 'nombre viejo de ([a-z0-9_.]+);')
            from pg_class c where obj_description(c.oid, 'pg_class') like 'compat:estandar-oltp-59%%'""")
        pairs = cur.fetchall()
        bad = []
        for v, phys in pairs:
            for priv in ("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"):
                a = one(cur, "select has_table_privilege('tms_app', %s, %s)", [v, priv])
                b = one(cur, "select has_table_privilege('tms_app', %s, %s)", [phys, priv])
                if a != b:
                    bad.append(f"{v}:{priv} vista={a} fisico={b}")
        check(f"GRANT de tms_app idÃ©nticos en {len(pairs)} vistas de compatibilidad", not bad and len(pairs) == 85, "; ".join(bad[:5]))
        check("tms_app puede SELECT/INSERT/UPDATE/DELETE en public.orders (vista)",
              all(one(cur, "select has_table_privilege('tms_app','public.orders',%s)", [p]) for p in ("SELECT", "INSERT", "UPDATE", "DELETE")))

        # --- 1) DML a travÃ©s de la vista de compatibilidad public.orders
        cols = [r[0] for r in (cur.execute("""select column_name from information_schema.columns
                 where table_schema='public' and table_name='orders' and column_name not in ('id','created_at','updated_at')
                 order by ordinal_position""") or cur.fetchall())]
        src = one(cur, "select id from orders where eflow_id_expedicion is not null limit 1")
        collist = ", ".join(f'"{c}"' for c in cols)
        sel = ", ".join(
            "'HUMO59-' || order_number" if c == "order_number" else
            "'HUMO59'" if c == "eflow_id_expedicion" else f'"{c}"' for c in cols)
        new_id, created = one(cur, f"insert into orders ({collist}) select {sel} from orders where id = %s "
                                   "returning id, created_at", [src])
        check("INSERT con defaults + RETURNING por la vista orders", new_id and created, f"id={new_id}")
        check("la fila insertada estÃ¡ en tbl_orders", one(cur, "select count(*) from tbl_orders where id=%s", [new_id]) == 1)
        n = one(cur, "update orders set notes = 'humo59' where id = %s returning notes", [new_id])
        check("UPDATE + RETURNING por la vista orders", n == "humo59")
        upsert = f"""insert into orders ({collist}) select {sel} from orders where id = %s
          on conflict (eflow_id_almacen, eflow_id_compania, eflow_id_sucursal, eflow_id_expedicion)
          do update set notes = 'humo59-upsert'
          where (orders.notes) is distinct from ('humo59-upsert') returning id, notes"""
        r = one(cur, upsert, [src])
        check("INSERT ... ON CONFLICT DO UPDATE por la vista orders (ingest_orders)", r and r[0] == new_id and r[1] == 'humo59-upsert', r)
        oi = one(cur, "select order_id, line_number from order_items limit 1")
        if oi:
            cur.execute("""select column_name from information_schema.columns where table_schema='public'
                           and table_name='order_items' and column_name not in ('id','created_at','updated_at')""")
            icols = ", ".join(f'"{c}"' for (c,) in cur.fetchall())
            r = one(cur, f"""insert into order_items ({icols})
                            select {icols} from order_items where order_id=%s and line_number=%s
                            on conflict (order_id, line_number) do update set line_number = excluded.line_number
                            returning id""", list(oi))
            check("INSERT ... ON CONFLICT DO UPDATE por la vista order_items (ingest_items)", r is not None)
        d = one(cur, "delete from orders where id = %s returning id", [new_id])
        check("DELETE + RETURNING por la vista orders", d == new_id)

        # --- 3) auditorÃ­a
        ev = one(cur, """select entity_table, changes from audit.events
                          where entity_id = %s and action = 'update' order by id desc limit 1""", [str(new_id)])
        check("auditorÃ­a registra el UPDATE con entity_table lÃ³gico 'orders'", ev and ev[0] == "orders", ev and ev[0])
        cred = one(cur, "select auth_user_id from auth_credentials limit 1")
        if cred:
            cur.execute("update auth_credentials set password_hash = password_hash || 'x' where auth_user_id = %s", [cred])
            ch = one(cur, """select changes -> 'password_hash' from audit.tbl_events where entity_table='auth_credentials'
                              and entity_id=%s order by id desc limit 1""", [str(cred)])
            check("UPDATE a auth_credentials: password_hash sigue enmascarado", ch == ["[oculto]", "[oculto]"], json.dumps(ch))
        else:
            check("UPDATE a auth_credentials: password_hash sigue enmascarado", False, "sin filas en auth_credentials")
        check("tracked_tables apunta a tbl_auth_credentials con password_hash oculto",
              one(cur, "select 'password_hash' = any(masked_columns) from audit.tbl_tracked_tables where table_name='tbl_auth_credentials'"))

        # --- 7) particiones y secuencias
        check("audit.ensure_partitions crea tbl_events_YYYY_MM",
              one(cur, "select audit.ensure_partitions(1, date '2028-01-01')") == 2
              and one(cur, "select to_regclass('audit.tbl_events_2028_01') is not null"))
        one(cur, """insert into audit.events (occurred_at, actor_type, source, action) values
                    ('2028-01-15', 'system', 'humo59', 'humo') returning id""")
        check("insert en audit.events (vista) cae en la particiÃ³n 2028_01",
              one(cur, "select count(*) from audit.tbl_events_2028_01 where source='humo59'") == 1)
        for t in ("tbl_costos_fijos", "tbl_costos_variables", "tbl_tracking_positions"):
            s = one(cur, "select pg_get_serial_sequence(%s, 'id')", ["public." + t])
            check(f"{t}.id usa {s}", s and ".seq_" in s)
            check(f"nextval({s}) funciona", one(cur, "select nextval(%s) > 0", [s]))
        check("audit.tbl_events.id default usa audit.seq_events_id",
              one(cur, "select pg_get_expr(adbin, adrelid) from pg_attrdef where adrelid='audit.tbl_events'::regclass and adnum=1") ==
              "nextval('audit.seq_events_id'::regclass)")
        check("las funciones de zonas compilan con tbl_ (assign_zones_by_map)",
              one(cur, "select assign_zones_by_map(id) >= 0 from tbl_countries limit 1"))

        if codigo:
            humo_codigo(cur)

        # --- rollback exacto (en la misma transacciÃ³n)
        cur.execute("drop table if exists audit.tbl_events_2028_01, audit.tbl_events_2028_02")
        cur.execute(body(SQL59_RB))
        cur.execute(body(SQL59_RB))
        after_rb = one(cur, SIGNATURE)
        diff = sorted(set(before.splitlines()) ^ set(after_rb.splitlines()))
        check("rollback deja el catÃ¡logo idÃ©ntico al de antes (y es idempotente)", not diff, "; ".join(diff[:6]))
        check("la 59 sÃ­ cambiÃ³ el catÃ¡logo", before != after_once)
    except Exception as e:  # noqa: BLE001
        check("excepciÃ³n", False, f"{type(e).__name__}: {e}")
    finally:
        conn.rollback()
        conn.close()

    for name, ok, detail in results:
        print(f"[{'OK' if ok else 'FALLA'}] {name}" + (f"  ({detail})" if detail and not ok or detail.startswith("id=") else ""))
    fails = sum(not ok for _, ok, _ in results)
    print(f"\n{len(results) - fails}/{len(results)} OK â€” ROLLBACK aplicado, Aurora sin cambios.")
    return 1 if fails else 0


def humo_codigo(cur) -> None:
    """Consultas reales del cÃ³digo nuevo (nombres tbl_*) dentro de la misma transacciÃ³n."""
    import humo_codigo_59  # noqa: PLC0415

    for name, ok, detail in humo_codigo_59.run(cur):
        check(f"cÃ³digo nuevo: {name}", ok, detail)


if __name__ == "__main__":
    sys.exit(main("--codigo" in sys.argv))
