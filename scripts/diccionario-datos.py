"""Genera docs/reference/diccionario-datos-tms-olo.md leyendo la estructura REAL de Aurora (tms_olo).

Solo lectura: abre una sesión read-only con el rol de la app (TMS_DB_USER / TMS_DB_PASSWORD del .env)
a través del túnel SSM (scripts/tunel-aurora.ps1, 127.0.0.1:15432). No lee ni escribe datos de negocio:
solo el catálogo de PostgreSQL y un count(*) por tabla.

Uso:
    python scripts/diccionario-datos.py
Requisitos: túnel abierto, psycopg2 (pip install psycopg2-binary).
"""
import datetime
import pathlib
import re

import psycopg2
import psycopg2.extras

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "reference" / "diccionario-datos-tms-olo.md"

# Agrupación por dominio y descripción corta de cada tabla. La base casi no tiene COMMENT ON,
# así que la descripción se escribe aquí; cuando la base sí trae comentario, se muestra también.
DOMINIOS = [
    ("Organización, países y almacenes", {
        "public.organizations": "Organización dueña de los datos (hoy una sola: OLO). Casi todas las tablas cuelgan de ella.",
        "public.countries": "Países donde opera la organización (CR, VE) con moneda, zona horaria, idioma y formatos.",
        "public.warehouses": "Almacenes/CEDIS por país. Nivel de la jerarquía entre país y cliente.",
        "public.stores": "Tiendas y puntos de origen. `is_origin = true` marca los orígenes de despacho; las tiendas EPA pasaron a `delivery_points` (`sql/13`).",
        "public.zones": "Zonas / tipos de ruta por país. Antes se llamaba `route_types` (renombrada en `sql/09`).",
    }),
    ("Clientes y puntos de entrega", {
        "public.customers": "Clientes de OLO (Cofersa, EPA…), por país y almacén.",
        "public.final_customers": "Clientes finales de cada cliente (a quién se le entrega).",
        "public.delivery_points": "Puntos de entrega de un cliente final, con dirección, ventana horaria, zona y códigos de ruta/zona WMS.",
        "public.addresses": "Direcciones geocodificables, referenciadas por los puntos de entrega.",
        "public.contacts": "Contactos de un cliente final o de un punto de entrega.",
    }),
    ("Transportistas y flota", {
        "public.carriers": "Transportistas (terceros y flota propia) por país.",
        "public.drivers": "Conductores de cada transportista.",
        "public.driver_license_types": "Catálogo de tipos de licencia de conducir por país.",
        "public.driver_licenses": "Licencias de un conductor (N:M). Tabla creada pero aún no es la fuente de verdad: lo sigue siendo `drivers.license_type_id`.",
        "public.vehicles": "Vehículos de cada transportista, con capacidad en peso, volumen y tarimas.",
        "public.vehicle_types": "Catálogo de tipos de vehículo.",
    }),
    ("Pedidos y WMS", {
        "public.orders": "Pedidos a entregar (encabezado): cliente, punto de entrega, fechas, totales, prioridad y estado.",
        "public.order_items": "Líneas (productos) de cada pedido.",
        "public.wms_expediciones": "Staging de expediciones traídas del WMS/EFLOW (`sql/07`): estado, situación, avance, prioridad y viaje WMH.",
    }),
    ("Planificación y ejecución de rutas", {
        "public.route_plans": "Plan de rutas de un día para un país/almacén.",
        "public.plan_trips": "Viajes de un plan: vehículo, conductor, zona y carga total.",
        "public.plan_stops": "Paradas de un viaje planificado (pedido y orden de visita).",
        "public.routes": "Rutas en ejecución: conductor, vehículo, transportista, horarios reales y avance.",
        "public.dispatch_guides": "Guías de despacho: un pedido dentro de una ruta, con horarios, estado de entrega y evidencia (firma, foto).",
        "public.tracking_events": "Eventos de seguimiento de una ruta o guía (con ubicación).",
        "public.returns": "Devoluciones asociadas a una guía o pedido.",
    }),
    ("Tarifas, contratos y liquidaciones", {
        "public.rates": "Tarifas de cada transportista por país, zona y tipo de tarifa.",
        "public.tariff_types": "Catálogo de tipos de tarifa (km, unidad, fija, volumen, tendering).",
        "public.contracts": "Contratos con transportistas u otras entidades: vigencia, valor y renovación.",
        "public.contract_documents": "Documentos adjuntos a un contrato.",
        "public.settlements": "Liquidaciones (pagos) a transportistas y conductores por ruta.",
    }),
    ("Costeo de transporte", {
        "public.tipos_camion": "Tipos de camión del costeo (capacidad, rendimiento km/litro). Datos del estudio de costos CR (`sql/04`).",
        "public.costos_fijos": "Costos fijos mensuales por categoría (conductor, ayudante, otros).",
        "public.costos_variables": "Los 40 componentes de costo variable, con frecuencia y costo por tipo de camión (T1, T3, T5).",
        "public.depreciacion": "Depreciación mensual por tipo de camión.",
        "public.parametros_globales": "Parámetros del costeo (diésel, tipo de cambio, días operativos…).",
        "public.rutas_costeo": "Rutas costeadas por un usuario en la calculadora de costos.",
        "public.sku_cotizaciones": "Cotizaciones por SKU sobre una ruta costeada (peso facturable, unidades máximas).",
        "public.v_costo_fijo_mensual": "Vista: costo fijo mensual por tipo de camión, con y sin ayudante.",
        "public.v_costo_variable_por_km": "Vista: costo variable por km por componente y tipo de camión.",
    }),
    ("Seguridad y acceso", {
        "public.app_users": "Usuarios de la aplicación, con rol y organización.",
        "public.auth_credentials": "Credenciales de inicio de sesión (hash de contraseña) del login propio.",
        "public.roles": "Roles de la aplicación. `all_countries` da acceso a todos los países.",
        "public.role_permissions": "Matriz de permisos: qué acción puede hacer cada rol en cada módulo (`sql/15`).",
        "public.role_countries": "Países a los que tiene acceso un rol cuando no tiene `all_countries`.",
        "public.app_modules": "Catálogo de módulos/pantallas de la aplicación (llave de los permisos).",
        "public.user_scopes": "Alcance de datos de un usuario: país, almacén y cliente que puede ver.",
    }),
    ("Sistema y auditoría", {
        "public.schema_migrations": "Registro de migraciones `sql/NN_*.sql` aplicadas por `scripts/run-migration.mjs`.",
        "audit.events": "Bitácora de auditoría (`sql/16`–`17`, ADR 0003): quién cambió qué, con antes/después. Particionada por mes e inmutable.",
        "audit.tracked_tables": "Tablas que la bitácora audita, con las columnas que se enmascaran.",
    }),
]

