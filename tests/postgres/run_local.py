"""Ejecuta las pruebas PostgreSQL en Docker desechable, sin .env ni Aurora.

Desde la raíz del repositorio: python tests/postgres/run_local.py
Requiere Docker iniciado, pytest y pg8000. No conserva credenciales ni volúmenes.
"""
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
from datetime import datetime, timezone
from time import monotonic, sleep
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[2]


def docker(*args, env=None, timeout=30):
    result = subprocess.run(['docker', *args], cwd=ROOT, env=env, capture_output=True,
                            text=True, encoding='utf-8', errors='replace', timeout=timeout)
    if result.returncode:
        # No se imprime el comando ni el entorno: el arranque recibe una contraseña temporal.
        raise RuntimeError(f'Docker {args[0]} falló: {result.stderr.strip()}')
    return result.stdout.strip()


def main():
    started = datetime.now(timezone.utc)
    run_id = started.strftime('%Y%m%d-%H%M%S') + '-' + uuid4().hex[:8]
    evidence = ROOT / '.test/pendientes' / ('evidencia-postgres-' + run_id)
    evidence.mkdir(parents=True)
    container = 'tms-returns-test-' + run_id
    password = secrets.token_hex(24)
    created = False
    exit_code = 1
    report = {'started_at': started.isoformat(), 'container': container,
              'target': 'PostgreSQL local desechable; binding 127.0.0.1; sin volumen externo',
              'container_removed': False}
    try:
        report['docker_version'] = docker('info', '--format', '{{.ServerVersion}}')
        child_env = dict(os.environ, POSTGRES_PASSWORD=password)
        docker('run', '--rm', '-d', '--name', container, '-e', 'POSTGRES_PASSWORD',
               '-e', 'POSTGRES_DB=tms_returns_test_codex', '-p', '127.0.0.1::5432',
               'postgres:16', env=child_env, timeout=120)
        created = True
        deadline = monotonic() + 30
        while True:
            try:
                docker('exec', container, 'pg_isready', '-U', 'postgres',
                       '-d', 'tms_returns_test_codex', timeout=5)
                break
            except RuntimeError:
                if monotonic() >= deadline:
                    raise RuntimeError('PostgreSQL no estuvo listo dentro del plazo')
                sleep(.5)
        binding = docker('port', container, '5432/tcp')
        match = re.fullmatch(r'127\.0\.0\.1:(\d+)', binding)
        if not match:
            raise RuntimeError('No se verificó el binding exclusivo a loopback')
        report['postgresql'] = docker('exec', container, 'postgres', '--version')
        report['image_id'] = docker('inspect', '--format', '{{.Image}}', container)
        print(report['postgresql'], flush=True)
        child_env = dict(os.environ, TMS_RETURNS_TEST_DSN=(
            f'postgresql://postgres:{password}@127.0.0.1:{match[1]}/tms_returns_test_codex'))
        command = [sys.executable, '-m', 'pytest', '-p', 'no:cacheprovider', '--basetemp',
                   str(evidence / 'tmp'), 'tests/postgres', '-q', '-rs']
        result = subprocess.run(command, cwd=ROOT, env=child_env, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True, encoding='utf-8',
                                errors='replace', timeout=180)
        output = result.stdout.replace(password, '[contraseña temporal omitida]')
        (evidence / 'pytest.log').write_text(output, encoding='utf-8')
        print(output, end='', flush=True)
        exit_code = result.returncode
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        report['error'] = str(error).replace(password, '[contraseña temporal omitida]')
        report['timed_out'] = isinstance(error, subprocess.TimeoutExpired)
        if report['timed_out'] and error.stdout:
            output = error.stdout.decode('utf-8', errors='replace') if isinstance(error.stdout, bytes) else error.stdout
            (evidence / 'pytest.log').write_text(
                output.replace(password, '[contraseña temporal omitida]'), encoding='utf-8')
        print(report['error'], file=sys.stderr)
    finally:
        if created:
            try:
                docker('stop', container)
                # --rm retira también el almacenamiento del contenedor creado por esta ejecución.
                remaining = docker('ps', '-a', '--filter', f'name=^/{container}$', '--format', '{{.ID}}')
                if remaining:
                    raise RuntimeError(f'El contenedor de prueba {container} sigue presente')
                report['container_removed'] = True
            except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
                print(str(error), file=sys.stderr)
                exit_code = 1
        report['finished_at'] = datetime.now(timezone.utc).isoformat()
        report['test_exit_code'] = exit_code
        (evidence / 'resultado.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(f'Evidencia: {evidence}', flush=True)
    return exit_code


if __name__ == '__main__':
    raise SystemExit(main())
