#!/usr/bin/env python3
"""DevOps Diagnostico — lectura y clasificacion de logs de CI/CD (Ally Deploy, recortado).

Interprete de logs de SOLO LECTURA. Toma un log que el usuario pega o pasa como
archivo, clasifica el tipo de fallo y propone un fix guiado alineado a los
estandares INTELIX. NO ejecuta despliegues, NO se conecta a GitLab/AWS, NO toca el
pipeline y NO automatiza la puerta R11 (Pre-Deploy). La "autoreparacion" es guiada:
le dice al humano que hacer, nunca lo hace por el.

Entrada (una de):
  - --archivo <ruta>   lee el log de un archivo de texto
  - --stdin            lee el log de la entrada estandar (pega y Ctrl-D / pipe)

Salida:
  .intelix/outputs/devops_diagnostico/DIAGNOSTICO-<YYYYMMDDHHMM>.md
  (+ alias estable DIAGNOSTICO-CI.md)

Sin dependencias: Python stdlib. Script en .intelix/scripts/ -> ROOT = parents[2].
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / ".intelix" / "outputs" / "devops_diagnostico"

# Enmascara posibles secretos antes de escribir cualquier fragmento del log.
PAT_SECRETO = re.compile(
    r"((?:secret|password|passwd|token|api[_-]?key|access[_-]?key|private[_-]?key|authorization)\s*[:=]\s*)"
    r"(\S+)",
    re.I,
)
PAT_AWS_KEY = re.compile(r"AKIA[0-9A-Z]{16}")
PAT_BEARER = re.compile(r"(Bearer\s+)[A-Za-z0-9._\-]+", re.I)


def sanitizar(texto: str) -> str:
    texto = PAT_SECRETO.sub(r"\1***", texto)
    texto = PAT_AWS_KEY.sub("AKIA****************", texto)
    texto = PAT_BEARER.sub(r"\1***", texto)
    return texto


# Catalogo de clasificacion. Orden = prioridad (el primero que matchee gana como
# categoria principal; los demas se listan como senales secundarias).
# (id, etiqueta, patrones, recomendacion alineada al estandar INTELIX)
CATALOGO = [
    (
        "SECRET_LEAK",
        "Posible secreto expuesto en el log",
        [PAT_AWS_KEY, re.compile(r"(secret|password|api[_-]?key|token)\s*[:=]\s*\S{8,}", re.I)],
        "Rotar de inmediato la credencial expuesta y moverla a Secrets Manager/SSM "
        "(R1). Revisar que el job no imprima variables sensibles.",
    ),
    (
        "AUTH_DENIED",
        "Credenciales/permeabilidad rechazada (401/403/AccessDenied)",
        [re.compile(r"\b(401|403)\b|access\s*denied|not\s*authorized|permission\s*denied|forbidden", re.I)],
        "Verificar el token del job (CI_JOB_TOKEN), el rol IAM y los permisos del "
        "registry/destino. Aplicar minimo privilegio (R4); no ampliar a comodines.",
    ),
    (
        "DEPLOY_REJECTED",
        "Despliegue rechazado / rollback de stack",
        [re.compile(r"ROLLBACK_COMPLETE|CREATE_FAILED|UPDATE_ROLLBACK|deploy(ment)?\s*failed|changeset.*failed", re.I)],
        "Revisar el evento de CloudFormation que fallo primero (no el rollback). "
        "No crear recursos a mano en consola: corregir el template y redeplegar. "
        "La puerta R11 (Pre-Deploy) sigue siendo decision humana.",
    ),
    (
        "SAST_FINDING",
        "Hallazgo de seguridad en el pipeline (SAST/dependencias/secret-scan)",
        [re.compile(r"\b(sast|semgrep|bandit|trivy|snyk|npm\s*audit|safety|secret[_-]?detection)\b", re.I)],
        "Atender el hallazgo segun seguridad-baseline (R5). Un HARD-STOP abierto "
        "(R1/R3/R5/R6) bloquea el cierre de unidad.",
    ),
    (
        "TEST_FAILURE",
        "Pruebas fallidas",
        [re.compile(r"\b(\d+)\s+(failed|failing)\b|assert(ion)?\s*error|FAILED\b|tests?\s+failed", re.I)],
        "Reproducir la prueba localmente, corregir y re-ejecutar. No marcar la "
        "unidad como terminada con pruebas en rojo (DoD de intelix-qa-gate).",
    ),
    (
        "LINT_FAILURE",
        "Lint/formato/typecheck",
        [re.compile(r"\b(eslint|tslint|ruff|flake8|black|prettier|tsc)\b|lint(ing)?\s*error|type\s*error", re.I)],
        "Correr el linter/formateador local y re-stage. El build es el typecheck en "
        "proyectos TS estrictos.",
    ),
    (
        "DEP_INSTALL",
        "Instalacion de dependencias",
        [re.compile(r"npm\s+ERR!|ERESOLVE|could not resolve|pip.*error|lockfile|peer\s*dep|E404|ENOTFOUND", re.I)],
        "Verificar lockfile y versiones pinneadas; ejecutar la instalacion limpia "
        "(npm ci / pip install -r) antes del build. Evitar rangos abiertos.",
    ),
    (
        "TIMEOUT",
        "Timeout o cancelacion del job",
        [re.compile(r"timed?\s*out|timeout|job\s*(exceeded|cancell?ed)|deadline\s*exceeded|SIGTERM", re.I)],
        "Medir el p95 real en QA y ajustar timeouts; no fijar 900s por inercia. "
        "Revisar cold starts y tamano del runner.",
    ),
    (
        "BUILD_FAILURE",
        "Fallo de compilacion/build",
        [re.compile(r"build\s*failed|compilation\s*error|cannot\s*find\s*module|exit\s*code\s*[1-9]", re.I)],
        "Leer el primer error de build (no el ultimo). Confirmar artefactos y "
        "variables requeridas por el estandar SAM/React.",
    ),
]


def leer_entrada(args) -> str:
    if args.archivo:
        ruta = Path(args.archivo)
        if not ruta.is_file():
            print(f"ERROR: no existe el archivo de log: {ruta}", file=sys.stderr)
            sys.exit(2)
        return ruta.read_text(encoding="utf-8", errors="replace")
    if args.stdin:
        return sys.stdin.read()
    print("ERROR: indica --archivo <ruta> o --stdin (pega el log).", file=sys.stderr)
    sys.exit(2)


def clasificar(log: str):
    hallazgos = []
    for cid, etiqueta, patrones, recomendacion in CATALOGO:
        evidencias = []
        for pat in patrones:
            m = pat.search(log)
            if m:
                # Localizar la linea del match para dar contexto (sanitizado).
                inicio = log.rfind("\n", 0, m.start()) + 1
                fin = log.find("\n", m.end())
                if fin == -1:
                    fin = len(log)
                linea = sanitizar(log[inicio:fin]).strip()
                if linea:
                    evidencias.append(linea[:200])
        if evidencias:
            hallazgos.append({
                "id": cid,
                "etiqueta": etiqueta,
                "recomendacion": recomendacion,
                "evidencia": evidencias[:3],
            })
    return hallazgos


def generar_reporte(hallazgos, total_lineas: int) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    principal = hallazgos[0]["etiqueta"] if hallazgos else "Sin fallo evidente"
    lines = [
        "# Diagnostico de CI/CD — INTELIX",
        "",
        f"- timestamp: {now}",
        f"- lineas analizadas: {total_lineas}",
        f"- clasificacion principal: {principal}",
        "",
        "> Interprete de solo lectura. No ejecuta despliegues ni toca el pipeline. "
        "La puerta Pre-Deploy (R11) sigue siendo decision humana.",
        "",
    ]
    if not hallazgos:
        lines += [
            "## Resultado",
            "",
            "No se detectaron patrones de fallo conocidos en el log. Revisar "
            "manualmente el primer error del job si el pipeline sigue en rojo.",
            "",
        ]
    else:
        lines += ["## Hallazgos (orden de prioridad)", ""]
        for i, h in enumerate(hallazgos, 1):
            lines.append(f"### {i}. {h['etiqueta']}  (`{h['id']}`)")
            lines.append("")
            lines.append("Evidencia (sanitizada):")
            for ev in h["evidencia"]:
                lines.append(f"- `{ev}`")
            lines.append("")
            lines.append(f"**Fix guiado:** {h['recomendacion']}")
            lines.append("")
    lines += [
        "## Siguiente paso",
        "- Aplicar el fix guiado del hallazgo principal y re-ejecutar el pipeline.",
        "- Si es un hallazgo de seguridad (R1/R3/R5/R6), cerrarlo antes del merge.",
        "- Este diagnostico no sustituye la certificacion (`intelix-certificacion`).",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="INTELIX DevOps Diagnostico — lectura y clasificacion de logs de CI/CD (solo lectura)"
    )
    src = parser.add_argument_group("entrada (una)")
    src.add_argument("--archivo", help="Ruta a un archivo de log")
    src.add_argument("--stdin", action="store_true", help="Leer el log de stdin (pegar / pipe)")
    parser.add_argument("--json", action="store_true", help="Imprime el resultado en JSON por stdout")
    args = parser.parse_args()

    log = leer_entrada(args)
    total = log.count("\n") + 1 if log else 0
    hallazgos = clasificar(log)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    reporte = generar_reporte(hallazgos, total)
    destino = OUTPUT_DIR / f"DIAGNOSTICO-{stamp}.md"
    destino.write_text(reporte, encoding="utf-8")
    alias = OUTPUT_DIR / "DIAGNOSTICO-CI.md"
    alias.write_text(reporte, encoding="utf-8")

    if args.json:
        import json
        print(json.dumps({
            "lineas": total,
            "principal": hallazgos[0]["id"] if hallazgos else None,
            "hallazgos": hallazgos,
            "reporte": str(destino.relative_to(ROOT)),
        }, ensure_ascii=False, indent=2))
    else:
        print(f"Diagnostico CI: {len(hallazgos)} tipo(s) de fallo detectado(s).")
        for h in hallazgos:
            print(f"  [{h['id']}] {h['etiqueta']}")
        print(f"Reporte: {destino.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
