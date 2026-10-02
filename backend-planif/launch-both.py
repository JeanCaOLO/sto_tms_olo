"""Arranca LOS DOS backends locales a la vez (lo que corre `pnpm api:local`):

  - backend-planif (el nuestro, Planificacion hexagonal)  -> :4000  (de cara al front)
  - backend/local/serve.py (el original del monorepo)     -> :4001  (tambien arriba)

El front (proxy de Vite /api -> :4000) usa el nuestro, que ya incluye TODOS los
modulos + la planificacion mejorada. El original queda levantado en :4001 por si
se quiere comparar/usar. Si uno de los dos muere, se bajan ambos.

No toca `backend/` ni `vite.config`. Requiere el tunel a Aurora (localhost:15432)
y las creds en `.env.local` de la raiz.
"""
import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
PY = sys.executable

TARGETS = [
    ("backend-planif  (:4000)", HERE / "serve.py", {"PLANIF_PORT": "4000"}),
    ("backend original (:4001)", REPO / "backend" / "local" / "serve.py", {"EFLOW_API_PORT": "4001"}),
]


def main():
    procs = []
    for name, script, extra in TARGETS:
        print(f"[api:local] arrancando {name} ...", flush=True)
        env = dict(os.environ, **extra)
        procs.append((name, subprocess.Popen([PY, "-u", str(script)], env=env, cwd=str(REPO))))
    try:
        while True:
            time.sleep(1)
            for name, p in procs:
                if p.poll() is not None:
                    print(f"[api:local] '{name}' termino (code {p.returncode}) -> bajando ambos", flush=True)
                    raise KeyboardInterrupt
    except KeyboardInterrupt:
        for _, p in procs:
            if p.poll() is None:
                p.terminate()
        for _, p in procs:
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()


if __name__ == "__main__":
    main()
