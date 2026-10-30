#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================================
 GENERADOR DE SCRIPTS DE PROVISIONAMIENTO MULTI-MOTOR
============================================================
Lee la configuracion (config.yaml o variables de entorno / .env),
reemplaza los placeholders de las plantillas en /templates y genera
los scripts SQL finales en /output.

Soporta MULTIPLES ESQUEMAS por aplicativo en un solo run: los bloques
delimitados por los marcadores

    -- >>> PER_SCHEMA_BEGIN <<<
    ...
    -- >>> PER_SCHEMA_END <<<

se repiten una vez por cada esquema declarado, mientras que el resto
del script (base de datos, roles, usuarios) se genera una sola vez.

Uso:
    # Desde config.yaml (por defecto)
    python generate.py --engine postgresql
    python generate.py --engine all

    # Desde un archivo .env (pipelines CI/CD)
    python generate.py --engine all --env-file .env

    # Desde variables de entorno ya exportadas (CI/CD)
    python generate.py --engine all --from-env

    # Carpeta de salida personalizada
    python generate.py --engine all --output ./scripts_generados
"""

import argparse
import os
import re
import sys

# ------------------------------------------------------------
# Configuracion de rutas y motores soportados
# ------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
DEFAULT_OUTPUT = os.path.join(BASE_DIR, "output")

ENGINES = {
    "postgresql": "postgresql.sql.tpl",
    "mysql":      "mysql.sql.tpl",
    "sqlserver":  "sqlserver.sql.tpl",
    "oracle":     "oracle.sql.tpl",
}

# Marcadores de bloque que se repite por cada esquema
PER_SCHEMA_RE = re.compile(
    r"--\s*>>>\s*PER_SCHEMA_BEGIN\s*<<<\s*\n(.*?)"
    r"--\s*>>>\s*PER_SCHEMA_END\s*<<<[^\n]*\n?",
    re.DOTALL,
)


# ============================================================
# CARGA DE CONFIGURACION
# ============================================================
def load_config_yaml(path):
    """Carga la configuracion desde un archivo YAML."""
    try:
        import yaml
    except ImportError:
        print("ERROR: Falta PyYAML. Instala con: pip install pyyaml")
        sys.exit(1)

    if not os.path.exists(path):
        print(f"ERROR: No se encontro el archivo de configuracion: {path}")
        sys.exit(1)
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _parse_env_file(path):
    """Parser minimo de archivos .env (KEY=VALUE), sin dependencias."""
    data = {}
    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.lower().startswith("export "):
                line = line[7:]
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            data[key] = value
    return data


def load_config_env(env_file=None):
    """
    Construye la configuracion desde un archivo .env y/o las variables
    de entorno del proceso (utiles en pipelines CI/CD). Las variables del
    entorno tienen prioridad sobre las del archivo.
    """
    data = {}
    if env_file:
        if not os.path.exists(env_file):
            print(f"ERROR: No se encontro el archivo .env: {env_file}")
            sys.exit(1)
        data.update(_parse_env_file(env_file))
    # El entorno real (CI/CD) sobreescribe lo del archivo
    for key, value in os.environ.items():
        if key.startswith("DBKIT_"):
            data[key] = value

    def required(key):
        if not data.get(key):
            print(f"ERROR: La variable requerida '{key}' no esta definida.")
            sys.exit(1)
        return data[key]

    schemas_raw = data.get("DBKIT_SCHEMAS", "core")
    schemas = [s.strip() for s in schemas_raw.split(",") if s.strip()]

    return {
        "compania":   required("DBKIT_COMPANIA"),
        "ambiente":   required("DBKIT_AMBIENTE"),
        "aplicativo": required("DBKIT_APLICATIVO"),
        "schemas":    schemas,
        "passwords": {
            "ro":    required("DBKIT_PASS_RO"),
            "rw":    required("DBKIT_PASS_RW"),
            "ddl":   required("DBKIT_PASS_DDL"),
            "admin": required("DBKIT_PASS_ADMIN"),
            "owner": data.get("DBKIT_PASS_OWNER", "ChangeMe!2024"),
        },
        "postgresql": {
            "encoding": data.get("DBKIT_PG_ENCODING", "UTF8"),
            "collate":  data.get("DBKIT_PG_COLLATE", "en_US.UTF-8"),
            "ctype":    data.get("DBKIT_PG_CTYPE", "en_US.UTF-8"),
        },
        "mysql": {
            "charset":   data.get("DBKIT_MY_CHARSET", "utf8mb4"),
            "collation": data.get("DBKIT_MY_COLLATION", "utf8mb4_unicode_ci"),
        },
        "oracle": {
            "default_tablespace":   data.get("DBKIT_ORA_DEFAULT_TS", "USERS"),
            "temporary_tablespace": data.get("DBKIT_ORA_TEMP_TS", "TEMP"),
        },
    }


def resolve_config(args):
    """Decide la fuente de configuracion segun los argumentos."""
    if getattr(args, "env_file", None):
        return load_config_env(args.env_file), f".env ({args.env_file})"
    if getattr(args, "from_env", False):
        return load_config_env(None), "variables de entorno"
    return load_config_yaml(args.config), f"YAML ({args.config})"


# ============================================================
# RESOLUCION DE ESQUEMAS Y PLACEHOLDERS
# ============================================================
def get_schemas(cfg):
    """
    Devuelve la lista de sufijos de esquema. Acepta:
      - schemas: [core, staging, audit]   (multi-esquema)
      - schema_suffix: core                (compatibilidad hacia atras)
    """
    if cfg.get("schemas"):
        return [str(s).strip().lower() for s in cfg["schemas"] if str(s).strip()]
    if cfg.get("schema_suffix"):
        return [str(cfg["schema_suffix"]).strip().lower()]
    return ["core"]


def _prefix(cfg):
    comp = str(cfg["compania"]).lower()
    amb = str(cfg["ambiente"]).lower()
    app = str(cfg["aplicativo"]).lower()
    return f"{comp}_{amb}_{app}"


def build_global_replacements(cfg):
    """Placeholders que NO dependen del esquema (se generan una vez)."""
    comp = str(cfg["compania"]).lower()
    amb = str(cfg["ambiente"]).lower()
    app = str(cfg["aplicativo"]).lower()
    prefix = _prefix(cfg)

    pw = cfg["passwords"]
    pg = cfg.get("postgresql", {})
    my = cfg.get("mysql", {})
    orc = cfg.get("oracle", {})

    return {
        "{{COMPANIA}}":     comp,
        "{{AMBIENTE}}":     amb,
        "{{APLICATIVO}}":   app,
        "{{DB_NAME}}":      f"{prefix}_db",
        # Roles (por aplicativo)
        "{{ROLE_RO}}":      f"ro_{app}",
        "{{ROLE_RW}}":      f"rw_{app}",
        "{{ROLE_DDL}}":     f"ddl_{app}",
        "{{ROLE_ADMIN}}":   f"admin_{app}",
        # Usuarios (por aplicativo)
        "{{USR_REPORT}}":   f"usr_{app}_report",
        "{{USR_APP}}":      f"usr_{app}_app",
        "{{USR_DEPLOY}}":   f"usr_{app}_deploy",
        "{{USR_DBA}}":      f"usr_{app}_dba",
        # Contrasenas
        "{{PASS_RO}}":      pw["ro"],
        "{{PASS_RW}}":      pw["rw"],
        "{{PASS_DDL}}":     pw["ddl"],
        "{{PASS_ADMIN}}":   pw["admin"],
        "{{PASS_OWNER}}":   pw.get("owner", "ChangeMe!2024"),
        # PostgreSQL
        "{{PG_ENCODING}}":  pg.get("encoding", "UTF8"),
        "{{PG_COLLATE}}":   pg.get("collate", "en_US.UTF-8"),
        "{{PG_CTYPE}}":     pg.get("ctype", "en_US.UTF-8"),
        # MySQL
        "{{MY_CHARSET}}":   my.get("charset", "utf8mb4"),
        "{{MY_COLLATION}}": my.get("collation", "utf8mb4_unicode_ci"),
        # Oracle
        "{{ORA_DEFAULT_TS}}": orc.get("default_tablespace", "USERS"),
        "{{ORA_TEMP_TS}}":    orc.get("temporary_tablespace", "TEMP"),
    }


def build_schema_replacements(cfg, schema_suffix):
    """Placeholders especificos de un esquema."""
    schema_low = f"{_prefix(cfg)}_sch_{schema_suffix}"
    return {
        "{{SCHEMA_SUFFIX}}": schema_suffix,
        "{{SCHEMA_NAME}}":   schema_low,
        "{{SCHEMA_UPPER}}":  schema_low.upper(),  # Oracle usa mayusculas
    }


def apply_replacements(text, replacements):
    for placeholder, value in replacements.items():
        text = text.replace(placeholder, str(value))
    return text


def split_segments(content):
    """
    Divide el contenido en segmentos alternando bloques normales y
    bloques 'por esquema'. Devuelve lista de (is_per_schema, texto).
    """
    segments = []
    last = 0
    for m in PER_SCHEMA_RE.finditer(content):
        if m.start() > last:
            segments.append((False, content[last:m.start()]))
        segments.append((True, m.group(1)))
        last = m.end()
    if last < len(content):
        segments.append((False, content[last:]))
    return segments


# ============================================================
# RENDERIZADO
# ============================================================
def render_content(template_content, cfg):
    """Renderiza el contenido de una plantilla aplicando multi-esquema."""
    global_repl = build_global_replacements(cfg)
    schemas = get_schemas(cfg)
    segments = split_segments(template_content)

    parts = []
    for is_per_schema, text in segments:
        if is_per_schema:
            for suffix in schemas:
                repl = dict(global_repl)
                repl.update(build_schema_replacements(cfg, suffix))
                parts.append(apply_replacements(text, repl))
        else:
            parts.append(apply_replacements(text, global_repl))
    return "".join(parts)


def render_template_file(template_path, cfg):
    with open(template_path, "r", encoding="utf-8") as f:
        content = f.read()
    return render_content(content, cfg)


def warn_leftovers(engine, content):
    """Avisa si quedaron placeholders sin reemplazar."""
    if "{{" in content:
        leftovers = sorted({m for m in re.findall(r"\{\{[^}]+\}\}", content)})
        print(f"  ! ADVERTENCIA: placeholders sin reemplazar en {engine}: "
              f"{', '.join(leftovers[:8])}")


def generate_engine(engine, cfg, output_dir):
    tpl_path = os.path.join(TEMPLATES_DIR, ENGINES[engine])
    if not os.path.exists(tpl_path):
        print(f"  ! Plantilla no encontrada: {tpl_path}")
        return False

    content = render_template_file(tpl_path, cfg)
    warn_leftovers(engine, content)

    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, f"{engine}_provisioning.sql")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  OK Generado: {out_path}")
    return True


# ============================================================
# MAIN
# ============================================================
def build_arg_parser():
    parser = argparse.ArgumentParser(
        description="Generador de scripts de provisionamiento de BD multi-motor."
    )
    parser.add_argument(
        "--engine",
        choices=list(ENGINES.keys()) + ["all"],
        required=True,
        help="Motor objetivo o 'all' para todos.",
    )
    parser.add_argument(
        "--config", default=os.path.join(BASE_DIR, "config.yaml"),
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
        "--output", default=DEFAULT_OUTPUT, help="Carpeta de salida.",
    )
    return parser


def main():
    args = build_arg_parser().parse_args()

    print("=" * 60)
    print(" GENERADOR DE PROVISIONAMIENTO MULTI-MOTOR")
    print("=" * 60)

    cfg, source = resolve_config(args)
    global_repl = build_global_replacements(cfg)
    schemas = get_schemas(cfg)

    print(f"\nFuente:     {source}")
    print(f"Compania:   {cfg['compania']}")
    print(f"Ambiente:   {cfg['ambiente']}")
    print(f"Aplicativo: {cfg['aplicativo']}")
    print(f"BD:         {global_repl['{{DB_NAME}}']}")
    print(f"Esquemas:   {', '.join(schemas)} ({len(schemas)})\n")

    targets = list(ENGINES.keys()) if args.engine == "all" else [args.engine]

    print("Generando scripts...")
    ok = 0
    for eng in targets:
        if generate_engine(eng, cfg, args.output):
            ok += 1

    print(f"\nCompletado: {ok}/{len(targets)} scripts generados.")
    print(f"Ubicacion:  {os.path.abspath(args.output)}")


if __name__ == "__main__":
    main()
