#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================================
 VALIDADOR DE NOMENCLATURA DE BASE DE DATOS - INTELIX
============================================================
Valida nombres de objetos (tablas, vistas, vistas materializadas y esquemas)
en archivos .sql contra el marco de estandares INTELIX segun la NATURALEZA y,
en el caso analitico, segun la CAPA (esquema) en que viven.

Naturalezas / capas reconocidas por el nombre del esquema:
  - Analitica / Lago:
      bronze | raw | staging     -> patron source-oriented (con tipo_fuente)
      silver | refined | sor      -> patron sin tipo_fuente (mantiene sistema)
      dwh                          -> dimensional (dim_/fact_/br_/agg_)
      viewbi | gold                -> vistas BI (vw_/mvw_)
      ssot                         -> certificado (vw_/mvw_/tbl_)
  - Intermedia / Bridge:
      inbound | outbound           -> stg_/hist_ + cuerpo source-oriented
  - Transaccional (OLTP) u otros:
      solo reglas generales + sugerencia de prefijo de objeto

Es un LINTER (reporta, no bloquea). Devuelve SIEMPRE codigo de salida 0 salvo
error interno; las violaciones se imprimen como advertencias.

Uso directo (CLI):
    python validar_sql.py archivo1.sql [archivo2.sql ...]
    python validar_sql.py --dir ./output
    python validar_sql.py --self-test

Uso desde un hook (recibe JSON por stdin y descubre los .sql referenciados):
    <json-del-hook> | python validar_sql.py --hook
