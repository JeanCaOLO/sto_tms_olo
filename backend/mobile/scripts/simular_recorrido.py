"""Simula a un chofer recorriendo su viaje en tránsito: login de mobile → mi-viaje → lotes a POST /posiciones.

Sirve para las pruebas B1–B8 sin teléfono: puntos cada 30 s desde la sede hacia cada parada, enviados en lotes como la
app (cada `--lote` puntos), con un reenvío del mismo lote para probar la idempotencia (B5).

ESCRIBE en la BD compartida (tracking_positions, tracking_last_positions, routes.departed_at) a través del API local.
Por defecto es dry-run: solo muestra lo que enviaría.

  PowerShell:  $env:DEMO_DRIVER_PASSWORD = "<clave>"
               python scripts/simular_recorrido.py chofer.drv-demo-vn-1@demo.tms.local            (dry-run)
               python scripts/simular_recorrido.py chofer.drv-demo-vn-1@demo.tms.local --enviar
  Opciones: --api http://localhost:4100  --lote 5  --puntos 20  --tiempo-real (espera 30 s entre puntos)
"""

import argparse
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

PREFIX = "/api/mobile/v1"
STEP_SECONDS = 30


def call(api: str, method: str, path: str, body=None, token: str | None = None) -> tuple[int, dict]:
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(api + PREFIX + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read() or b"{}")


def interpolate(a: tuple[float, float], b: tuple[float, float], parts: int) -> list[tuple[float, float]]:
    return [(a[0] + (b[0] - a[0]) * i / parts, a[1] + (b[1] - a[1]) * i / parts) for i in range(1, parts + 1)]


def track(trip: dict, total: int) -> list[tuple[float, float]]:
    """Recorrido en línea recta por las paradas con coordenadas, repartiendo `total` puntos."""
    stops = [(s["lat"], s["lng"]) for s in sorted(trip["stops"], key=lambda s: s["sequence"])
             if s.get("lat") is not None and s.get("lng") is not None]
    if not stops:
        return []
    start = trip.get("position") and (trip["position"]["lat"], trip["position"]["lng"]) or stops[0]
    legs = list(zip([start] + stops[:-1], stops))
    per_leg = max(1, math.ceil(total / len(legs)))
    points = [p for a, b in legs for p in interpolate(a, b, per_leg)]
    return points[:total]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("email")
    parser.add_argument("--api", default=os.environ.get("MOBILE_API", "http://localhost:4100"))
    parser.add_argument("--lote", type=int, default=5)
    parser.add_argument("--puntos", type=int, default=20)
    parser.add_argument("--enviar", action="store_true")
    parser.add_argument("--tiempo-real", action="store_true")
    args = parser.parse_args()
    password = os.environ.get("DEMO_DRIVER_PASSWORD", "")
    if not password:
        print("Define DEMO_DRIVER_PASSWORD en esta terminal.")
        return 1

    status, body = call(args.api, "POST", "/auth/login", {"email": args.email, "password": password})
    if status != 200:
        print("login:", status, body.get("error"))
        return 1
    token = body["data"]["access_token"]
    _, body = call(args.api, "GET", "/mi-viaje", token=token)
    trip = next((t for t in body["data"]["items"] if t["kind"] == "route"), None)
    if not trip:
        print("El chofer no tiene viaje en tránsito. Inícialo desde la app (o la web) y vuelve a correr.")
        return 1
    points = track(trip, args.puntos)
    if not points:
        print("Las paradas del viaje no tienen coordenadas.")
        return 1

    # Horas hacia atrás desde ahora (salvo tiempo real): el último punto queda "en línea" para la web.
    now = datetime.now(timezone.utc)
    start = now if args.tiempo_real else now - timedelta(seconds=STEP_SECONDS * (len(points) - 1))
    positions = [{"client_id": str(uuid.uuid4()), "route_id": trip["route_id"], "lat": round(lat, 6),
                  "lng": round(lng, 6), "accuracy_m": 8, "speed_mps": 9.5, "heading_deg": None, "battery_pct": 80,
                  "is_mock": False, "recorded_at": (start + timedelta(seconds=STEP_SECONDS * i)).isoformat()}
                 for i, (lat, lng) in enumerate(points)]
    batches = [positions[i:i + args.lote] for i in range(0, len(positions), args.lote)]
    print(f"Viaje {trip.get('route_number') or trip['route_id']}: {len(positions)} puntos en {len(batches)} lotes.")
    if not args.enviar:
        print("DRY-RUN: no se envió nada. Primer punto:", positions[0], "\nUsa --enviar para mandarlos.")
        return 0

    sent_ids = []
    for n, batch in enumerate(batches, 1):
        if args.tiempo_real:
            time.sleep(STEP_SECONDS * len(batch))
        status, body = call(args.api, "POST", "/posiciones", {"positions": batch, "device_id": "simulador"}, token)
        print(f"lote {n}: HTTP {status} {body.get('data') or body.get('error')}")
        sent_ids += [p["client_id"] for p in batch]
    # B5: reenviar el último lote no debe duplicar filas.
    status, body = call(args.api, "POST", "/posiciones", {"positions": batches[-1], "device_id": "simulador"}, token)
    print(f"reenvío del último lote (B5): HTTP {status} {body.get('data')}")
    _, body = call(args.api, "GET", "/mi-viaje", token=token)
    after = next((t for t in body["data"]["items"] if t.get("route_id") == trip["route_id"]), None)
    print("última posición según mi-viaje:", after and after.get("position"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
