"""Helper de DEMO: agrega PEDIDOS NUEVOS con DATA REAL de EFLOW (COFERSA CR,
read-only) a Aurora y dispara el WebSocket para que la UI avise en vivo.

Uso:
  python agregar_pedidos_reales.py [YYYY-MM-DD] [cuantos] [--no-trigger]
  (default: fecha 2026-10-09, 3 pedidos, con trigger)

Flujo de la demo:
  1) genera un plan para el dia en la UI (fija la linea base).
  2) corre este helper para ESE dia  -> inserta N pedidos reales que NO estaban.
  3) la UI recibe el push del WS (ws://localhost:4100) y prende el badge
     "Regenerar / N nuevos" al instante.

Creds en .env.local (gitignored): TMS_DB_* (Aurora) y EFLOW_CR_* (EFLOW CR).
EFLOW se toca SOLO LECTURA. Idempotente: excluye los order_number ya cargados.
"""
import os, sys, uuid, urllib.request
from pathlib import Path
import pytds
import pg8000.dbapi as pg

ORG = '11111111-1111-1111-1111-111111111111'
COFERSA = 'e59e4979-470e-4331-8ce6-ca8e6eff68bf'
WS_TRIGGER = 'http://localhost:4100/trigger'

fecha = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].count('-') == 2 else '2026-10-09'
cuantos = next((int(a) for a in sys.argv[1:] if a.isdigit()), 3)
trigger = '--no-trigger' not in sys.argv

# --- .env.local ---
env = {}
for line in Path(__file__).with_name('.env.local').read_text(encoding='utf-8').splitlines():
    s = line.strip()
    if s and not s.startswith('#') and '=' in s:
        k, _, v = s.partition('=')
        env[k.strip()] = v.strip().strip('"').strip("'")

dec = lambda b: b.decode('cp1252') if isinstance(b, (bytes, bytearray)) else b

# --- Aurora: order_number ya cargados + contexto ---
au = pg.connect(host=env['TMS_DB_HOST'], port=int(env['TMS_DB_PORT']), user=env['TMS_DB_USER'],
                password=env['TMS_DB_PASSWORD'], database=env['TMS_DB_NAME'], ssl_context=True)
ac = au.cursor()
ac.execute("SELECT order_number FROM orders")
existentes = {r[0] for r in ac.fetchall()}
ac.execute("SELECT store_id,count(*) c FROM orders GROUP BY store_id ORDER BY c DESC LIMIT 1")
store_id = str(ac.fetchone()[0])
ac.execute("SELECT code,name FROM zones")
zone_name = {code: name for code, name in ac.fetchall()}

# --- EFLOW read-only: candidatos del dia ---
ef = pytds.connect(server=env['EFLOW_CR_HOST'], port=int(env.get('EFLOW_CR_PORT', 1433)),
                   database='EFLOW_OLO', user=env['EFLOW_CR_USER'], password=env['EFLOW_CR_PASSWORD'],
                   login_timeout=8, timeout=90)
efc = ef.cursor()
efc.execute(f"""
SELECT TOP 400 cab.IDEXPEDICION, cab.RUTA, cab.PRIORIDAD, cab.PESOPEDIDO_TOTAL, cab.CUBICAJEPEDIDO_TOTAL,
  cab.FACTURA, cab.NUMEROVIAJEWMH, CONVERT(varchar(10),cab.FECHACREACION,120) dcrea,
  CONVERT(VARBINARY(400),cli.NOMBRELARGO) cliente, CONVERT(VARBINARY(1000),cli.DIRECCIONLARGA) direccion,
  cli.LATITUD, cli.LONGITUD
FROM EXPEDICIONESCABECERA cab JOIN CLIENTES cli ON cli.IDCOMPANIA=cab.IDCOMPANIA AND cli.IDCLIENTE=cab.IDCLIENTE
WHERE cab.IDCOMPANIA='0109' AND cab.TPEXPE='EXPERP' AND cab.PESOPEDIDO_TOTAL>0
  AND CONVERT(varchar(10),cab.FECHAEXPEDICIONPLANIFICADA,120)='{fecha}'
  AND cli.LATITUD IS NOT NULL AND cli.LATITUD<>'' AND cli.LONGITUD IS NOT NULL AND cli.LONGITUD<>''
ORDER BY cab.FECHACREACION DESC, cab.IDEXPEDICION
""")
cols = [d[0] for d in efc.description]
cand = [dict(zip(cols, r)) for r in efc.fetchall() if dict(zip(cols, r))['IDEXPEDICION'] not in existentes]
heads = cand[:cuantos]
if not heads:
    print(f"No hay pedidos nuevos para {fecha} (todos los disponibles ya estan cargados).")
    sys.exit(0)