# Hallazgos de la última revisión manual contra el repo. Actualizar a mano al regenerar si cambian.
OBSERVACIONES = """## Observaciones (revisión 2026-09-30)

- **Scripts que no están en la base:** las tablas de `sql/01_fase1_zonas_reglas.sql` (`zone_groups`, `zone_lane_rates`,
  `pricing_rules`, `fx_rates`) y de `sql/03_fase3_plantillas.sql` (`pricing_templates`) **no existen** en `tms_olo`.
  O no se aplicaron, o se borraron después.
- **`route_type_id` apunta a `zones`:** `orders.route_type_id` y `routes.route_type_id` son FK a `zones`, porque
  `route_types` se renombró a `zones` en `sql/09` y la columna conservó el nombre viejo.
- **Comentario desactualizado:** `drivers.license_type_id` dice "FK a license_types", pero la tabla ahora es
  `driver_license_types` (renombrada en `sql/06`). La FK real apunta bien.
- **Tablas vacías (0 filas):** `contacts`, `contracts`, `contract_documents`, `driver_licenses`, `rates`, `returns`,
  `role_countries`, `rutas_costeo`, `settlements`, `sku_cotizaciones`, `tracking_events`.
- **Todavía no existe nada del OMS:** ni la base `logistica_olo` con esquemas `OMS`/`TMS` (decidido el 2026-09-15) ni
  las tablas propias del OMS (`route_dispatch_schedule`, `order_priority_*`, simulaciones). Todo esto es `tms_olo`.
- **Casi sin `COMMENT ON`:** solo 3 tablas y 6 columnas tienen comentario en la base; las descripciones de este
  documento se escribieron a partir de los nombres, las columnas y los scripts `sql/`.
- **Permisos de `tms_app`:** no puede leer `public.schema_migrations` ni `audit.tracked_tables`, por eso no se cuentan
  sus filas. Es coherente con `sql/18` (la app no necesita esas tablas).
"""

