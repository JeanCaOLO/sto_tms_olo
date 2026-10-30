#!/usr/bin/env python3
"""Arquitectura Gate — puerta de diseno INTELIX previa a Construction (The Architect).

Puerta de control HUMANA, deterministica y de solo lectura. NO reemplaza ninguna
fase de AI-DLC v2.8.2 ni el sign-off humano: fortalece la transicion
Inception -> Construction verificando que el diseno quede escrito y alineado al
estandar antes de generar codigo.

Que hace:
  - Verifica que exista un ADR (Architecture Decision Record) con las decisiones
    minimas exigidas por el estandar de desarrollo INTELIX.
  - Aplica un checklist deterministico sobre el ADR: capas hexagonales, decision
    Lambda vs ECS justificada, parametrizacion por ambiente (dev/qa/prod),
    secretos fuera del codigo, perfil de exposicion e IdP, y referencia al perfil
    del proyecto.
  - Escribe un reporte auditable en .aidlc/audit/arquitectura-gate-latest.md.
  - Puede generar una plantilla de ADR con `--scaffold` para que el equipo la llene.

Que NO hace:
  - No disena por el equipo ni escribe codigo.
  - No recalcula el dictamen del motor de certificacion (scripts/verificacion/).
  - No toca aidlc-state.md ni el harness.

Fuente de verdad del estandar:
  docs/estandares/estandares-desarrollo-intelix.md
  docs/estandares/seguridad-baseline.md
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Script vive en .intelix/scripts/ -> raiz del proyecto = parents[2]
ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / ".aidlc" / "audit"
REPORT = AUDIT / "arquitectura-gate-latest.md"
PROFILE = ROOT / ".intelix" / "project-profile.json"

# Ubicaciones candidatas del ADR de diseno (la primera que exista manda)
ADR_CANDIDATES = (
    "docs/arquitectura/ADR.md",
    "docs/arquitectura/adr.md",
    "docs/ADR.md",
    "Product-Definition/ADR.md",
)

PLANTILLA_ADR = """# ADR — Decisiones de Arquitectura

Proyecto: <nombre>
Clase (Menor/Intermedio/Mayor): <clase>
Fecha: <YYYY-MM-DD>
Autor / Arquitecto: <rol>

> Puerta previa a Construction. Completar antes de generar codigo.
> Estandar: docs/estandares/estandares-desarrollo-intelix.md

## 1. Contexto y problema
<Que se construye y por que. Enlazar Product-Definition/vision.>

## 2. Capas (arquitectura hexagonal)
Describir la separacion Domain / Application / Infrastructure. El dominio no
depende de boto3 ni de frameworks.

- Domain: <entidades y reglas de negocio>
- Application: <casos de uso y puertos/interfaces>
- Infrastructure: <adaptadores: DynamoDB, SQS, Secrets, HTTP, repos>

## 3. Computo: Lambda vs ECS
Decision: <Lambda | ECS/Fargate>
Justificacion (duracion, runtime, costo, carga): <texto>
> Por defecto Lambda. ECS exige justificacion con metricas.

## 4. Ambientes y parametrizacion
Una plantilla, N ambientes (dev/qa/prod) via Parameters + samconfig.toml.
- Parametros por ambiente: <Environment, SubnetIds, SecurityGroupId, ...>
- Nombres de stack: dev-<app> / qa-<app> / prod-<app>

## 5. Secretos y configuracion
- Secretos en Secrets Manager / SSM (nunca en codigo ni en samconfig versionado).
- Variables de entorno en UPPER_SNAKE_CASE (sin passwords/ARNs hardcodeados).

## 6. Exposicion y seguridad
Exposicion: <publica | corporativa>
- Autenticacion / IdP: <Cognito, SSO, OAuth2, MFA si publica>
- Perimetro (si publica): WAF + CORS por lista + HTTPS/TLS.
- IAM de minimo privilegio (sin Action/Resource: *).

## 7. Datos
- Motor y nomenclatura: ver docs/README-solucion-base-de-datos.md
- OLTP: intelix-db-provisioning · Analitica/lago: intelix-datalake-naming

## 8. Frontend (si aplica)
- React + Design System existente. Amplify vs ECS segun SPA vs SSR.

