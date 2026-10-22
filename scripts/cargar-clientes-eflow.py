"""Carga los clientes de EFLOW en Aurora (tms_olo): final_customers + addresses + delivery_points.

Paso 2 del plan docs/work/2026-10/2026-10-16-plan-modelo-pedidos-clientes-eflow.md. Requiere sql/40, sql/41 y sql/42.

Entrada: export CSV de EFLOW_OLO.dbo.CLIENTES (columnas IDCOMPANIA, IDCLIENTE, NOMBRELARGO, ...).
El CSV trae datos personales (contactos, teléfonos, emails): NO se versiona; se pasa por ruta.

Reglas (decididas el 2026-10-16):
  * Se cargan TODOS los clientes de las compañías conocidas (customers.source_system = 'EFLOW_OLO').
  * status: TPCLSI 'DISP' -> 'active'; cualquier otro (BLOQ) -> 'inactive'.
  * customer_type: tiendas de EPA (IDCLIENTE de 3 dígitos, 001..008) -> 'TIENDA'; el resto -> 'MAYOREO'.
  * Clientes que ya existen: se actualizan status y tipo/clase de EFLOW; el resto solo se COMPLETA si está vacío
    (no se pisa el nombre, el customer_type ni datos ya cargados).
  * Cliente sin punto de entrega: se le crea dirección + punto de entrega principal. Coordenadas solo si caen en
    Costa Rica; si no, la dirección queda PENDING para geocodificar. La zona la asigna el trigger de delivery_points.
  * Puntos de entrega existentes: solo se completa la dirección y las coordenadas que falten.

Uso (túnel abierto, credenciales de la app en .env):
    python scripts/cargar-clientes-eflow.py CLIENTES_202610161101.csv            # prueba: ROLLBACK
    python scripts/cargar-clientes-eflow.py CLIENTES_202610161101.csv --execute  # aplica
"""
import argparse
import csv
import pathlib
import re
import sys

import psycopg2
import psycopg2.extras

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE_SYSTEM = "EFLOW_OLO"
# Caja de Costa Rica: descarta coordenadas de otros países o en 0,0.
CR_LAT, CR_LON = (7.5, 11.5), (-86.5, -82.0)


def leer_env():
    env = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        m = re.match(r"\s*(TMS_DB_\w+)\s*=\s*(.*)", line)
        if m:
            env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env


def limpiar(valor):
    valor = re.sub(r"\s+", " ", valor or "").strip()
    return valor or None


def coordenadas(lat, lon):
    try:
        lat, lon = float(lat.replace(",", ".")), float(lon.replace(",", "."))
    except (AttributeError, ValueError):
        return None, None
    if CR_LAT[0] < lat < CR_LAT[1] and CR_LON[0] < lon < CR_LON[1]:
        return lat, lon
    return None, None


