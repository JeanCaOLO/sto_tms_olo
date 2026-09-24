"""Despliega el frontend del TMS en el SANDBOX de AWS (Amplify Hosting, us-east-2).

Usa la URL del API del stack dev-tms-common-services (desplegado con
scripts/sandbox/deploy_backend.py), buildea con Vite y sube el zip a la app de
Amplify `dev-tms-frontend`, rama `sandbox` (la crea si no existe, con la regla
de SPA para que las rutas del router devuelvan index.html).

    python scripts/sandbox/deploy_frontend.py
"""

import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from deploy_backend import REGION, aws, api_url, step  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "out"
APP_NAME = "dev-tms-frontend"
BRANCH = "sandbox"
# Toda ruta sin extensión de archivo va a index.html (router del SPA).
SPA_RULE = {"source": "</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>",
            "target": "/index.html", "status": "200"}
POLL_SECONDS, MAX_POLLS = 5, 60


def ensure_app() -> str:
    apps = json.loads(aws("amplify", "list-apps", "--output", "json").stdout)["apps"]
    app = next((a for a in apps if a["name"] == APP_NAME), None)
    if app is None:
        app = json.loads(aws("amplify", "create-app", "--name", APP_NAME, "--platform", "WEB",
                             "--custom-rules", json.dumps([SPA_RULE]), "--tags", "Project=TMS,Environment=DEV",
                             "--output", "json").stdout)["app"]
        print(f"    app de Amplify {APP_NAME} creada ({app['appId']})")
    app_id = app["appId"]
    if aws("amplify", "get-branch", "--app-id", app_id, "--branch-name", BRANCH, check=False).returncode != 0:
        aws("amplify", "create-branch", "--app-id", app_id, "--branch-name", BRANCH, "--stage", "DEVELOPMENT")
        print(f"    rama {BRANCH} creada")
    return app_id


def build(api_base: str) -> None:
    step(f"Build (VITE_API_BASE={api_base})")
    env = {**os.environ, "VITE_API_BASE": api_base, "VITE_MOCK_AUTH": "false"}
    subprocess.run("npm run build", cwd=ROOT, env=env, shell=True, check=True)


def zip_out() -> Path:
    path = Path(tempfile.gettempdir()) / "tms-sandbox-out.zip"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        for file in OUT.rglob("*"):
            if file.is_file():
                archive.write(file, file.relative_to(OUT).as_posix())  # rutas con "/" (Amplify da 404 con "\")
    return path


def upload(url: str, path: Path) -> None:
    request = urllib.request.Request(url, data=path.read_bytes(), method="PUT",
                                     headers={"Content-Type": "application/zip"})
    with urllib.request.urlopen(request, timeout=120) as response:
        if response.status >= 300:
            raise SystemExit(f"Subida del zip falló: HTTP {response.status}")


def deploy(app_id: str, path: Path) -> str:
    step("Amplify: subir y publicar")
    deployment = json.loads(aws("amplify", "create-deployment", "--app-id", app_id, "--branch-name", BRANCH,
                                "--output", "json").stdout)
    upload(deployment["zipUploadUrl"], path)
    job = deployment["jobId"]
    aws("amplify", "start-deployment", "--app-id", app_id, "--branch-name", BRANCH, "--job-id", job)
    for _ in range(MAX_POLLS):
        time.sleep(POLL_SECONDS)
        status = aws("amplify", "get-job", "--app-id", app_id, "--branch-name", BRANCH, "--job-id", job,
                     "--query", "job.summary.status", "--output", "text").stdout.strip()
        if status in ("SUCCEED", "FAILED", "CANCELLED"):
            break
    if status != "SUCCEED":
        raise SystemExit(f"Deploy de Amplify terminó en {status} (app {app_id}, job {job}).")
    return f"https://{BRANCH}.{app_id}.amplifyapp.com"


def main() -> None:
    base = api_url()
    if not base:
        raise SystemExit("No hay API desplegada: corré primero python scripts/sandbox/deploy_backend.py")
    step("Amplify: app y rama")
    app_id = ensure_app()
    build(base)
    url = deploy(app_id, zip_out())
    print(f"\nFrontend del sandbox listo: {url}  (región {REGION})")


if __name__ == "__main__":
    main()
