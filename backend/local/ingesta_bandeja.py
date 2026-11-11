"""Cron local de la bandeja: corre la misma ingesta que el Scheduler de AWS cada 10 min.

En el sandbox el secreto de eFlow está vacío (la cuenta no es de Intelix), así que la
ingesta real se corre desde esta PC con las credenciales EFLOW_CR_* de .env.local.
Cada corrida deja su fila en el historial del Panel del OMS (tbl_oms_logs).

    python backend/local/ingesta_bandeja.py            # cada 10 min hasta Ctrl+C
    python backend/local/ingesta_bandeja.py --una-vez

Requiere el túnel a Aurora (scripts/tunel-aurora.ps1).
"""

import sys
import time
from datetime import datetime

import serve

INTERVALO_S = 600


def main() -> None:
    serve.load_env_files()
    sys.path.insert(0, str(serve.BACKEND / "common-services" / "layers" / "tms_common"))
    sys.path.insert(0, str(serve.STACKS["planning"]))
    import replan  # noqa: E402 - necesita el sys.path de arriba

    while True:
        try:
            print(f"{datetime.now():%H:%M} bandeja: {replan.ingestar_programado()}", flush=True)
        except Exception as exc:  # noqa: BLE001 - el error ya quedó en el historial; seguimos
            print(f"{datetime.now():%H:%M} bandeja FALLÓ: {exc}", flush=True)
        if "--una-vez" in sys.argv:
            return
        time.sleep(INTERVALO_S)


if __name__ == "__main__":
    main()
