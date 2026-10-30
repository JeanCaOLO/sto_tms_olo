#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================================
 GENERADOR DE SCRIPTS DE VALIDACION MULTI-MOTOR
============================================================
Genera scripts SQL que VERIFICAN que los objetos aprovisionados
(base de datos, esquemas, roles, usuarios y tablas de ejemplo)
realmente se crearon. Cada consulta devuelve una columna 'estado'
con el valor 'OK' o 'FALTA'.

Reutiliza la misma configuracion y motor de plantillas de
generate.py (config.yaml, .env o variables de entorno) y respeta
el soporte de multiples esquemas.

Uso:
    python validate.py --engine postgresql
    python validate.py --engine all
    python validate.py --engine all --env-file .env
    python validate.py --engine all --from-env
    python validate.py --engine all --output ./validaciones

Despues de generar, ejecuta el script resultante en el motor y
revisa que todas las filas muestren 'OK'.
"""

import argparse
import os
import sys

import generate as g

VALIDATE_TEMPLATES = {
    "postgresql": "postgresql.validate.sql.tpl",
    "mysql":      "mysql.validate.sql.tpl",
    "sqlserver":  "sqlserver.validate.sql.tpl",
    "oracle":     "oracle.validate.sql.tpl",
}


def validate_engine(engine, cfg, output_dir):
    tpl_path = os.path.join(g.TEMPLATES_DIR, VALIDATE_TEMPLATES[engine])
    if not os.path.exists(tpl_path):
        print(f"  ! Plantilla de validacion no encontrada: {tpl_path}")
        return False

    content = g.render_template_file(tpl_path, cfg)
    g.warn_leftovers(engine, content)

    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, f"{engine}_validation.sql")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  OK Generado: {out_path}")
    return True


def build_arg_parser():
    parser = argparse.ArgumentParser(
        description="Generador de scripts de validacion de provisionamiento."
    )
    parser.add_argument(
        "--engine",
        choices=list(VALIDATE_TEMPLATES.keys()) + ["all"],
        required=True,
        help="Motor objetivo o 'all' para todos.",
    )
    parser.add_argument(
        "--config", default=os.path.join(g.BASE_DIR, "config.yaml"),
        help="Ruta al archivo YAML de configuracion (por defecto config.yaml).",
    )
    parser.add_argument(
        "--env-file", dest="env_file", default=None,
        help="Usar un archivo .env como fuente de configuracion (CI/CD).",
    )
    parser.add_argument(
        "--from-env", dest="from_env", action="store_true",
        help="Usar variables de entorno DBKIT_* del proceso (CI/CD).",
    )
    parser.add_argument(
        "--output", default=g.DEFAULT_OUTPUT, help="Carpeta de salida.",
    )
    return parser


def main():
    args = build_arg_parser().parse_args()

    print("=" * 60)
    print(" GENERADOR DE VALIDACION MULTI-MOTOR")
    print("=" * 60)

    cfg, source = g.resolve_config(args)
    schemas = g.get_schemas(cfg)

    print(f"\nFuente:     {source}")
    print(f"Aplicativo: {cfg['aplicativo']}")
    print(f"Esquemas:   {', '.join(schemas)} ({len(schemas)})\n")

    targets = list(VALIDATE_TEMPLATES.keys()) if args.engine == "all" else [args.engine]

    print("Generando scripts de validacion...")
    ok = 0
    for eng in targets:
        if validate_engine(eng, cfg, args.output):
            ok += 1

    print(f"\nCompletado: {ok}/{len(targets)} scripts de validacion generados.")
    print(f"Ubicacion:  {os.path.abspath(args.output)}")
    print("Ejecuta cada script y verifica que todas las filas muestren 'OK'.")


if __name__ == "__main__":
    main()