"""

import argparse
import json
import os
import re
import sys
import unicodedata

# ------------------------------------------------------------
# Vocabulario del estandar
# ------------------------------------------------------------
TIPO_FUENTE = {"xls", "csv", "txt", "gsh", "api", "db", "json", "xml"}
CLASE = {"dim", "fact", "master"}
DWH_PREFIX = {"dim", "fact", "br", "agg"}
VISTA_PREFIX = {"vw", "mvw"}
VOLATILIDAD = {"stg", "hist"}
PAIS_RE = re.compile(r"^[a-z]{2}$")

# Alias de capa -> capa canonica
CAPA_ALIAS = {
    "bronze": "bronze", "raw": "bronze", "staging": "bronze",
    "silver": "silver", "refined": "silver", "sor": "silver",
    "dwh": "dwh",
    "viewbi": "viewbi", "gold": "viewbi",
    "ssot": "ssot",
    "inbound": "bridge", "outbound": "bridge",
}

# CREATE [OR REPLACE] [GLOBAL|LOCAL] [TEMP] TABLE|VIEW|MATERIALIZED VIEW|SCHEMA
# El grupo `name` incluye letras Unicode (\w) para poder DETECTAR acentos/ñ en
# identificadores (si solo aceptara ASCII, el match se cortaria antes del acento
# y el nombre truncado pasaria como valido).
CREATE_RE = re.compile(
    r"""create\s+
        (?:or\s+replace\s+)?
        (?:global\s+|local\s+)?
        (?:temp(?:orary)?\s+)?
        (?:unlogged\s+)?
        (?P<kind>materialized\s+view|view|table|schema)\s+
        (?:if\s+not\s+exists\s+)?
        (?P<name>[\w."]+)
    """,
    re.IGNORECASE | re.VERBOSE | re.UNICODE,
)

PLACEHOLDER_RE = re.compile(r"\{\{[^}]+\}\}")

# `CREATE TABLE/VIEW/...` tambien aparece como PRIVILEGIO dentro de un GRANT/REVOKE
# (ej. `GRANT CREATE MATERIALIZED VIEW TO rol`). Esos no son sentencias CREATE
# reales: se detectan por el contexto GRANT/REVOKE en la sentencia actual y por
# nombres que en realidad son palabras clave SQL.
GRANT_CTX_RE = re.compile(r"\b(grant|revoke)\b", re.IGNORECASE)
KEYWORDS_NO_OBJETO = {
    "to", "on", "from", "with", "session", "procedure", "trigger", "sequence",
    "type", "table", "view", "database", "role", "user", "index", "synonym",
    "any", "materialized",
}


class Finding:
    __slots__ = ("path", "line", "level", "message")

    def __init__(self, path, line, level, message):
        self.path = path
        self.line = line
        self.level = level
        self.message = message

    def format(self):
        rel = self.path
        return f"{rel}:{self.line}: [{self.level}] {self.message}"


# ------------------------------------------------------------
# Utilidades de identificadores
# ------------------------------------------------------------
def strip_quotes(ident):
    return ident.replace('"', "").strip()


def split_qualified(name):
    """Devuelve (schema_or_None, objeto) a partir de un nombre calificado."""
    parts = [strip_quotes(p) for p in name.split(".")]
    parts = [p for p in parts if p != ""]
    if len(parts) >= 2:
        return parts[-2], parts[-1]
    return None, parts[-1] if parts else ""


def has_non_ascii(ident):
    try:
        ident.encode("ascii")
        return False
    except UnicodeEncodeError:
        return True


def normalized_accents(ident):
    """Version sin acentos, para sugerir correccion."""
    nfkd = unicodedata.normalize("NFKD", ident)
    sin = "".join(c for c in nfkd if not unicodedata.combining(c))
    return sin.replace("\u00f1", "n").replace("\u00d1", "N")


def check_general(objeto, path, line, findings):
    """Reglas transversales a toda naturaleza. Devuelve True si el nombre es
    'limpio' (minusculas, snake_case, sin acentos)."""
    limpio = True
    if has_non_ascii(objeto):
        limpio = False
        findings.append(Finding(
            path, line, "ERROR",
            f"'{objeto}' contiene acentos/caracteres no ASCII (incluida n-tilde). "
            f"Usar: '{normalized_accents(objeto).lower()}'."))
    if objeto != objeto.lower():
        limpio = False
        findings.append(Finding(
            path, line, "ERROR",
            f"'{objeto}' debe ir en minusculas. Usar: '{objeto.lower()}'."))
    if not re.match(r"^[a-z0-9_]+$", objeto.lower()):
        limpio = False
        findings.append(Finding(
            path, line, "ERROR",
            f"'{objeto}' debe usar snake_case (solo [a-z0-9_], sin espacios ni "
            f"caracteres especiales)."))
    return limpio


def _last_is_pais(tokens):
    return len(tokens) >= 1 and PAIS_RE.match(tokens[-1]) is not None


# ------------------------------------------------------------
# Validacion por capa / naturaleza
# ------------------------------------------------------------
def validar_bronze(objeto, path, line, findings):
    t = objeto.lower().split("_")
    if _last_is_pais(t) and len(t) > 4:
        t = t[:-1]
    if len(t) < 4:
        findings.append(Finding(path, line, "WARN",
            f"bronze: '{objeto}' deberia seguir "
            f"{{tipo_fuente}}_{{sistema}}_{{clase}}_{{entidad}}[_{{pais}}] "
            f"(ej. xls_khai_fact_consolidado)."))
        return
    if t[0] not in TIPO_FUENTE:
        findings.append(Finding(path, line, "WARN",
            f"bronze: prefijo de fuente '{t[0]}' no valido. "
            f"Permitidos: {', '.join(sorted(TIPO_FUENTE))}."))
    if t[2] not in CLASE:
        findings.append(Finding(path, line, "WARN",
            f"bronze: clase '{t[2]}' no valida (esperado dim/fact/master) "
            f"en posicion 3 de '{objeto}'."))


def validar_silver(objeto, path, line, findings):
    t = objeto.lower().split("_")
    if _last_is_pais(t) and len(t) > 3:
        t = t[:-1]
    if len(t) < 3:
        findings.append(Finding(path, line, "WARN",
            f"silver: '{objeto}' deberia seguir "
            f"{{sistema}}_{{clase}}_{{entidad}}[_{{pais}}] "
            f"(cae tipo_fuente; ej. khai_fact_consolidado)."))
        return
    if t[0] in TIPO_FUENTE:
        findings.append(Finding(path, line, "WARN",
            f"silver: '{objeto}' conserva prefijo de fuente '{t[0]}'. "
            f"El tipo_fuente solo aplica en bronze."))
    if t[1] not in CLASE:
        findings.append(Finding(path, line, "WARN",
            f"silver: clase '{t[1]}' no valida (esperado dim/fact/master)."))


def validar_dwh(objeto, path, line, findings):
    t = objeto.lower().split("_")
    if t[0] not in DWH_PREFIX:
        findings.append(Finding(path, line, "WARN",
            f"dwh: '{objeto}' debe iniciar con dim_/fact_/br_/agg_ "
            f"(modelo dimensional)."))


def validar_vistas(objeto, path, line, capa, findings, permitir_tabla=False):
    t = objeto.lower().split("_")
    ok = t[0] in VISTA_PREFIX or (permitir_tabla and t[0] == "tbl")
    if not ok:
        permitidos = "vw_/mvw_/tbl_" if permitir_tabla else "vw_/mvw_"
        findings.append(Finding(path, line, "WARN",
            f"{capa}: '{objeto}' deberia iniciar con {permitidos}."))


def validar_bridge(objeto, path, line, findings):
    t = objeto.lower().split("_")
    if _last_is_pais(t) and len(t) > 5:
        t = t[:-1]
    if t[0] not in VOLATILIDAD:
        findings.append(Finding(path, line, "WARN",
            f"bridge: '{objeto}' debe iniciar con stg_ (transitoria) o hist_ "
            f"(historica)."))
        return
    if len(t) < 5:
        findings.append(Finding(path, line, "WARN",
            f"bridge: '{objeto}' deberia seguir "
            f"{{stg|hist}}_{{tipo_fuente}}_{{sistema}}_{{clase}}_{{entidad}} "
            f"(ej. stg_xls_khai_fact_consolidado)."))
        return
    if t[1] not in TIPO_FUENTE:
        findings.append(Finding(path, line, "WARN",
            f"bridge: prefijo de fuente '{t[1]}' no valido tras {t[0]}_."))
    if t[3] not in CLASE:
        findings.append(Finding(path, line, "WARN",
            f"bridge: clase '{t[3]}' no valida (esperado dim/fact/master)."))


def validar_objeto(kind, schema, objeto, path, line, findings):
    limpio = check_general(objeto, path, line, findings)
    if not limpio:
        return  # primero corregir lo transversal

    if schema is None:
        return  # sin esquema calificado no inferimos capa

    capa = CAPA_ALIAS.get(schema.lower())
    if capa is None:
        return  # esquema no analitico/bridge: solo reglas generales

    if capa == "bronze":
        validar_bronze(objeto, path, line, findings)
    elif capa == "silver":
        validar_silver(objeto, path, line, findings)
    elif capa == "dwh":
        validar_dwh(objeto, path, line, findings)
    elif capa == "viewbi":
        validar_vistas(objeto, path, line, "viewbi", findings, permitir_tabla=False)
    elif capa == "ssot":
        validar_vistas(objeto, path, line, "ssot", findings, permitir_tabla=True)
    elif capa == "bridge":
        validar_bridge(objeto, path, line, findings)


# ------------------------------------------------------------
# Escaneo de archivos
# ------------------------------------------------------------
def scan_text(text, path):
    findings = []
    lines = text.splitlines()
    for i, raw in enumerate(lines, start=1):
        for ph in PLACEHOLDER_RE.findall(raw):
            findings.append(Finding(path, i, "ERROR",
                f"placeholder sin reemplazar: {ph}"))
    for m in CREATE_RE.finditer(text):
        kind = re.sub(r"\s+", " ", m.group("kind")).lower()
        name = m.group("name")
        line = text.count("\n", 0, m.start()) + 1

        # Ignorar CREATE que en realidad es un privilegio dentro de un GRANT/REVOKE
        # (contexto de la sentencia actual, delimitada por el ';' anterior).
        stmt_start = text.rfind(";", 0, m.start()) + 1
        if GRANT_CTX_RE.search(text[stmt_start:m.start()]):
            continue
        # Ignorar cuando el "nombre" es en realidad una palabra clave SQL.
        base_ident = strip_quotes(name.split(".")[-1]).lower()
        if base_ident in KEYWORDS_NO_OBJETO:
            continue

        if kind == "schema":
            schema_name = strip_quotes(name.split(".")[-1])
            check_general(schema_name, path, line, findings)
            continue
        schema, objeto = split_qualified(name)
        if objeto:
            validar_objeto(kind, schema, objeto, path, line, findings)
    return findings


def scan_file(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    except OSError as e:
        return [Finding(path, 0, "ERROR", f"no se pudo leer el archivo: {e}")]
    return scan_text(text, path)


def discover_sql_from_json(obj, found):
    """Busca recursivamente strings que apunten a archivos .sql existentes."""
    if isinstance(obj, dict):
        for v in obj.values():
            discover_sql_from_json(v, found)
    elif isinstance(obj, list):
        for v in obj:
            discover_sql_from_json(v, found)
    elif isinstance(obj, str):
        if obj.lower().endswith(".sql") and os.path.isfile(obj):
            found.append(obj)


# ------------------------------------------------------------
# Self-test
# ------------------------------------------------------------
def run_self_test():
    casos = [
        # (sql, descripcion, se_espera_hallazgo)
        ("CREATE TABLE bronze.xls_khai_fact_consolidado (id int);",
         "bronze valido", False),
        ("CREATE TABLE bronze.Xls_Khai_Fact_Consolidado (id int);",
         "bronze con mayusculas", True),
        ("CREATE TABLE bronze.xls_khai_consolidado (id int);",
         "bronze sin clase", True),
        ("CREATE TABLE silver.khai_fact_consolidado (id int);",
         "silver valido", False),
        ("CREATE TABLE silver.xls_khai_fact_consolidado (id int);",
         "silver con tipo_fuente indebido", True),
        ("CREATE TABLE dwh.dim_commodity (id int);",
         "dwh dim valido", False),
        ("CREATE TABLE dwh.commodity (id int);",
         "dwh sin prefijo dimensional", True),
        ("CREATE VIEW viewbi.vw_venta_mensual AS SELECT 1;",
         "viewbi valido", False),
        ("CREATE MATERIALIZED VIEW ssot.mvw_venta_oficial AS SELECT 1;",
         "ssot valido", False),
        ("CREATE TABLE inbound.stg_xls_khai_fact_consolidado (id int);",
         "bridge stg valido", False),
        ("CREATE TABLE inbound.xls_khai_fact_consolidado (id int);",
         "bridge sin volatilidad", True),
        ("CREATE TABLE bronze.xls_khai_fact_articulo_mx (id int);",
         "bronze con sufijo pais", False),
        ("CREATE TABLE silver.khai_fact_cliente_activo (id int);",
         "silver entidad compuesta", False),
        ("CREATE DATABASE {{DB_NAME}};",
         "placeholder sin reemplazar", True),
    ]
    fallos = 0
    for sql, desc, espera in casos:
        f = scan_text(sql, "<self-test>")
        hubo = len(f) > 0
        estado = "OK" if hubo == espera else "FALLO"
        if hubo != espera:
            fallos += 1
        print(f"  [{estado}] {desc}"
              + ("" if hubo == espera else f"  (hallazgos={[x.message for x in f]})"))
    print(f"\nSelf-test: {len(casos) - fallos}/{len(casos)} casos correctos.")
    return 0 if fallos == 0 else 1


# ------------------------------------------------------------
# Main
# ------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Validador de nomenclatura de BD INTELIX (linter, no bloquea).")
    parser.add_argument("files", nargs="*", help="Archivos .sql a validar.")
    parser.add_argument("--dir", help="Validar todos los .sql de un directorio.")
    parser.add_argument("--hook", action="store_true",
                        help="Leer JSON del hook por stdin y descubrir los .sql.")
    parser.add_argument("--self-test", action="store_true",
                        help="Ejecutar casos de prueba internos.")
    args = parser.parse_args()

    if args.self_test:
        sys.exit(run_self_test())

    targets = list(args.files)

    if args.dir:
        for root, _dirs, files in os.walk(args.dir):
            for fn in files:
                if fn.lower().endswith(".sql"):
                    targets.append(os.path.join(root, fn))

    if args.hook:
        raw = sys.stdin.read() if not sys.stdin.isatty() else ""
        if raw.strip():
            try:
                data = json.loads(raw)
                discover_sql_from_json(data, targets)
            except json.JSONDecodeError:
                for tok in re.findall(r'[^\s"\']+\.sql', raw):
                    if os.path.isfile(tok):
                        targets.append(tok)

    targets = sorted(set(targets))
    if not targets:
        # Nada que validar (p. ej. el guardado no fue de un .sql). Salir en silencio.
        sys.exit(0)

    all_findings = []
    for path in targets:
        all_findings.extend(scan_file(path))

    if not all_findings:
        print(f"[OK] Nomenclatura conforme al estandar INTELIX "
              f"({len(targets)} archivo(s) revisado(s)).")
        sys.exit(0)

    errores = sum(1 for f in all_findings if f.level == "ERROR")
    warns = sum(1 for f in all_findings if f.level == "WARN")
    print("=" * 60)
    print(" VALIDACION DE NOMENCLATURA DE BD - INTELIX")
    print("=" * 60)
    for f in all_findings:
        print("  " + f.format())
    print("-" * 60)
    print(f"  {errores} error(es), {warns} advertencia(s) en {len(targets)} archivo(s).")
    print("  Referencia: .kiro/steering/estandares-base-de-datos.md")
    # Linter: reporta, no bloquea.
    sys.exit(0)


if __name__ == "__main__":
    main()