## 9. Riesgos y decisiones abiertas
<lista>
"""

# Checklist deterministico: (id, descripcion, patrones que evidencian cumplimiento, critico)
# "critico" aqui significa que su ausencia marca el gate como REQUIERE_AJUSTES (no es
# un HARD-STOP de seguridad: eso lo fija el motor/baseline, no esta puerta de diseno).
CHECKS = [
    (
        "ADR-1",
        "Capas hexagonales (Domain/Application/Infrastructure) descritas",
        [r"\bdomain\b", r"\bapplication\b", r"\binfra"],
        True,
    ),
    (
        "ADR-2",
        "Decision Lambda vs ECS justificada",
        [r"lambda", r"ecs|fargate"],
        True,
    ),
    (
        "ADR-3",
        "Parametrizacion por ambiente (dev/qa/prod)",
        [r"\bdev\b.*\bqa\b.*\bprod\b|dev/qa/prod|samconfig|parameter"],
        True,
    ),
    (
        "ADR-4",
        "Secretos fuera del codigo (Secrets Manager / SSM)",
        [r"secrets?\s*manager|ssm|parameter store|getsecretvalue"],
        True,
    ),
    (
        "ADR-5",
        "Exposicion declarada (publica/corporativa) e IdP/auth",
        [r"publica|corporativa", r"cognito|sso|oauth|idp|mfa|authorizer"],
        True,
    ),
    (
        "ADR-6",
        "IAM de minimo privilegio mencionado",
        [r"minimo privilegio|least privilege|iam"],
        False,
    ),
    (
        "ADR-7",
        "Estrategia de datos / nomenclatura BD referida",
        [r"base de datos|dynamodb|oltp|lago|datalake|postgres|sql server|mysql|oracle"],
        False,
    ),
]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def find_adr() -> Path | None:
    for rel in ADR_CANDIDATES:
        p = ROOT / rel
        if p.is_file():
            return p
    return None


def check_block(text: str, patterns: list[str]) -> bool:
    """Todos los patrones del grupo deben aparecer (AND) para contar el control."""
    low = text.lower()
    for pat in patterns:
        if not re.search(pat, low, re.I | re.S):
            return False
    return True


def evaluate(text: str) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    for cid, desc, patterns, critical in CHECKS:
        ok = check_block(text, patterns)
        if ok:
            continue
        msg = f"{cid}: {desc} — no se evidencia en el ADR."
        (errors if critical else warnings).append(msg)
    return errors, warnings


def write_report(status: str, adr: Path | None, errors, warnings) -> None:
    AUDIT.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines = [
        f"# Arquitectura Gate — {status}",
        "",
        f"- timestamp: {now}",
        f"- adr: {adr.relative_to(ROOT) if adr else '(no encontrado)'}",
        f"- perfil: {'presente' if PROFILE.is_file() else 'ausente'}",
        "",
        "## Controles no evidenciados (bloquean el gate)",
    ]
    lines += [f"- {e}" for e in errors] or ["- (ninguno)"]
    lines += ["", "## Recomendaciones (no bloquean)"]
    lines += [f"- {w}" for w in warnings] or ["- (ninguno)"]
    lines += [
        "",
        "## Siguiente paso",
        "- Si APROBADO: el Arquitecto/Lider da el sign-off y habilita Construction.",
        "- Si REQUIERE_AJUSTES: completar el ADR y re-ejecutar este gate.",
        "- Esta puerta NO reemplaza la certificacion del motor (scripts/verificacion/).",
        "",
    ]
    REPORT.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="INTELIX Arquitectura Gate — puerta de diseno previa a Construction"
    )
    parser.add_argument(
        "--scaffold",
        action="store_true",
        help="Generar plantilla de ADR en docs/arquitectura/ADR.md si no existe",
    )
    parser.add_argument(
        "--ci",
        action="store_true",
        help="Exit non-zero si hay controles no evidenciados (para pipelines)",
    )
    args = parser.parse_args()

    if args.scaffold:
        destino = ROOT / "docs" / "arquitectura" / "ADR.md"
        if destino.exists():
            print(f"ADR ya existe: {destino.relative_to(ROOT)} (no se sobrescribe).")
        else:
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(PLANTILLA_ADR, encoding="utf-8")
            print(f"Plantilla ADR creada en {destino.relative_to(ROOT)}. Completarla antes del gate.")
        return 0

    adr = find_adr()
    if adr is None:
        status = "REQUIERE_AJUSTES"
        errors = [
            "No existe ADR de diseno. Crear uno (o `--scaffold`) en "
            + " | ".join(ADR_CANDIDATES)
        ]
        warnings: list[str] = []
        write_report(status, None, errors, warnings)
        print(f"Arquitectura Gate: {status}")
        for e in errors:
            print(f"ERROR: {e}")
        print(f"Report: {REPORT}")
        return 1 if args.ci else 0

    text = read_text(adr)
    errors, warnings = evaluate(text)
    if not PROFILE.is_file():
        warnings.append(
            "No se encuentra .intelix/project-profile.json; el diseno deberia "
            "partir del perfil del proyecto."
        )
    status = "APROBADO" if not errors else "REQUIERE_AJUSTES"
    write_report(status, adr, errors, warnings)

    print(f"Arquitectura Gate: {status}  (ADR: {adr.relative_to(ROOT)})")
    for e in errors:
        print(f"ERROR: {e}")
    for w in warnings:
        print(f"WARN: {w}")
    print(f"Report: {REPORT}")

    if errors and args.ci:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