def filas_staging(ruta_csv, companias):
    filas, omitidas, fuera_cr = [], 0, 0
    with open(ruta_csv, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            compania = companias.get(r["IDCOMPANIA"].strip())
            if not compania:
                omitidas += 1
                continue
            customer_id, customer_code = compania
            codigo = r["IDCLIENTE"].strip()
            lat, lon = coordenadas(r.get("LATITUD"), r.get("LONGITUD"))
            if lat is None and (r.get("LATITUD") or "").strip() not in ("", "0"):
                fuera_cr += 1
            es_tienda = customer_code == "EPA" and re.fullmatch(r"[0-9]{3}", codigo)
            filas.append((
                customer_id, codigo, limpiar(r["NOMBRELARGO"]) or codigo, limpiar(r["NOMBRECORTO"]),
                limpiar(r["CONTACTO"]), limpiar(r["TELEFONO"]), limpiar(r["CELULAR"]), limpiar(r["EMAIL"]),
                limpiar(r["REFERENCIA_ERP"]), limpiar(r["TPCLIE"]), limpiar(r["TPCLSE"]),
                "active" if (r["TPCLSI"] or "").strip() == "DISP" else "inactive",
                "TIENDA" if es_tienda else "MAYOREO",
                limpiar(r["DIRECCIONLARGA"]) or limpiar(r["DIRECCIONCORTA"]), lat, lon,
            ))
    return filas, omitidas, fuera_cr


CARGA_SQL = """
-- 1. Clientes: insertar nuevos; en existentes, refrescar status/tipo EFLOW y completar vacíos.
with res as (
  insert into final_customers as fc (customer_id, external_code, name, short_name, contact, phone, mobile, email,
                                     erp_reference, wms_client_type, wms_client_class, status, customer_type)
  select customer_id, external_code, name, short_name, contact, phone, mobile, email,
         erp_reference, wms_client_type, wms_client_class, status, customer_type
  from stg_clientes
  on conflict (customer_id, external_code) do update set
    short_name       = coalesce(fc.short_name, excluded.short_name),
    contact          = coalesce(fc.contact, excluded.contact),
    phone            = coalesce(fc.phone, excluded.phone),
    mobile           = coalesce(fc.mobile, excluded.mobile),
    email            = coalesce(fc.email, excluded.email),
    erp_reference    = coalesce(fc.erp_reference, excluded.erp_reference),
    wms_client_type  = excluded.wms_client_type,
    wms_client_class = excluded.wms_client_class,
    status           = excluded.status,
    updated_at       = now()
  where (fc.short_name is null and excluded.short_name is not null)
     or (fc.contact is null and excluded.contact is not null)
     or (fc.phone is null and excluded.phone is not null)
     or (fc.mobile is null and excluded.mobile is not null)
     or (fc.email is null and excluded.email is not null)
     or (fc.erp_reference is null and excluded.erp_reference is not null)
     or fc.wms_client_type is distinct from excluded.wms_client_type
     or fc.wms_client_class is distinct from excluded.wms_client_class
     or fc.status is distinct from excluded.status
  returning (xmax = 0) as insertado
)
select count(*) filter (where insertado), count(*) filter (where not insertado) from res;
"""

PUNTOS_NUEVOS_SQL = """
-- 2. Clientes sin punto de entrega: dirección + punto principal.
create temp table stg_puntos on commit drop as
select gen_random_uuid() as address_id, fc.id as final_customer_id, c.country_id,
       s.external_code, fc.name, s.address, s.latitude, s.longitude, s.phone, s.status
from stg_clientes s
join final_customers fc on fc.customer_id = s.customer_id and fc.external_code = s.external_code
join customers c on c.id = fc.customer_id
where not exists (select 1 from delivery_points dp where dp.final_customer_id = fc.id);

insert into addresses (id, country_id, line1, latitude, longitude, geocoding_status, geocoding_provider, geocoded_at)
select address_id, country_id, address, latitude, longitude,
       case when latitude is not null then 'OK' else 'PENDING' end,
       case when latitude is not null then 'EFLOW' end,
       case when latitude is not null then now() end
from stg_puntos;

insert into delivery_points (final_customer_id, address_id, external_code, name, is_default, active, contact_phone)
select final_customer_id, address_id, external_code, name, true, status = 'active', phone
from stg_puntos;

select count(*), count(*) filter (where latitude is not null) from stg_puntos;
"""

COMPLETAR_DIRECCIONES_SQL = """
-- 3. Puntos existentes: completar solo lo que falte en su dirección. UN solo UPDATE por fila: dos CTE que
--    actualizan la misma fila en la misma sentencia aplican solo una de las dos (la otra se pierde).
with objetivo as (
  select a.id as address_id, s.address, s.latitude, s.longitude,
         a.line1 is null and s.address is not null as falta_linea,
         a.latitude is null and s.latitude is not null as faltan_coords
  from stg_clientes s
  join final_customers fc on fc.customer_id = s.customer_id and fc.external_code = s.external_code
  join delivery_points dp on dp.final_customer_id = fc.id and dp.is_default
  join addresses a on a.id = dp.address_id
  where not exists (select 1 from stg_puntos p where p.final_customer_id = fc.id)
), cambios as (
  update addresses a set
    line1              = case when o.falta_linea then o.address else a.line1 end,
    latitude           = case when o.faltan_coords then o.latitude else a.latitude end,
    longitude          = case when o.faltan_coords then o.longitude else a.longitude end,
    geocoding_status   = case when o.faltan_coords then 'OK' else a.geocoding_status end,
    geocoding_provider = case when o.faltan_coords then 'EFLOW' else a.geocoding_provider end,
    geocoded_at        = case when o.faltan_coords then now() else a.geocoded_at end,
    updated_at         = now()
  from objetivo o
  where a.id = o.address_id and (o.falta_linea or o.faltan_coords)
  returning o.falta_linea, o.faltan_coords
)
select count(*) filter (where falta_linea), count(*) filter (where faltan_coords) from cambios;
"""

RESUMEN_SQL = """
select c.code, fc.customer_type, fc.status, count(*)
from final_customers fc join customers c on c.id = fc.customer_id
where c.source_system = %s
group by 1, 2, 3 order by 1, 2, 3;
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", help="Export CSV de EFLOW_OLO.dbo.CLIENTES")
    ap.add_argument("--execute", action="store_true", help="Aplica los cambios (sin esto, ROLLBACK)")
    args = ap.parse_args()

    env = leer_env()
    conn = psycopg2.connect(host="127.0.0.1", port=int(env.get("TMS_DB_PORT", 15432)), dbname=env["TMS_DB_NAME"],
                            user=env["TMS_DB_USER"], password=env["TMS_DB_PASSWORD"], connect_timeout=15)
    cur = conn.cursor()
    try:
        cur.execute("set local statement_timeout = '15min'")
        cur.execute("select external_code, id, code from customers where source_system = %s and external_code is not null",
                    (SOURCE_SYSTEM,))
        companias = {ext: (cid, code) for ext, cid, code in cur.fetchall()}
        if not companias:
            sys.exit("No hay compañías con código EFLOW (¿se aplicó sql/40?).")

        filas, omitidas, fuera_cr = filas_staging(args.csv, companias)
        print(f"CSV: {len(filas)} clientes de {sorted(c for _, c in companias.values())}; "
              f"{omitidas} de compañías desconocidas omitidos; {fuera_cr} coordenadas fuera de CR descartadas.")

        cur.execute("""create temp table stg_clientes (
            customer_id uuid, external_code text, name text, short_name text, contact text, phone text, mobile text,
            email text, erp_reference text, wms_client_type text, wms_client_class text, status text, customer_type text,
            address text, latitude numeric, longitude numeric) on commit drop""")
        psycopg2.extras.execute_values(cur, "insert into stg_clientes values %s", filas, page_size=1000)

        cur.execute(CARGA_SQL)
        nuevos, actualizados = cur.fetchone()
        print(f"final_customers: {nuevos} nuevos, {actualizados} existentes actualizados.")

        cur.execute(PUNTOS_NUEVOS_SQL)
        puntos, con_coords = cur.fetchone()
        print(f"delivery_points + addresses nuevos: {puntos} ({con_coords} con coordenadas; el resto PENDING).")

        cur.execute(COMPLETAR_DIRECCIONES_SQL)
        lineas, coords = cur.fetchone()
        print(f"Direcciones existentes completadas: {lineas} con línea de dirección, {coords} con coordenadas.")

        cur.execute(RESUMEN_SQL, (SOURCE_SYSTEM,))
        print("Resumen (compañía, tipo, status, clientes):")
        for fila in cur.fetchall():
            print("  ", fila)

        if args.execute:
            conn.commit()
            print("APLICADO (COMMIT).")
        else:
            conn.rollback()
            print("PRUEBA: ROLLBACK, la base no cambió. Reintenta con --execute para aplicar.")
    except Exception:
        conn.rollback()
        print("ERROR: ROLLBACK aplicado, ningún cambio quedó en la base.", file=sys.stderr)
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