KIND = {"r": "tabla", "p": "tabla particionada", "v": "vista", "m": "vista materializada", "f": "tabla foránea"}
SCHEMAS = ("n.nspname not in ('pg_catalog','information_schema','pg_toast') "
           "and n.nspname not like 'pg_temp%%' and n.nspname not like 'pg_toast_temp%%'")


def leer_env():
    env = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        m = re.match(r"\s*(TMS_DB_\w+)\s*=\s*(.*)", line)
        if m:
            env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env


def extraer():
    env = leer_env()
    conn = psycopg2.connect(host="127.0.0.1", port=int(env.get("TMS_DB_PORT", 15432)), dbname=env["TMS_DB_NAME"],
                            user=env["TMS_DB_USER"], password=env["TMS_DB_PASSWORD"], connect_timeout=15)
    conn.set_session(readonly=True, autocommit=True)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    def q(sql):
        cur.execute(sql)
        return [dict(r) for r in cur.fetchall()]

    d = {"server": q("select version() as version, current_database() as db")[0]}
    d["relations"] = q(f"""
        select n.nspname as schema, c.relname as name, c.relkind as kind, c.relispartition as is_partition,
               obj_description(c.oid,'pg_class') as comment, pg_get_partkeydef(c.oid) as partkey
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where c.relkind in ('r','p','v','m','f') and {SCHEMAS} order by 1,2""")
    d["columns"] = q(f"""
        select n.nspname as schema, c.relname as table, a.attname as name,
               format_type(a.atttypid,a.atttypmod) as type, a.attnotnull as not_null,
               pg_get_expr(ad.adbin,ad.adrelid) as default, col_description(c.oid,a.attnum) as comment
        from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
        left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
        where a.attnum>0 and not a.attisdropped and c.relkind in ('r','p','v','m','f') and not c.relispartition
          and {SCHEMAS} order by 1,2,a.attnum""")
    d["constraints"] = q(f"""
        select n.nspname as schema, c.relname as table, k.conname as name, k.contype as type,
               pg_get_constraintdef(k.oid) as definition,
               (select array_agg(a.attname order by x.ord) from unnest(k.conkey) with ordinality x(att,ord)
                  join pg_attribute a on a.attrelid=k.conrelid and a.attnum=x.att) as cols,
               fn.nspname as ref_schema, fc.relname as ref_table
        from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
        left join pg_class fc on fc.oid=k.confrelid left join pg_namespace fn on fn.oid=fc.relnamespace
        where not c.relispartition and {SCHEMAS} order by 1,2,3""")
    d["indexes"] = q(f"""
        select n.nspname as schema, c.relname as table, i.relname as name, pg_get_indexdef(ix.indexrelid) as definition,
               exists(select 1 from pg_constraint k where k.conindid=ix.indexrelid) as backs_constraint
        from pg_index ix join pg_class c on c.oid=ix.indrelid join pg_class i on i.oid=ix.indexrelid
        join pg_namespace n on n.oid=c.relnamespace where not c.relispartition and {SCHEMAS} order by 1,2,3""")
    d["triggers"] = q(f"""
        select n.nspname as schema, c.relname as table, t.tgname as name, pg_get_triggerdef(t.oid) as definition
        from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
        where not t.tgisinternal and not c.relispartition and {SCHEMAS} order by 1,2,3""")
    d["views"] = q(f"""select n.nspname as schema, c.relname as name, pg_get_viewdef(c.oid,true) as definition
        from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('v','m') and {SCHEMAS}""")
    d["enums"] = q("""select n.nspname as schema, t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
        from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace group by 1,2 order by 1,2""")
    d["functions"] = q(f"""select n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
               pg_get_function_result(p.oid) as result
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where {SCHEMAS} and p.prokind in ('f','p')
          and not exists (select 1 from pg_depend dp where dp.objid=p.oid and dp.deptype='e') order by 1,2""")

    d["counts"] = {}
    for r in d["relations"]:
        if r["kind"] in ("r", "p") and not r["is_partition"]:
            fq = f'{r["schema"]}.{r["name"]}'
            try:
                cur.execute(f'select count(*) from "{r["schema"]}"."{r["name"]}"')
                d["counts"][fq] = cur.fetchone()["count"]
            except psycopg2.Error:
                d["counts"][fq] = None
    conn.close()
    return d


