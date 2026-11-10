"""Publica el build del frontend (`out/`) en una rama de Amplify Hosting (deploy manual por zip).

Lo usa el job `deploy-dev` de `.gitlab-ci.yml`. Todo por variables de entorno:

    AMPLIFY_APP_ID   app de Amplify (p. ej. d200vkxzilg7v5, cuenta AWS de Intelix)
    AMPLIFY_BRANCH   rama de la app (p. ej. dev)
    AWS_DEFAULT_REGION, credenciales AWS: las del runner / variables CI/CD

El build (`npm run build`) corre antes, en el job, con las VITE_* del ambiente.
Requiere: python3 >= 3.9 y aws (CLI v2) en el PATH.
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

OUT = Path(__file__).resolve().parents[2] / "out"
POLL_SECONDS, MAX_POLLS = 5, 120


def aws(*args: str) -> str:
    result = subprocess.run(["aws", *args, "--output", "json"], capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"aws {' '.join(args[:2])} falló: {result.stderr.strip()}")
    return result.stdout


def zip_out() -> Path:
    if not (OUT / "index.html").is_file():
        sys.exit(f"No hay build en {OUT} (falta index.html): corré npm run build antes.")
    path = Path(tempfile.gettempdir()) / "tms-frontend-out.zip"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        for file in OUT.rglob("*"):
            if file.is_file():
                archive.write(file, file.relative_to(OUT).as_posix())  # rutas con "/" (Amplify da 404 con "\")
    return path


def upload(url: str, path: Path) -> None:
    request = urllib.request.Request(url, data=path.read_bytes(), method="PUT",
                                     headers={"Content-Type": "application/zip"})
    with urllib.request.urlopen(request, timeout=300) as response:
        if response.status >= 300:
            sys.exit(f"Subida del zip falló: HTTP {response.status}")


def main() -> None:
    app, branch = os.environ.get("AMPLIFY_APP_ID"), os.environ.get("AMPLIFY_BRANCH")
    if not app or not branch:
        sys.exit("Faltan AMPLIFY_APP_ID / AMPLIFY_BRANCH.")
    path = zip_out()
    deployment = json.loads(aws("amplify", "create-deployment", "--app-id", app, "--branch-name", branch))
    upload(deployment["zipUploadUrl"], path)
    job = deployment["jobId"]
    aws("amplify", "start-deployment", "--app-id", app, "--branch-name", branch, "--job-id", job)
    status = "PENDING"
    for _ in range(MAX_POLLS):
        time.sleep(POLL_SECONDS)
        status = json.loads(aws("amplify", "get-job", "--app-id", app, "--branch-name", branch,
                                "--job-id", job))["job"]["summary"]["status"]
        if status in ("SUCCEED", "FAILED", "CANCELLED"):
            break
    if status != "SUCCEED":
        sys.exit(f"Deploy de Amplify terminó en {status} (app {app}, rama {branch}, job {job}).")
    print(f"Publicado: https://{branch}.{app}.amplifyapp.com (job {job})")


if __name__ == "__main__":
    main()
