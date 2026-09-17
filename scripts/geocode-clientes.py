#!/usr/bin/env python
"""Geocodifica las direcciones de clientes de EFLOW que NO tienen coordenadas y
guarda el resultado en `src/pages/planificacion/geocode.json` (capa de coords que
lee el frontend). Read-only sobre EFLOW.

  python scripts/geocode-clientes.py                 # CR y VE, ventana por defecto
  python scripts/geocode-clientes.py --limit 500     # tope por país

Requisitos: sesión AWS activa (lee el secret `tms/eflow`), red a EFLOW (VPN) y al
Nominatim self-hosted. La dirección de EFLOW viene estructurada (CR: Prov/Cton/
Dist; VE: Estado/Ciudad); se geocodifica a nivel administrativo (distrito/ciudad),
así que la precisión es "admin" (centroide), no puerta — el front la marca aprox.
"""
import json, os, re, subprocess, sys, time, urllib.parse, urllib.request
import pytds

NOMINATIM = os.environ.get('NOMINATIM_URL', 'https://nominatim.jesusaraujo.lat').rstrip('/')
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'pages', 'planificacion', 'geocode.json')
LIMIT = int(sys.argv[sys.argv.index('--limit') + 1]) if '--limit' in sys.argv else 1500
WINDOW = 6000  # nº de viajes recientes de los que se sacan los clientes activos

LABELS = r'Prov|Cton|Cant\w*|Dist\w*|Det\w*|DETALLE|Barrio|Otras|Pais|Estado|Ciudad|Direcc\w*'
def grab(t, lab):
    m = re.search(rf'(?:{lab})\s*[.:]+\s*([^\r\n,]+?)(?=\s*(?:{LABELS})\s*[.:]|[\r\n,]|$)', t, re.I)
    return m.group(1).strip(' .:,') if m else ''

def build_query(dirlarga, pais, paisnom):
    t = (dirlarga or '').replace('\r', ' ').replace('\n', ' ')
    if pais == 'cr':
        parts = [grab(t, r'Dist\w*'), grab(t, r'Cton|Cant\w*'), grab(t, r'Prov')]
    else:
        parts = [grab(t, r'Ciudad'), grab(t, r'Estado')]
        if not any(parts):
            toks = [x.strip() for x in t.split(',') if x.strip()]
            if toks and toks[0].upper().startswith('VENEZUELA') and len(toks) >= 3:
                parts = [toks[2], toks[1]]
    parts = [p for p in parts if p and len(p) > 1]
    return (', '.join(parts) + f', {paisnom}') if parts else None

def geocode(q, cc):
    url = f"{NOMINATIM}/search?" + urllib.parse.urlencode({'q': q, 'format': 'json', 'limit': 1, 'countrycodes': cc})
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            js = json.load(r)
        if js:
            return float(js[0]['lat']), float(js[0]['lon'])
    except Exception as e:
        print(f'  geocode err: {str(e)[:60]}')
    return None

def secret():
    raw = subprocess.check_output(['aws', 'secretsmanager', 'get-secret-value', '--secret-id', 'tms/eflow',
                                   '--region', 'us-east-1', '--query', 'SecretString', '--output', 'text'], text=True)
    return json.loads(raw)

def clientes_sin_coords(d, pais):
    P = pais.upper()
    cfg = dict(server=d[f'EFLOW_{P}_HOST'], port=int(d[f'EFLOW_{P}_PORT']),
               user=d[f'EFLOW_{P}_USER'], password=d[f'EFLOW_{P}_PASSWORD'])
    WMH, SAP = d[f'EFLOW_{P}_DB_WMH'], d[f'EFLOW_{P}_DB_SAP']
    conn = pytds.connect(database=SAP, as_dict=True, autocommit=True, login_timeout=15, timeout=120, **cfg)
    cur = conn.cursor()
    # Clientes activos (en viajes recientes) sin coordenadas, con dirección.
    cur.execute(f"""
      WITH v AS (SELECT TOP {WINDOW} journey_id FROM {WMH}.dbo.journeys ORDER BY journey_id DESC),
      act AS (SELECT DISTINCT e.IDCLIENTE
              FROM {WMH}.dbo.journey_orders jo
              JOIN {SAP}.dbo.EXPEDICIONESCABECERA e
                ON e.IDEXPEDICION=jo.order_number AND e.IDCOMPANIA=jo.company_id AND e.IDSUCURSAL=jo.branch_id
              WHERE jo.journey_id IN (SELECT journey_id FROM v))
      SELECT DISTINCT TOP {LIMIT} c.IDCLIENTE, c.DIRECCIONLARGA
      FROM {SAP}.dbo.CLIENTES c
      JOIN act ON act.IDCLIENTE=c.IDCLIENTE
      WHERE LTRIM(RTRIM(ISNULL(c.DIRECCIONLARGA,'')))<>'' AND (c.LATITUD IS NULL OR c.LATITUD IN ('','0','0.0'))""")
    rows = cur.fetchall(); conn.close()
    return rows

def main():
    d = secret()
    out = {}
    if os.path.exists(OUT):
        out = json.load(open(OUT, encoding='utf-8'))  # incremental: no re-geocodifica lo ya hecho
    def save():
        json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    for pais, paisnom, cc in [('cr', 'Costa Rica', 'cr'), ('ve', 'Venezuela', 've')]:
        rows = clientes_sin_coords(d, pais)
        print(f'{pais}: {len(rows)} clientes sin coords a geocodificar', flush=True)
        hit = 0
        for r in rows:
            key = f"{pais}:{r['IDCLIENTE']}"
            if key in out:
                continue
            q = build_query(r['DIRECCIONLARGA'], pais, paisnom)
            if not q:
                continue
            coord = geocode(q, cc)
            if coord:
                out[key] = {'lat': coord[0], 'lng': coord[1], 'precision': 'admin', 'source': 'nominatim'}
                hit += 1
                if hit % 50 == 0:
                    save(); print(f'  {pais}: {hit} guardados...', flush=True)
        print(f'{pais}: {hit} geocodificados', flush=True)
        save()
    print(f'\nTotal en geocode.json: {len(out)} -> {os.path.relpath(OUT)}')

if __name__ == '__main__':
    main()