def md(text):
    return str(text).replace("|", "\\|").replace("\n", " ")


def mermaid_id(fq):
    return fq.split(".")[1] if fq.startswith("public.") else fq.replace(".", "_")


def render(d):
    rel = {f'{r["schema"]}.{r["name"]}': r for r in d["relations"]}
    cols, cons, idx, trg = {}, {}, {}, {}
    for c in d["columns"]:
        cols.setdefault(f'{c["schema"]}.{c["table"]}', []).append(c)
    for k in d["constraints"]:
        cons.setdefault(f'{k["schema"]}.{k["table"]}', []).append(k)
    for i in d["indexes"]:
        idx.setdefault(f'{i["schema"]}.{i["table"]}', []).append(i)
    for t in d["triggers"]:
        trg.setdefault(f'{t["schema"]}.{t["table"]}', []).append(t)
    views = {f'{v["schema"]}.{v["name"]}': v["definition"] for v in d["views"]}
    partitions = sorted(n for n, r in rel.items() if r["is_partition"])

    documentadas = {fq for _, tablas in DOMINIOS for fq in tablas}
    sin_dominio = sorted(n for n, r in rel.items() if not r["is_partition"] and n not in documentadas)
    dominios = DOMINIOS + ([("Sin clasificar (nuevas desde la última revisión)", {n: "" for n in sin_dominio})]
                           if sin_dominio else [])

    hoy = datetime.date.today().isoformat()
    n_tablas = sum(1 for r in rel.values() if r["kind"] in ("r", "p") and not r["is_partition"])
    n_vistas = sum(1 for r in rel.values() if r["kind"] in ("v", "m"))
    out = [
        "# Diccionario de datos — `tms_olo` (Aurora PostgreSQL)",
        "",
        f"> **Generado el {hoy}** desde la base real con [`scripts/diccionario-datos.py`](../../scripts/diccionario-datos.py). "
        "No editar a mano: las estructuras (columnas, tipos, llaves, índices, triggers) salen del catálogo de PostgreSQL; "
        "las descripciones de tabla viven en el script. Para regenerar: abrir el túnel "
        "(`scripts/tunel-aurora.ps1`) y correr `python scripts/diccionario-datos.py`.",
        "",
        f"- **Servidor:** {d['server']['version'].split(',')[0]} — cluster `db-tms-olo` (us-east-2), base `{d['server']['db']}`. "
        "Conexión y túnel: [`aws-inventario-tms.md`](aws-inventario-tms.md), [`../guides/tunel-ssm-a-rds.md`](../guides/tunel-ssm-a-rds.md).",
        f"- **Contenido:** {n_tablas} tablas y {n_vistas} vistas en los esquemas `public` (negocio) y `audit` (bitácora).",
        f"- **Filas:** conteo exacto (`count(*)`) al {hoy}. \"—\" = el rol de la app (`tms_app`) no tiene permiso de lectura.",
        "- Casi todas las tablas llevan `organization_id → organizations`; esa relación se omite en los diagramas para que se lean.",
        "",
        "## Índice",
        "",
    ]
    for nombre, tablas in dominios:
        out.append(f"**{nombre}:** " + ", ".join(f"[`{fq.split('.')[1] if fq.startswith('public.') else fq}`](#{fq.replace('.', '')})"
                                                 for fq in tablas if fq in rel))
        out.append("")
    out += [OBSERVACIONES]

    for nombre, tablas in dominios:
        out += ["---", "", f"## {nombre}", ""]
        edges = []
        for fq in tablas:
            for k in cons.get(fq, []):
                if k["type"] == "f" and k["ref_table"] != "organizations":
                    edges.append(f'    {mermaid_id(k["ref_schema"] + "." + k["ref_table"])} ||--o{{ {mermaid_id(fq)} : "{", ".join(k["cols"])}"')
        if edges:
            out += ["```mermaid", "erDiagram"] + sorted(set(edges)) + ["```", ""]

        for fq, desc in tablas.items():
            r = rel.get(fq)
            if not r:
                continue
            out += [f'<a id="{fq.replace(".", "")}"></a>', "", f"### `{fq}`", ""]
            filas = d["counts"].get(fq)
            meta = [KIND[r["kind"]]]
            if r["kind"] in ("r", "p"):
                meta.append(f"{filas:,} filas".replace(",", ".") if filas is not None else "filas: —")
            out.append(f"*{' · '.join(meta)}*" + (f" — {desc}" if desc else ""))
            if r["comment"]:
                out += ["", f"> Comentario en la base: {r['comment']}"]
            if r["partkey"]:
                out += ["", f"Particionada por `{r['partkey']}`. Particiones: " +
                        ", ".join(f"`{p.split('.')[1]}`" for p in partitions if p.startswith(fq + "_")) + "."]
            out.append("")

            pk = {c for k in cons.get(fq, []) if k["type"] == "p" for c in k["cols"]}
            fks = {}
            for k in cons.get(fq, []):
                if k["type"] == "f" and len(k["cols"]) == 1:
                    ref = k["ref_table"] if k["ref_schema"] == "public" else f'{k["ref_schema"]}.{k["ref_table"]}'
                    fks[k["cols"][0]] = ref
            uniq1 = {k["cols"][0] for k in cons.get(fq, []) if k["type"] == "u" and len(k["cols"]) == 1}
            out += ["| Columna | Tipo | Nulo | Default | Notas |", "|---|---|---|---|---|"]
            for c in cols.get(fq, []):
                notas = []
                if c["name"] in pk:
                    notas.append("**PK**")
                if c["name"] in fks:
                    ref = fks[c["name"]]
                    notas.append(f"FK → [`{ref}`](#{('public' + ref) if '.' not in ref else ref.replace('.', '')})")
                if c["name"] in uniq1:
                    notas.append("único")
                if c["comment"]:
                    notas.append(md(c["comment"]))
                default = f"`{md(c['default'])}`" if c["default"] else ""
                out.append(f"| `{c['name']}` | `{md(c['type'])}` | {'no' if c['not_null'] else 'sí'} | {default} | {' · '.join(notas)} |")
            out.append("")

            extra = []
            for k in cons.get(fq, []):
                if k["type"] == "u" and len(k["cols"]) > 1:
                    extra.append(f"- Único: `{md(k['definition'])}`")
                elif k["type"] == "c":
                    extra.append(f"- Check `{k['name']}`: `{md(k['definition'])}`")
                elif k["type"] == "f" and len(k["cols"]) > 1:
                    extra.append(f"- FK compuesta: `{md(k['definition'])}`")
            for i in idx.get(fq, []):
                if not i["backs_constraint"]:
                    extra.append(f"- Índice: `{md(i['definition'].split(' USING ', 1)[-1])}`" +
                                 (" (único)" if "UNIQUE" in i["definition"] else "") + f" — `{i['name']}`")
            funcs = {t["definition"].rsplit("EXECUTE FUNCTION ", 1)[-1] for t in trg.get(fq, [])}
            if any("set_updated_at" in f for f in funcs):
                extra.append("- Trigger: `updated_at` se actualiza solo (`set_updated_at()`).")
            if any("capture_row_change" in f for f in funcs):
                extra.append("- Trigger: auditada — cada INSERT/UPDATE/DELETE queda en `audit.events`.")
            if any("forbid_change" in f for f in funcs):
                extra.append("- Trigger: inmutable — UPDATE y DELETE están prohibidos (`audit.forbid_change()`).")
            otros = [t for t in trg.get(fq, []) if not re.search(r"set_updated_at|capture_row_change|forbid_change", t["definition"])]
            extra += [f"- Trigger `{t['name']}`: `{md(t['definition'])}`" for t in otros]
            if extra:
                out += extra + [""]
            if fq in views:
                out += ["<details><summary>Definición de la vista</summary>", "", "```sql", views[fq].strip(), "```", "", "</details>", ""]

    out += ["---", "", "## Tipos y funciones", "", "**Enums:**", ""]
    out += [f"- `{e['schema']}.{e['name']}`: " + ", ".join(f"`{x}`" for x in e["labels"]) for e in d["enums"]]
    out += ["", "**Funciones propias:**", ""]
    out += [f"- `{f['schema']}.{f['name']}({f['args']})` → `{f['result']}`" for f in d["functions"]]
    out.append("")
    return "\n".join(out)


if __name__ == "__main__":
    OUT.write_text(render(extraer()), encoding="utf-8")
    print(f"Escrito {OUT.relative_to(ROOT)}")