ids = [h['IDEXPEDICION'] for h in heads]
ph = ','.join(['%s'] * len(ids))
efc.execute(f"""SELECT d.IDEXPEDICION,d.IDARTICULO,d.UNIDADESPEDIDAS,d.PESOPEDIDO,d.CUBICAJEPEDIDO,d.GUIAFISCAL,
  CONVERT(VARBINARY(400),a.DESCRIPCIONLARGA) nombre
  FROM EXPEDICIONESDETALLE d LEFT JOIN ARTICULOSGESTION a ON a.IDCOMPANIA=d.IDCOMPANIA AND a.IDARTICULO=d.IDARTICULO
  WHERE d.IDCOMPANIA='0109' AND d.IDEXPEDICION IN ({ph})""", tuple(ids))
det = {}
for r in efc.fetchall():
    det.setdefault(r[0], []).append(dict(zip(['art', 'u', 'peso', 'cub', 'guia', 'nombre'], r[1:])))
ef.close()

def city_of(d):
    for part in (d or '').replace('\r', '\n').split('\n'):
        if 'Cton' in part:
            return part.split('::')[-1].strip()[:60] or None
    return None

ins = 0
for h in heads:
    on = h['IDEXPEDICION']; oid = str(uuid.uuid4()); lines = det.get(on, [])
    ruta = (h['RUTA'] or '').strip(); dz = zone_name.get(ruta.zfill(2)) or zone_name.get(ruta)
    cli = dec(h['cliente']) or ''; direccion = dec(h['direccion']) or ''
    addr = (cli + ("\n" + direccion if direccion else "")).strip() or '(sin direccion)'
    notes = f"EFLOW real COFERSA · factura {h['FACTURA']} · ruta {ruta}"
    ac.execute("""INSERT INTO orders (id,organization_id,store_id,customer_id,order_number,invoice_number,
      order_date,delivery_date,total_weight,total_volume,total_items,delivery_address,delivery_city,
      delivery_latitude,delivery_longitude,delivery_zone,priority,status,notes,created_at,updated_at)
      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'assigned',%s,now(),now())""",
      (oid, ORG, store_id, COFERSA, on, (str(h['FACTURA']) if h['FACTURA'] else None), h['dcrea'], fecha,
       h['PESOPEDIDO_TOTAL'], h['CUBICAJEPEDIDO_TOTAL'], len(lines), addr, city_of(direccion),
       h['LATITUD'], h['LONGITUD'], dz, (str(h['PRIORIDAD']) if h['PRIORIDAD'] is not None else None), notes))
    for ln in lines:
        ac.execute("""INSERT INTO order_items (id,order_id,product_code,product_name,quantity,weight,volume,guia_fiscal,created_at)
          VALUES (%s,%s,%s,%s,%s,%s,%s,%s,now())""",
          (str(uuid.uuid4()), oid, (ln['art'] or '?'), (dec(ln['nombre']) or ('ART ' + str(ln['art']))).lstrip('*').strip()[:200],
           int(ln['u'] or 0), ln['peso'], ln['cub'], ln['guia']))
    ins += 1
    print(f"  + {on}  {cli[:34]:34}  ruta {ruta}  {h['PESOPEDIDO_TOTAL']}kg  viaje {trip}")
au.commit(); au.close()
print(f"\n✅ {ins} pedidos reales NUEVOS en Aurora para {fecha} (status=assigned).")

if trigger:
    try:
        r = urllib.request.urlopen(WS_TRIGGER, timeout=5).read().decode()
        print(f"📡 WS trigger -> {r}")
    except Exception as e:
        print(f"⚠ no pude disparar el WS ({e}). ¿Esta corriendo `pnpm ws:local`?")
