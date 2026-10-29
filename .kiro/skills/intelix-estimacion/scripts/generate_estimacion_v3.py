# -*- coding: utf-8 -*-
"""
PLAN-ESTIMACION (v3) — Modelo Generacion + Supervision (calibrado)

Cambio de paradigma respecto a v2:

  v2 media "horas de humano acelerado" en una sola columna HH_AI. La evidencia
  real del task-tracker mostro que la GENERACION del agente ocurre en MINUTOS,
  no en horas, y que el cuello de botella real es la VERIFICACION HUMANA
  (la verificacion humana puede tardar dias de reloj frente a minutos de
  generacion).

  v3 separa cada tarea en dos componentes explicitos:
    - HH_generacion  : trabajo del agente (fracciones de hora, calibrado real)
    - HH_supervision : trabajo humano (revisar, dar feedback, verificar)
  y DERIVA EL CRONOGRAMA de la cola de verificacion humana por unidad, no de
  HH ÷ 8h/dia de construccion.

Calibracion (evidencia agregada de proyectos AI-DLC previos):
  - La generacion por tarea se mide en minutos (desde ~1 min en un repositorio
    simple hasta ~9 min en tareas de pruebas).
  - La verificacion humana es el cuello de botella (puede tardar dias de reloj).
  - Re-trabajo observado del orden del 5% de las tareas.

  NOTA: calibracion PROVISIONAL; recalibrar con la evidencia del propio proyecto.

Reglas conservadas de v2:
  - Nomenclatura sin prefijos
  - Calendario VE (feriados nacionales)
  - Versionado iterable (borrador auto-incremental, --final para definitiva)
  - Cruce del % completado con el task-tracker
  - Bin-packing continuo de horas
"""
import argparse
import json
import math
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

# Corrector ortografico RAE para nombres visibles del plan.
_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))


def _cargar_resolvedor_aidlc():
    for ancestor in (_SCRIPT_DIR, *_SCRIPT_DIR.parents):
        for candidate in (
            ancestor / ".intelix" / "scripts",
            ancestor / "templates" / ".intelix" / "scripts",
        ):
            if (candidate / "aidlc_paths.py").is_file():
                sys.path.insert(0, str(candidate))
                from aidlc_paths import find_project_root, resolve_layout
                return find_project_root, resolve_layout
    raise ImportError("No se encontro .intelix/scripts/aidlc_paths.py")


_find_project_root, _resolve_aidlc_layout = _cargar_resolvedor_aidlc()

try:
    from corrector_ortografico import (
        corregir_nombre_entregable,
        corregir_nombre_tarea,
    )
except ImportError:
    def corregir_nombre_entregable(nombre):
        return nombre

    def corregir_nombre_tarea(nombre):
        return nombre


def _corregir_nombre_entregable_plan(nombre):
    """Normaliza la ortografia del nombre visible de un entregable."""
    return corregir_nombre_entregable(nombre) if nombre else nombre


def _corregir_nombre_tarea_plan(nombre):
    """Normaliza la ortografia del nombre visible de una tarea."""
    return corregir_nombre_tarea(nombre) if nombre else nombre

# ============================================================ CONFIG
# Nombre y codigo del proyecto NO se hardcodean: se leen de la configuracion
# central compartida por las skills (estimacion, seguimiento, task-tracker).
# Fuente unica de verdad: docs/scripts/project-config.json.
PROJECT_CONFIG_PATH = Path(__file__).resolve().parent / "project-config.json"


CLASIFICACIONES_MANTENIMIENTO = {
    "menor": "Mantenimiento Menor",
    "intermedio": "Mantenimiento Intermedio",
    "mayor": "Mantenimiento Mayor",
}

ACTA_CIERRE_HH_POR_CLASIFICACION = {
    "menor": 0.5,
    "intermedio": 0.5,
    "mayor": 1.0,
}


def normalizar_clasificacion(valor):
    """Normaliza la clasificacion declarada en la ficha de solicitud."""
    if valor is None:
        return None
    texto = str(valor).strip().lower()
    texto = texto.replace("mantenimiento ", "")
    return texto if texto in ACTA_CIERRE_HH_POR_CLASIFICACION else None


def cargar_project_config(path=PROJECT_CONFIG_PATH):
    """Lee project-config.json y exige la clasificacion confirmada.

    Devuelve (config_dict, existe_valido). La clasificacion es obligatoria para
    impedir que el Acta de Cierre se estime con un valor por defecto silencioso.
    """
    p = Path(path)
    if not p.exists():
        return {}, False
    try:
        cfg = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}, False
    clasificacion = normalizar_clasificacion(
        cfg.get("clasificacion", cfg.get("classification"))
    )
    valido = bool(cfg.get("code")) and bool(cfg.get("name")) and clasificacion is not None
    return cfg, valido


_PCFG, PROJECT_CONFIG_OK = cargar_project_config()
# Si la config no existe/es invalida, main() se detiene y la solicita (opcion A).
# Los defaults de abajo solo evitan que falle el import (VERSION_RE los usa);
# NUNCA se genera un plan con ellos: el bloqueo en main() lo impide.
PROJECT_NAME = _PCFG.get("name", "PROYECTO-SIN-CONFIGURAR")
PROJECT_CODE = _PCFG.get("code", "SINCODIGO")
LEADER = _PCFG.get("leader", "")
COUNTRY = str(_PCFG.get("country", "VE")).strip().upper()
PROJECT_HOLIDAYS = _PCFG.get("holidays", _PCFG.get("feriados", [])) or []
CLASIFICACION = normalizar_clasificacion(
    _PCFG.get("clasificacion", _PCFG.get("classification"))
)
ACTA_CIERRE_HH = ACTA_CIERRE_HH_POR_CLASIFICACION.get(CLASIFICACION)
METHODOLOGY = "AI-DLC"
AI_TOOLING = "Kiro"
HOURS_PER_DAY = 8.0


def normalizar_dedicacion(valor):
    """Acepta 0-1, 0-100 o texto con %, y devuelve una fraccion 0-1."""
    if isinstance(valor, bool) or valor is None:
        raise ValueError(f"Dedicacion invalida: {valor}")
    texto = str(valor).strip().replace(",", ".")
    tiene_porcentaje = texto.endswith("%")
    if tiene_porcentaje:
        texto = texto[:-1].strip()
    try:
        dedicacion = float(texto)
    except ValueError as exc:
        raise ValueError(f"Dedicacion invalida: {valor}") from exc
    if tiene_porcentaje or dedicacion > 1:
        dedicacion /= 100.0
    if dedicacion <= 0 or dedicacion > 1:
        raise ValueError(f"Dedicacion fuera de rango: {valor}")
    return dedicacion

# Rutas de las fuentes de fecha/estado. El registro activo puede usar el layout
# legacy (aidlc-docs/) o el layout por spaces/intents de AI-DLC v2.
_ROOT = _find_project_root(__file__)
AI_DLC_LAYOUT = _resolve_aidlc_layout(_ROOT)
AIDLC_STATE_PATH = AI_DLC_LAYOUT.state_file
FASES_PATH = Path(__file__).resolve().parent / "estimacion-fases.json"

# Las anclas de fecha y los recursos se RESUELVEN en tiempo de ejecucion desde
# aidlc-state.md (inicio de inception) y estimacion-fases.json (fin inception,
# inicio construccion, recursos). Ver resolver_contexto() y aplicar_equipo().
# Valores por defecto (fallback si faltan las fuentes). Fecha inerte: solo se usa
# si no hay aidlc-state.md ni estimacion-fases.json; el proyecto real la sustituye.
START_DATE = date(2026, 1, 1)
CONSTRUCTION_START_DATE = None

# Asignacion por pareja persona + agente. Cada persona ejecuta con sus agentes,
# que heredan su dedicacion. El entregable se asigna a una persona (especialidad
# o ventana) y sus tareas corren en el calendario de esa persona. La persona
# verifica lo suyo. El seguimiento global lo hace el lider de la solicitud. El
# acta la elabora el responsable de la solicitud.
#
#   PERSONAS      : participantes unicos con uno o varios roles
#   LIDER         : participante que coordina y hace seguimiento
#   RESPONSABLE   : participante responsable de documentacion y cierre
#   DEPENDENCIAS  : nombre normalizado -> [nombres normalizados]
#   RESOURCES     : personas + lider + responsable, sin duplicar el nombre
PERSONAS = []
LIDER = {"name": "Lider de la solicitud", "role": "Lider de la solicitud", "dedication": 1.0}
RESPONSABLE = {"name": "Responsable de la solicitud", "role": "Responsable de la solicitud", "dedication": 1.0}
DEPENDENCIAS = {}
DEPENDENCIAS_EXTERNAS = []
MODO_ASIGNACION = "por_entregable"
ROLES_POR_TAREA = {}
RESPONSABLES_FUNCIONALES = []
RESOURCES = []
CAPACIDAD_DIA = 0.0

ROLES_LIDER = {"lider_proyecto", "responsable_solicitud"}
ROLES_DOCUMENTACION = {"responsable_documentacion", "responsable_solicitud", "lider_proyecto"}
ROLES_DESARROLLO = {
    "especialista_tecnico", "especialista_integracion",
    "programador_principal", "desarrollador",
}

# El cierre mantiene este orden cuando no hay dependencias explicitas.
CIERRE_ORDEN = [
    "Certificacion Tecnica Integral",
    "Acompanamiento a la certificacion funcional",
    "Implementacion",
    "Estabilizacion",
    "Acta de Cierre",
]


def _norm(texto):
    return " ".join(str(texto or "").strip().lower().split())


def _norm_rol(valor):
    """Normaliza nombres legibles de rol a identificadores estables."""
    texto = _norm(valor).translate(str.maketrans("áéíóúñ", "aeioun"))
    texto = re.sub(r"[^a-z0-9]+", "_", texto).strip("_")
    alias = {
        "lider_de_proyecto": "lider_proyecto",
        "lider_de_la_solicitud": "lider_proyecto",
        "responsable_de_la_solicitud": "responsable_solicitud",
        "responsable_de_documentacion": "responsable_documentacion",
        "especialista_de_integracion": "especialista_integracion",
        "programador": "desarrollador",
        "ejecuta_con_agente": "desarrollador",
        "integracion": "especialista_integracion",
    }
    return alias.get(texto, texto)


def _lista_roles(datos):
    roles = datos.get("roles")
    if roles is None:
        roles = datos.get("rol")
    if isinstance(roles, str):
        roles = [roles]
    return {_norm_rol(r) for r in (roles or []) if _norm_rol(r)}


def _texto_roles(persona):
    roles = sorted(persona.get("roles") or [])
    return ", ".join(r.replace("_", " ").title() for r in roles) or persona.get("role", "")


def _texto_alcance(persona):
    if persona.get("entregables"):
        return "Entregables: " + ", ".join(sorted(persona["entregables"]))
    if persona.get("especialidades"):
        return "Especialidades: " + ", ".join(persona["especialidades"])
    return "Global"


def _derivar_pools():
    """Arma RESOURCES y la capacidad de ejecucion desde las personas.

    La capacidad tecnica es la suma de 8 h x dedicacion de quienes desarrollan.
    Lider y responsable reutilizan la misma identidad cuando ya estan en la
    lista; nunca se duplica su disponibilidad por tener varios roles.
    """
    global RESOURCES, CAPACIDAD_DIA, LIDER, RESPONSABLE
    recursos = []
    vistos = set()
    for persona in PERSONAS:
        persona["role"] = _texto_roles(persona)
        recursos.append(persona)
        vistos.add(_norm(persona["name"]))
    lider = LIDER
    responsable = RESPONSABLE
    if lider.get("name") and responsable.get("name") and _norm(lider["name"]) == _norm(responsable["name"]):
        if _norm(lider["name"]) not in vistos:
            lider["roles"] = set(lider.get("roles") or []) | set(responsable.get("roles") or [])
            lider["role"] = _texto_roles(lider)
            recursos.append(lider)
            vistos.add(_norm(lider["name"]))
        LIDER = lider
        RESPONSABLE = lider
    else:
        for extra in (lider, responsable):
            if extra.get("name") and _norm(extra["name"]) not in vistos:
                recursos.append(extra)
                vistos.add(_norm(extra["name"]))
    RESOURCES = recursos
    CAPACIDAD_DIA = sum(
        normalizar_dedicacion(p["dedication"]) * HOURS_PER_DAY
        for p in PERSONAS if p.get("ejecuta_desarrollo", True)
    )


_derivar_pools()

# ============================================================ CALIBRACION v3
#
# Escala de GENERACION agentica recalibrada a la realidad medida (fracciones de
# hora). Sustituye la escala 2-12 HH de v2 que sobredimensionaba ~50x-250x.
#
#   Categoria     HH_gen   Evidencia real
#   basica        0.05     repos/config simples (~1 min)
#   media         0.10     logica documentada (3-6 min)
#   dashboard     0.12     visualizacion/proyeccion (banda media-alta)
#   compleja      0.15     logica de dominio sin pattern (~7-8 min)
#   tests         0.20     pruebas (~9 min) — pico de generacion, categoria aparte
#
# HH_supervision: trabajo humano por tarea (revisar salida + feedback). Se
# calibra por categoria; es el esfuerzo que de verdad consume tiempo del Senior.
GEN_HH = {
    "basica": 0.05,
    "media": 0.10,
    "dashboard": 0.12,
    "compleja": 0.15,
    "tests": 0.20,
    "doc_tecnica": 0.10,
    "doc_funcional": 0.10,
    "doc_evidencia": 0.10,
    "gestion": 0.0,       # gestion no la genera el agente
    "enlace_soporte": 0.0,# enlace temprano con areas de soporte (100% humano)
    "verif": 0.05,        # tarea de verificacion tecnica (script)
    # categorias humanas: la generacion agentica no aplica
    "humano": 0.0,
    "discovery": 0.20,
    "despliegue": 0.10,
    "implementacion": 0.10,
    "cti": 0.10,
}

SUP_HH = {
    "basica": 0.4,
    "media": 0.8,
    "dashboard": 1.0,
    "compleja": 1.5,
    "tests": 1.5,
    "doc_tecnica": None,
    "doc_funcional": None,
    "doc_evidencia": None,
    "gestion": None,      # usa las HH declaradas: gestion es 100% humana
    "enlace_soporte": None,# usa las HH declaradas: enlace temprano es 100% humano
    "verif": 1.0,         # verificacion tecnica la revisa un humano
    "humano": None,       # usa el HH tradicional 1:1 (se resuelve por tarea)
    "discovery": None,    # discovery: supervision = HH_trad * 0.40 (se resuelve)
    "despliegue": None,
    "implementacion": None,
    "cti": None,
}

# Factor de re-trabajo sobre supervision (ajustes post-entrega, estado 🔧).
# Evidencia: 1 ajuste en 27 tareas ~= 5%. Provisional.
REWORK_FACTOR = 0.05

# Sizing total de documentacion por tipo. La generacion conserva 0.10 HH y
# la supervision se ajusta para que, incluido el re-trabajo, el total sea el
# valor normativo. Ninguna tarea individual supera 1 HH.
DOC_TOTAL_HH = {
    "doc_tecnica": 0.5,
    "doc_funcional": 1.0,
    "doc_evidencia": 1.0,
}

# ============================================================ VERIFICACION HUMANA
#
# La verificacion tecnica es una TAREA EXPLICITA por entregable de construccion
# que corresponda. Consume esfuerzo y calendario, la ejecuta UN SOLO Senior y
# arranca en la barrera de finalizacion de los agentes IA. Las fases de inception
# y los entregables de cierre estan excluidos; ver VERIF_EXCLUIDOS.
#
# VERIF_CONFIG conserva la calibracion historica de muestras del tracker para
# compatibilidad y trazabilidad. El esfuerzo activo de verificacion se calcula
# con VERIF_FACTOR sobre la suma de las tareas de trabajo del entregable.
VERIF_CONFIG = {
    "fallback_horas": 12.0,   # valor de referencia para compatibilidad historica
    "umbral_muestras": 3,     # nº minimo de muestras VER-* validas para calibrar
    "estadistico": "mediana", # estadistico a aplicar cuando haya muestras suficientes
}

# Factor de esfuerzo de la VERIFICACION HUMANA. Las horas de verificacion de un
# entregable = VERIF_FACTOR x suma de la Duracion de sus tareas de trabajo. Se
# refleja como una fila propia, asignada al Senior verificador, y no se duplica
# como latencia dentro del nombre del entregable.
VERIF_FACTOR = 0.30

# Latencia de cola DESPUES de la verificacion humana de un entregable, antes de
# arrancar el siguiente (regla #3: fin verificacion + latencia -> inicio del
# proximo entregable). En DIAS HABILES de calendario (espera de aprobacion/cola
# humana entre entregables). 0 = el siguiente entregable arranca al dia habil
# siguiente del fin de la verificacion. 1 = espera 1 dia habil adicional, etc.
VERIF_LATENCY_DIAS = 0.0

# Entregables EXCLUIDOS de la tarea de verificacion humana (fases finales sin
# verificacion tecnica de unidad). El resto de entregables SI lleva verificacion.
# La tarea "Verificacion humana" SOLO aplica a los entregables de DESARROLLO /
# CONSTRUCCION (las unidades derivadas del task-tracker). NO aplica a los
# entregables de INCEPCION (analisis/diseño) ni a los de CIERRE (certificacion,
# implementacion, estabilizacion, acta). Todos estos quedan excluidos.
VERIF_EXCLUIDOS = {
    # Inception (no es desarrollo: analisis, modelado y diseño)
    "Mob Elaboration",
    "Modelo de la solucion",
    "Arquitectura de la solucion",
    "Habilitacion del Entorno de Trabajo",
    # Cierre (no es desarrollo: certificacion, despliegue, estabilizacion, cierre)
    "Certificacion Tecnica Integral",
    "Acompanamiento a la certificacion funcional",
    "Implementacion",
    "Estabilizacion",
    "Acta de Cierre",
}

# ID de la unidad del task-tracker para el join VER-* -> tarea de verificacion.
# La tarea sintetica de verificacion de un entregable mapeado a una unidad
# hereda el ID del tracker "VER-<PREFIJO_UNIDAD>" para que el seguimiento la
# vincule por ID (no por posicion). Para entregables sin unidad rastreada, la
# tarea de verificacion no tiene ID de tracker (cadena vacia).
# Vacio en la plantilla: cada proyecto lo puebla segun sus unidades del tracker.
# Formato: { "<Nombre de negocio del entregable>": "VER-<PREFIJO_UNIDAD>" }.
# Si un entregable no esta aqui, su tarea de verificacion no hereda ID de tracker
# (cadena vacia); el join por ID queda deshabilitado para ese entregable.
ENTREGABLE_A_VER_TRACKER = {}

# Vacio en la plantilla: cada proyecto declara aqui los nombres de negocio de sus
# entregables de construccion. Si esta vacio, no restringe (los entregables
# derivados del tracker/ficha se tratan igual por nombre).
UNIDADES_CONSTRUCCION = set()

# Entregables de la fase de INCEPCION (arrancan en START_DATE). El resto se
# considera fase de CONSTRUCTION/OPERATIONS y se re-ancla a CONSTRUCTION_START_DATE.
ENTREGABLES_INCEPCION = {
    "Mob Elaboration",
    "Modelo de la solucion",
    "Arquitectura de la solucion",
}

# ============================================================ ID JERARQUICO
#
# Clave estable de union (join) plan <-> seguimiento, independiente del nombre y
# de la posicion. Formato de 2 niveles (estandar INTELIX):
#   Entregable  <PREFIJO>-<NNN>          ej. EST-001, PAR-002
#   Tarea       <PREFIJO>-<NNN>-<NNN>    ej. EST-001-001, PAR-002-003
# PREFIJO: EST = estandar de arquitectura/proceso; PAR = particular del desarrollo.
# NNN: 3 digitos con cero a la izquierda, consecutivo por nivel.
#
# El ID NACE aqui (generador de estimacion): el .xlsx del plan lo lleva y la skill
# de seguimiento lo hereda en vez de recalcularlo (Fase 2 del plan del ID jerarquico).

# Entregables ESTANDAR (arquitectura/proceso). El resto es PAR (desarrollo).
ENTREGABLES_ESTANDAR = {
    "Mob Elaboration",
    "Modelo de la solucion",
    "Arquitectura de la solucion",
    "Certificacion Tecnica Integral",
    "Acompanamiento a la certificacion funcional",
    "Implementacion",
    "Estabilizacion",
    "Acta de Cierre",
}


def prefijo_entregable(nombre):
    """EST si el entregable es estandar de arquitectura/proceso; si no, PAR.

    Degradacion elegante: cualquier nombre no listado cae en PAR (desarrollo).
    Unico punto a ajustar si cambia la clasificacion.
    """
    return "EST" if nombre in ENTREGABLES_ESTANDAR else "PAR"


# ============================================================ ESTILOS
C_HEADER = "2E9CB6"
C_DARK = "1F4E79"
C_LIGHT = "BDD7EE"
C_GREY = "F2F2F2"
C_BORDER = "BFBFBF"

FONT_HEADER = Font(name="Segoe UI", bold=True, size=10, color="FFFFFF")
FONT_SUBHEADER = Font(name="Segoe UI", bold=True, size=10, color=C_DARK)
FONT_NORMAL = Font(name="Segoe UI", size=10, color="333333")
FONT_TITLE = Font(name="Segoe UI", bold=True, size=14, color=C_DARK)
FONT_TOTAL = Font(name="Segoe UI", bold=True, size=10, color="333333")

FILL_HEADER = PatternFill(start_color=C_HEADER, end_color=C_HEADER, fill_type="solid")
FILL_LIGHT = PatternFill(start_color=C_LIGHT, end_color=C_LIGHT, fill_type="solid")
FILL_GREY = PatternFill(start_color=C_GREY, end_color=C_GREY, fill_type="solid")

BORDER_THIN = Border(
    left=Side(style="thin", color=C_BORDER),
    right=Side(style="thin", color=C_BORDER),
    top=Side(style="thin", color=C_BORDER),
    bottom=Side(style="thin", color=C_BORDER),
)
ALIGN_CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
ALIGN_LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)


# ============================================================ CALENDARIO VE
def pascua(anio):
    a = anio % 19
    b = anio // 100
    c = anio % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    el = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * el) // 451
    mes = (h + el - 7 * m + 114) // 31
    dia = ((h + el - 7 * m + 114) % 31) + 1
    return date(anio, mes, dia)


def feriados_venezuela(anio):
    p = pascua(anio)
    return [
        date(anio, 1, 1), p - timedelta(days=48), p - timedelta(days=47),
        p - timedelta(days=3), p - timedelta(days=2), date(anio, 4, 19),
        date(anio, 5, 1), date(anio, 6, 24), date(anio, 7, 5),
        date(anio, 7, 24), date(anio, 10, 12), date(anio, 12, 24),
        date(anio, 12, 25), date(anio, 12, 31),
    ]


def _feriados_configurados(valores):
    feriados = set()
    for valor in valores:
        try:
            feriados.add(datetime.strptime(str(valor).strip(), "%Y-%m-%d").date())
        except ValueError as exc:
            raise ValueError(
                f"Feriado invalido en project-config.json: {valor}. Usa YYYY-MM-DD."
            ) from exc
    return feriados


FERIADOS_CONFIGURADOS = _feriados_configurados(PROJECT_HOLIDAYS)


def validar_calendario(country=COUNTRY, feriados_configurados=None):
    """Impide calcular un pais con el calendario silencioso de otro."""
    codigo = str(country or "").strip().upper()
    extras = FERIADOS_CONFIGURADOS if feriados_configurados is None else set(feriados_configurados)
    if codigo == "VE":
        return "VE - Venezuela"
    if not codigo:
        raise ValueError("Pais/calendario requerido en project-config.json")
    if not extras:
        raise ValueError(
            f"Calendario no soportado automaticamente para {codigo}. "
            "Declara 'holidays' con fechas YYYY-MM-DD en project-config.json."
        )
    return f"{codigo} - feriados configurados por el proyecto"


def es_laborable(d):
    if d.weekday() >= 5 or d in FERIADOS_CONFIGURADOS:
        return False
    if COUNTRY == "VE":
        return d not in set(feriados_venezuela(d.year))
    validar_calendario()
    return True


def primer_habil(d):
    while not es_laborable(d):
        d += timedelta(days=1)
    return d


def construir_dias_habiles(inicio, n=900):
    dias = []
    d = primer_habil(inicio)
    while len(dias) < n:
        if es_laborable(d):
            dias.append(d)
        d += timedelta(days=1)
    return dias


def fecha_en_offset(dias_habiles, h):
    idx = int(h // HOURS_PER_DAY)
    return dias_habiles[min(idx, len(dias_habiles) - 1)]


def fecha_fin_offset(dias_habiles, h_fin):
    idx = int(max(h_fin - 1e-9, 0.0) // HOURS_PER_DAY)
    return dias_habiles[min(idx, len(dias_habiles) - 1)]


def sumar_horas_habiles(fecha_inicio, horas):
    """Fecha fin al consumir `horas` de trabajo desde `fecha_inicio`, a razon de
    8 h por dia habil (1 dia habil = 8 horas). Salta fines de semana y feriados.

    Ejemplo: 26/08 + 9.09 h = 27/08 (8 h el 26/08, 1.09 h el 27/08).
    Si horas <= 8 se termina el mismo dia habil de inicio.
    """
    dias = construir_dias_habiles(fecha_inicio)
    if horas <= 0:
        return dias[0]
    # nº de dias habiles completos consumidos; la ultima fraccion cae en el
    # dia habil siguiente. Se usa ceil sobre 8 h/dia, con el ultimo dia inclusivo.
    idx = int(math.ceil(horas / HOURS_PER_DAY)) - 1
    idx = max(idx, 0)
    return dias[min(idx, len(dias) - 1)]


# ============================================================ WBS
# Formato de tarea: (nombre, hh_trad_referencia, tipo)
#   hh_trad_referencia: HH del desarrollo tradicional puro (solo para calcular
#                       ahorro y para categorias humanas 1:1).
#   tipo: categoria que determina HH_generacion y HH_supervision (ver GEN_HH/SUP_HH)

MOB_TAREAS = [
    ("Analizar requerimientos y modelo de datos", 8, "discovery"),
    ("Sesiones de entendimiento con el negocio", 8, "discovery"),
    ("Analizar la prueba de concepto y ratificar el comportamiento", 6, "discovery"),
    ("Elaborar requerimientos funcionales y restricciones", 10, "discovery"),
    ("Elaborar historias de usuario y perfiles", 12, "discovery"),
    ("Documentar artefactos de inception", 4, "doc_tecnica"),
    ("Realizar el seguimiento y la gestión del entregable", 2, "gestion"),
]

MODELO_TAREAS = [
    ("Diseñar la arquitectura y los puertos de acceso a datos", 10, "humano"),
    ("Diseñar componentes de dominio y contratos publicados", 10, "humano"),
    ("Descomponer en unidades de trabajo con matriz de dependencias", 8, "humano"),
    ("Elaborar mapa de historias por unidad de trabajo", 4, "humano"),
    ("Documentar modelo de la solución", 4, "doc_tecnica"),
    ("Realizar el seguimiento y la gestión del entregable", 2, "gestion"),
]

ARQ_TAREAS = [
    ("Diseñar entidades, reglas y lógica de acceso a datos", 8, "humano"),
    ("Diseñar las reglas del motor de negocio", 16, "humano"),
    ("Diseñar las reglas de las APIs de servicio", 10, "humano"),
    ("Diseñar proyecciones y contratos de reportes", 8, "humano"),
    ("Diseñar los módulos de frontend e infraestructura", 6, "humano"),
    ("Documentar arquitectura y contratos", 6, "doc_tecnica"),
    ("Realizar el seguimiento y la gestión del entregable", 3, "gestion"),
]

ENTORNO_TAREAS = [
    ("Habilitar el acceso a la base de datos del proyecto", 4, "despliegue"),
    ("Preparar los entornos de desarrollo de backend y frontend", 4, "despliegue"),
    ("Verificar la conectividad hacia los servicios de datos", 5, "despliegue"),
    ("Realizar el seguimiento y la gestión del entregable", 1, "gestion"),
]

CTI_TAREAS = [
    ("Pruebas de integración con la base de datos (conectividad real)", 12, "cti"),
    ("Pruebas E2E del flujo funcional completo", 16, "cti"),
    ("Pruebas de performance", 10, "cti"),
    ("Validación de no modificación al esquema de datos", 4, "cti"),
    ("Pruebas de contrato entre unidades", 8, "cti"),
    ("Corrección de defectos encontrados", 12, "cti"),
    ("Documentar resultados y evidencias de CTI", 4, "doc_evidencia"),
    ("Realizar el seguimiento y la gestión del entregable", 4, "gestion"),
]

CF_TAREAS = [
    ("Preparación del ambiente de pruebas funcionales", 4, "humano"),
    ("Soporte a UAT con usuarios de negocio (sesiones presenciales)", 16, "humano"),
    ("Documentación de hallazgos y correcciones", 8, "humano"),
]

IMPL_TAREAS = [
    ("Despliegue en ambiente de producción (sam deploy prod)", 8, "implementacion"),
    ("Configuración de parámetros productivos y secretos", 4, "implementacion"),
    ("Validación post-despliegue y smoke tests", 6, "implementacion"),
    ("Documentar runbook de producción", 4, "doc_tecnica"),
]

ESTAB_TAREAS = [
    ("Monitoreo post-producción (2 semanas)", 16, "humano"),
    ("Corrección de incidencias críticas", 12, "humano"),
    ("Ajustes de rendimiento si aplica", 8, "humano"),
    ("Documentación final", 1, "doc_funcional"),
]

CIERRE_TAREAS = [
    # El Acta de Cierre siempre tiene una sola tarea y su HH depende de la
    # clasificacion confirmada en la ficha de solicitud.
    ("Elaborar el acta de cierre formal", ACTA_CIERRE_HH or 0.0, "humano"),
]

# ============================================================ ENTREGABLES FIJOS
#
# El WBS fijo depende de la clasificacion:
#   - Menor:      sin inception. Cierre = Implementación + Acta de Cierre.
#   - Intermedio: sin inception. Cierre = certificación, aceptación,
#                 Implementación, Estabilización y Acta de Cierre.
#   - Mayor:      inception completa y cierre completo.
# La construccion, en las tres clases, sale del task-tracker.
#
# En cambio, los entregables de CONSTRUCCION que van EN MEDIO se DERIVAN del
# task-tracker (INDICE-PROGRESO.md del registro AI-DLC activo), que genera la skill de
# seguimiento: su orden, nombres de tarea y filas de verificacion (VER-*) salen
# de ahi. Ver construir_entregables_construccion().
ENTREGABLES_FIJOS_INCEPCION = [
    ("Mob Elaboration", MOB_TAREAS),
    ("Modelo de la solución", MODELO_TAREAS),
    ("Arquitectura de la solución", ARQ_TAREAS),
    ("Habilitación del Entorno de Trabajo", ENTORNO_TAREAS),
]

ENTREGABLES_FIJOS_CIERRE = [
    ("Certificación Técnica Integral", CTI_TAREAS),
    ("Acompañamiento a la certificación funcional", CF_TAREAS),
    ("Implementación", IMPL_TAREAS),
    ("Estabilización", ESTAB_TAREAS),
    ("Acta de Cierre", CIERRE_TAREAS),
]

# Nombre de negocio del entregable por cada unidad del task-tracker. Vacio en la
# plantilla: cada proyecto mapea aqui sus unidades reales. Si una unidad no esta
# aqui, se usa su nombre legible como fallback (degradacion elegante), nunca un
# prefijo tecnico de unidad como UC-01. Formato:
#   { "<id-unidad-del-tracker>": "<Nombre de negocio del entregable>" }
UNIDAD_A_ENTREGABLE = {}

# Los prefijos UC-## identifican unidades de trabajo, pero no forman parte del
# nombre visible del entregable. Se conservan los IDs del tracker en sus
# columnas propias para trazabilidad.
PREFIJO_UNIDAD_RE = re.compile(r"^\s*UC-(\d{2})\s*[-:.)]?\s*", re.IGNORECASE)


def nombre_entregable_desde_unidad(unidad):
    """Devuelve el nombre visible sin prefijos técnicos UC-##.

    La unidad original sigue disponible para el join con el tracker; únicamente
    se evita que un identificador técnico contamine el WBS visible.
    """
    unidad_original = str(unidad or "").strip()
    prefijo = PREFIJO_UNIDAD_RE.match(unidad_original)
    unidad_sin_prefijo = PREFIJO_UNIDAD_RE.sub("", unidad_original).strip()
    if not unidad_sin_prefijo:
        if prefijo:
            return f"Unidad de construccion {prefijo.group(1)}"
        return unidad_original
    return UNIDAD_A_ENTREGABLE.get(
        unidad_original,
        UNIDAD_A_ENTREGABLE.get(unidad_sin_prefijo, unidad_sin_prefijo),
    )


def categoria_tarea(nombre):
    """Heuristica: infiere la categoria de esfuerzo desde el nombre de la tarea.

    El task-tracker no trae la categoria (basica/media/compleja/tests/...); se
    deduce del nombre para asignar HH_generacion y HH_supervision. Fallback:
    'media'. Las filas VER-* del tracker se tratan aparte (verif_humana).
    """
    n = nombre.lower()
    # Verificacion tecnica (fila "Verificacion: ..." dentro de la unidad)
    if n.startswith("verificaci") or "verificacion:" in n or "verificación:" in n:
        return "verif"
    if "test" in n or "vitest" in n or "pytest" in n or "pruebas unitarias" in n:
        return "tests"
    if ("evidencia" in n or "screenshot" in n or "captura" in n
            or "reporte de prueba" in n or "resultados y evidencias" in n):
        return "doc_evidencia"
    if ("manual" in n or "flujo" in n or "regla" in n
            or "hallazgo" in n or "documentacion final" in n
            or "documentación final" in n):
        return "doc_funcional"
    if "document" in n or n.startswith("doc ") or "runbook" in n:
        return "doc_tecnica"
    if "seguimiento y" in n or "gestion del entregable" in n or "gestión del entregable" in n:
        return "gestion"
    if "dashboard" in n or "kpi" in n or "reporte" in n or "proyeccion" in n or "proyección" in n:
        return "dashboard"
    # Complejas: patrones sin solucion trivial (motor, asistentes, transacciones)
    complejas = ("baserepository", "wizard", "asistente", "precedence", "precedencia",
                 "materializ", "override", "expression_evaluator", "evaluador de expresiones",
                 "transaccion atomica", "transacción atómica", "score", "cascada", "overlap",
                 "solapamiento")
    if any(k in n for k in complejas):
        return "compleja"
    # Setup/estructura/config: basica
    basicas = ("setup", "estructura de carpetas", "samconfig", "requirements.txt",
               "script de deploy", "health check", "router", "toggle", "listparameters",
               "listfilterablefields", "clock", "handlers lambda", "handler ")
    if any(k in n for k in basicas):
        return "basica"
    return "media"


def hh_trad_referencia(tipo):
    """HH tradicional de referencia por categoria (solo para calcular ahorro y
    la supervision de categorias humanas). Valor tipico por banda."""
    return {
        "basica": 5, "media": 8, "compleja": 12, "dashboard": 8,
        "tests": 12, "verif": 5, "doc_tecnica": 4,
        "doc_funcional": 4, "doc_evidencia": 4, "gestion": 3,
    }.get(tipo, 8)


def construir_entregables_construccion(tracker_unidades):
    """Construye los entregables de CONSTRUCCION desde el task-tracker.

    `tracker_unidades` es la salida de parse_tracker_unidades(): lista ordenada
    de dicts {unidad, tareas:[{id,nombre,estado}], verif:{id,nombre}|None}.

    Devuelve lista de tuplas (nombre, tareas, verif_meta):
      - `tareas`: [(nombre, hh_trad, tipo)] derivadas de las filas del tracker
        (excluye la fila VER-*, que se modela como verificacion humana aparte).
      - `verif_meta`: {"nombre":..., "id_tracker":...} de la fila VER-* real, o
        None si la unidad no tiene fila de verificacion.
    """
    entregables = []
    for u in tracker_unidades:
        nombre_ent = nombre_entregable_desde_unidad(u["unidad"])
        tareas = []
        for t in u["tareas"]:
            tipo = categoria_tarea(t["nombre"])
            # 4to elemento: fechas reales del tracker (o None) para el modo
            # "fechas reales" del scheduler de construccion.
            reales = {"inicio": t.get("inicio"), "fin": t.get("fin")}
            tareas.append((t["nombre"], hh_trad_referencia(tipo), tipo, reales))
        verif = u.get("verif")
        verif_meta = None
        if verif:
            verif_meta = {"nombre": verif["nombre"], "id_tracker": verif["id"],
                          "inicio": verif.get("inicio"), "fin": verif.get("fin")}
        entregables.append((nombre_ent, tareas, verif_meta))
    return entregables


# Entregables que NO deben llevar la tarea "Realizar el seguimiento y la gestion
# del entregable". Son las fases finales de cierre/estabilizacion, donde esa
# tarea de gestion no aplica. La salvaguarda de _quitar_tarea_gestion() la elimina
# aunque venga de una lista fija o del task-tracker.
ENTREGABLES_SIN_GESTION = {
    "Acompanamiento a la certificacion funcional",
    "Implementacion",
    "Estabilizacion",
    "Acta de Cierre",
}

# HH de respaldo para la tarea de gestion cuando una unidad del tracker no la
# trae. Si el tracker ya trae la tarea, se conserva su valor real.
GESTION_HH_POR_ENTREGABLE = {
    "Mob Elaboration": 2,
    "Modelo de la solucion": 2,
    "Arquitectura de la solucion": 3,
    "Habilitacion del Entorno de Trabajo": 1,
    "Certificacion Tecnica Integral": 4,
}


def hh_gestion_entregable(nombre):
    """Devuelve HH de gestion de respaldo dentro del rango normativo 1-4."""
    return max(1, min(4, GESTION_HH_POR_ENTREGABLE.get(nombre, 1)))


def _es_tarea_seguimiento_entregable(tarea):
    """True si la tarea es especificamente la de seguimiento y gestion del entregable."""
    nombre = str(tarea[0]).lower()
    return ("seguimiento y la gestion" in nombre
            or "seguimiento y la gestión" in nombre
            or "gestion del entregable" in nombre
            or "gestión del entregable" in nombre)


def _es_tarea_gestion(tarea):
    """True si la tarea es de gestion, coordinacion o enlace humano (no agentica)."""
    nombre = str(tarea[0]).lower()
    tipo = tarea[2] if len(tarea) > 2 else ""
    return (tipo in ("gestion", "enlace_soporte")
            or _es_tarea_seguimiento_entregable(tarea)
            or nombre.startswith("contactar al área")
            or nombre.startswith("contactar al area"))


def _asegurar_tarea_gestion(entregables):
    """Garantiza una sola tarea de gestion en inception y construccion.

    El tracker es la fuente primaria de HH cuando trae la tarea. Si no la trae,
    se agrega con el valor variable de respaldo del entregable. Las exenciones
    de cierre nunca reciben esta tarea.
    """
    resultado = []
    for entregable in entregables:
        nombre = entregable[0]
        tareas = list(entregable[1])
        gestion_presente = False
        tareas_normalizadas = []
        for tarea in tareas:
            if _es_tarea_seguimiento_entregable(tarea):
                if gestion_presente:
                    continue
                gestion_presente = True
            tareas_normalizadas.append(tarea)
        tareas = tareas_normalizadas
        if nombre not in ENTREGABLES_SIN_GESTION and not gestion_presente:
            tareas.append((
                "Realizar el seguimiento y la gestión del entregable",
                hh_gestion_entregable(nombre),
                "gestion",
            ))
        if len(entregable) == 3:
            resultado.append((nombre, tareas, entregable[2]))
        else:
            resultado.append((nombre, tareas))
    return resultado


def _quitar_tarea_gestion(entregables):
    """Elimina la tarea de gestion de los entregables en ENTREGABLES_SIN_GESTION.

    Actua sobre cualquier fuente (listas fijas o entregables derivados del
    tracker), de forma que el requisito quede garantizado aunque el WBS de origen
    la incluya.
    """
    resultado = []
    for entregable in entregables:
        # Entregable puede ser (nombre, tareas) o (nombre, tareas, verif_meta).
        nombre = entregable[0]
        tareas = entregable[1]
        if nombre in ENTREGABLES_SIN_GESTION:
            tareas = [t for t in tareas if not _es_tarea_seguimiento_entregable(t)]
        if len(entregable) == 3:
            resultado.append((nombre, tareas, entregable[2]))
        else:
            resultado.append((nombre, tareas))
    return resultado


def entregables_fijos_de_la_clase():
    """Devuelve (inception, cierre) segun la clasificacion confirmada."""
    if CLASIFICACION == "menor":
        return [], [
            ("Implementación", IMPL_TAREAS),
            ("Acta de Cierre", CIERRE_TAREAS),
        ]
    if CLASIFICACION == "intermedio":
        return [], [
            ("Certificación Técnica Integral", CTI_TAREAS),
            ("Acompañamiento a la certificación funcional", CF_TAREAS),
            ("Implementación", IMPL_TAREAS),
            ("Estabilización", ESTAB_TAREAS),
            ("Acta de Cierre", CIERRE_TAREAS),
        ]
    return list(ENTREGABLES_FIJOS_INCEPCION), list(ENTREGABLES_FIJOS_CIERRE)


def normalizar_dependencia_externa(dep):
    """Valida y normaliza un elemento de dependencias_externas."""
    if not isinstance(dep, dict):
        raise ValueError(f"Dependencia externa invalida (se esperaba dict): {dep}")
    area = str(dep.get("area") or "").strip()
    necesidad = str(dep.get("necesidad") or "").strip()
    if not area:
        raise ValueError(f"Dependencia externa sin 'area': {dep}")
    if not necesidad:
        raise ValueError(f"Dependencia externa en '{area}' sin 'necesidad': {dep}")
    contacto = str(dep.get("contacto") or "").strip()
    estado_raw = str(dep.get("estado") or "pendiente").strip().lower()
    if estado_raw in {"en gestion", "en gestión", "gestion", "gestión"}:
        estado = "en gestión"
    elif estado_raw in {"resuelta", "resuelto", "completada", "cerrada"}:
        estado = "resuelta"
    else:
        estado = "pendiente"
    bloquea = str(dep.get("bloquea") or "").strip() or None
    return {
        "area": area,
        "necesidad": necesidad,
        "contacto": contacto,
        "estado": estado,
        "bloquea": bloquea,
    }


# Directorio canonico de las UNICAS areas de soporte que la skill puede
# recomendar contactar. Cualquier deteccion (declarada, por perfil o por
# contenido del WBS) debe resolverse a una de estas seis areas; no se inventan
# otras. Cada entrada define la necesidad tipica y el contacto por defecto del
# directorio institucional "Responsables por Servicio" (ver SKILL.md).
#   clave  : identificador estable del area (para dedupe y mapeos)
#   area   : nombre visible que se escribe en el plan y en la hoja Resumen
AREAS_SOPORTE = {
    "base_datos": {
        "area": "Base de datos",
        "necesidad": "Aprovisionar motor, esquema, usuarios y accesos",
        "contacto": "Alfredo Cobis (Base de Datos)",
    },
    "infraestructura": {
        "area": "Infraestructura",
        "necesidad": "VPC, subredes, instancias, balanceadores y DNS",
        "contacto": "Javier Escobar (Arquitectura y Despliegue)",
    },
    "aws": {
        "area": "AWS / Nube",
        "necesidad": "Cuenta, roles IAM, servicios gestionados, costos y limites",
        "contacto": "Jose Rojas / Victor Nuñez (AWS)",
    },
    "comunicaciones": {
        "area": "Comunicaciones / Redes",
        "necesidad": "Reglas de firewall, VPN, puertos y enlaces entre sedes",
        "contacto": "Carlos Lecuna (Redes y Comunicaciones)",
    },
    "seguridad": {
        "area": "Seguridad",
        "necesidad": "Revision de accesos, secretos y controles",
        "contacto": "Cesar Madrigal / Wilfredo Hurtado (Seguridad)",
    },
    "proveedor": {
        "area": "Proveedor / Terceros",
        "necesidad": "Altas, credenciales, cuotas y SLA del servicio",
        "contacto": "Proveedor externo",
    },
}


def _dependencia_de_area(clave):
    """Construye una dependencia externa por defecto para un area del directorio."""
    datos = AREAS_SOPORTE[clave]
    return {
        "area": datos["area"],
        "necesidad": datos["necesidad"],
        "contacto": datos["contacto"],
        "estado": "pendiente",
        "bloquea": None,
    }


def derivar_dependencias_desde_perfil(profile_path=None):
    """Deriva dependencias externas por defecto desde .intelix/project-profile.json."""
    if profile_path is None:
        candidatos = [
            _ROOT / ".intelix" / "project-profile.json",
            Path.cwd() / ".intelix" / "project-profile.json",
        ]
        profile_path = next((p for p in candidatos if p.is_file()), None)
    else:
        profile_path = Path(profile_path)
        if not profile_path.is_file():
            profile_path = None

    if not profile_path:
        return []

    try:
        data = json.loads(profile_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []

    infra_raw = data.get("infrastructure")
    if not infra_raw or not isinstance(infra_raw, list):
        return []

    infra = [str(item).strip().lower() for item in infra_raw]
    if "none" in infra and len(infra) == 1:
        return []

    derivadas = []
    areas_vistas = set()

    def _agregar(clave):
        if clave not in areas_vistas:
            areas_vistas.add(clave)
            derivadas.append(_dependencia_de_area(clave))

    # rds o base de datos
    if "rds" in infra:
        _agregar("base_datos")

    # serverless, ec2, on-premise
    if any(k in infra for k in ("serverless", "ec2", "on-premise")):
        _agregar("infraestructura")

    # serverless, rds, ec2 (AWS)
    if any(k in infra for k in ("serverless", "rds", "ec2")):
        _agregar("aws")

    # external-saas
    if "external-saas" in infra:
        _agregar("proveedor")

    # undecided: decision de infraestructura pendiente que bloquea el dimensionamiento
    if "undecided" in infra:
        _agregar("infraestructura")

    return derivadas


# Señales lexicas por area de soporte. Se buscan como subcadenas normalizadas
# (sin acentos, minusculas) en los nombres de unidades y tareas del WBS. Solo se
# mapean a las SEIS areas del directorio AREAS_SOPORTE; no se infieren otras.
SENALES_AREA_CONTENIDO = {
    "base_datos": (
        "base de datos", "bd ", " bd", "rds", "postgres", "mysql", "oracle",
        "sql server", "esquema", "tabla", "tablas", "migracion de datos",
        "migraciones", "stored procedure", "procedimiento almacenado", "dynamodb",
    ),
    "infraestructura": (
        "infraestructura", "servidor", "servidores", "vpc", "subred", "subredes",
        "balanceador", "load balancer", "dns", "ec2", "on-premise", "on premise",
        "despliegue", "deploy", "kubernetes", "contenedor", "docker", "terraform",
        "iac", "pipeline", "ci/cd", "cicd",
    ),
    "aws": (
        "aws", "nube", "cloud", "lambda", "s3", "bucket", "iam", "cloudfront",
        "api gateway", "glue", "serverless", "cloudwatch", "sqs", "sns",
    ),
    "comunicaciones": (
        "firewall", "vpn", "red ", " red", "redes", "puerto", "puertos",
        "enlace", "enlaces", "comunicacion", "comunicaciones", "proxy",
        "conectividad", "sede", "sedes",
    ),
    "seguridad": (
        "seguridad", "secreto", "secretos", "credencial", "credenciales",
        "cifrado", "encriptacion", "dato sensible", "datos sensibles",
        "cumplimiento", "oauth", "autenticacion", "autorizacion", "certificado",
        "ssl", "tls", "vulnerabilidad", "auditoria de accesos",
    ),
    "proveedor": (
        "proveedor", "tercero", "terceros", "saas", "api externa",
        "servicio externo", "integracion externa", "pasarela de pago",
        "gateway de pago", "webhook externo",
    ),
}


def _texto_wbs_de_unidades(unidades):
    """Extrae y normaliza el texto del WBS (nombres de unidad y de tarea)."""
    if not unidades:
        return ""
    partes = []
    for u in unidades:
        if not isinstance(u, dict):
            continue
        partes.append(str(u.get("unidad") or ""))
        for t in u.get("tareas") or []:
            if isinstance(t, dict):
                partes.append(str(t.get("nombre") or ""))
    # _norm colapsa espacios y pasa a minusculas; quitamos acentos para el match.
    texto = _norm(" ".join(partes))
    return texto.translate(str.maketrans("áéíóúñ", "aeioun"))


def derivar_dependencias_desde_contenido(unidades):
    """Deriva areas de soporte a partir del CONTENIDO del WBS (unidades/tareas).

    Escanea los nombres de unidades y tareas en busca de señales lexicas de cada
    una de las seis areas de soporte. Devuelve una dependencia por area detectada,
    con contacto y necesidad por defecto del directorio. No reemplaza las fuentes
    declaradas ni el perfil: su salida se FUSIONA aparte (ver fusionar_dependencias).
    """
    texto = _texto_wbs_de_unidades(unidades)
    if not texto:
        return []
    detectadas = []
    for clave, senales in SENALES_AREA_CONTENIDO.items():
        if any(s in texto for s in senales):
            detectadas.append(_dependencia_de_area(clave))
    return detectadas


def _clave_area(area):
    """Resuelve el nombre visible de un area a su clave en AREAS_SOPORTE.

    Permite deduplicar entre fuentes aunque el texto difiera (p. ej. "Base de
    Datos" vs "Base de datos"). Si no coincide con el directorio, devuelve el
    nombre normalizado como clave propia (areas declaradas a mano fuera de las
    seis canonicas siguen respetandose).
    """
    area_norm = _norm(area).translate(str.maketrans("áéíóúñ", "aeioun"))
    if "base de datos" in area_norm:
        return "base_datos"
    if "infraestructura" in area_norm or "servidor" in area_norm:
        return "infraestructura"
    if "aws" in area_norm or "nube" in area_norm or "cloud" in area_norm:
        return "aws"
    if "comunicacion" in area_norm or "red" in area_norm:
        return "comunicaciones"
    if "seguridad" in area_norm:
        return "seguridad"
    if "proveedor" in area_norm or "tercero" in area_norm:
        return "proveedor"
    return area_norm


def fusionar_dependencias(*listas):
    """Fusiona varias listas de dependencias externas, deduplicando por area.

    La PRECEDENCIA es el orden de los argumentos: la primera lista gana sobre las
    siguientes para una misma area. Asi, las dependencias declaradas o derivadas
    del perfil (de mayor prioridad) nunca son pisadas por las detectadas por
    contenido del WBS, que solo AGREGAN las areas que falten.
    """
    resultado = []
    vistas = set()
    for lista in listas:
        for dep in lista or []:
            clave = _clave_area(dep.get("area"))
            if clave in vistas:
                continue
            vistas.add(clave)
            resultado.append(dep)
    return resultado


def nombre_tarea_enlace_soporte(dep):
    """Genera el nombre normativo RAE para la tarea temprana de enlace."""
    area = str(dep.get("area") or "").strip()
    area_norm = _norm(area)
    if "base de datos" in area_norm:
        return "Contactar al área de Base de Datos y acordar el aprovisionamiento"
    if "infraestructura" in area_norm or "servidor" in area_norm:
        return "Contactar al área de Infraestructura y acordar VPC, redes y servidores"
    if "aws" in area_norm or "nube" in area_norm or "cloud" in area_norm:
        return "Contactar al área de AWS / Nube y acordar cuentas, roles y servicios"
    if "comunicaci" in area_norm or "red" in area_norm:
        return "Contactar al área de Comunicaciones y acordar reglas de firewall y enlaces"
    if "seguridad" in area_norm:
        return "Contactar al área de Seguridad y acordar revisión de accesos y controles"
    if "proveedor" in area_norm or "tercero" in area_norm:
        return "Contactar a Proveedor / Terceros y acordar credenciales y cuotas"
    necesidad = str(dep.get("necesidad") or "").strip()
    if necesidad:
        necesidad_corta = necesidad[:40].rstrip()
        return f"Contactar al área de {area} y coordinar {necesidad_corta.lower()}"
    return f"Contactar al área de {area} y coordinar requerimientos tempranos"


def inyectar_tareas_enlace_soporte(entregables, dependencias_externas):
    """Inserta las tareas tempranas de enlace de soporte en el entregable correspondiente."""
    if not dependencias_externas:
        return entregables

    tareas_enlace = []
    for dep in dependencias_externas:
        nombre_tarea = _corregir_nombre_tarea_plan(nombre_tarea_enlace_soporte(dep))
        tareas_enlace.append((nombre_tarea, 1.0, "enlace_soporte"))

    resultado = []
    insertadas = False

    # En Mayor: buscar 'Habilitación del Entorno de Trabajo'
    for entregable in entregables:
        nombre = entregable[0]
        tareas = list(entregable[1])
        verif_meta = entregable[2] if len(entregable) == 3 else None

        if _norm(nombre) == _norm("Habilitación del Entorno de Trabajo") and not insertadas:
            nuevas_tareas = tareas_enlace + [t for t in tareas if t[0] not in {te[0] for te in tareas_enlace}]
            item = (nombre, nuevas_tareas, verif_meta) if verif_meta is not None else (nombre, nuevas_tareas)
            resultado.append(item)
            insertadas = True
        else:
            resultado.append(entregable)

    # Si no hubo 'Habilitación del Entorno de Trabajo' (Intermedio o Menor):
    # como primera tarea del plan (en el primer entregable)
    if not insertadas and resultado:
        primer_ent = resultado[0]
        nombre = primer_ent[0]
        tareas = list(primer_ent[1])
        verif_meta = primer_ent[2] if len(primer_ent) == 3 else None
        nuevas_tareas = tareas_enlace + [t for t in tareas if t[0] not in {te[0] for te in tareas_enlace}]
        resultado[0] = (nombre, nuevas_tareas, verif_meta) if verif_meta is not None else (nombre, nuevas_tareas)
        insertadas = True
    elif not insertadas and not resultado:
        resultado.append(("Habilitación y enlaces de soporte", tareas_enlace))

    return resultado


def vincular_bloqueos_dependencias_externas(entregables, dependencias_externas):
    """Registra en DEPENDENCIAS el bloqueo hacia el entregable correspondiente."""
    global DEPENDENCIAS
    if not dependencias_externas or not entregables:
        return
    nombre_origen = entregables[0][0]
    for e in entregables:
        if _norm(e[0]) == _norm("Habilitación del Entorno de Trabajo"):
            nombre_origen = e[0]
            break
    origen_norm = _norm(nombre_origen)

    nombres_plan = [e[0] for e in entregables]
    for dep in dependencias_externas:
        bloquea = dep.get("bloquea")
        if not bloquea:
            continue
        bloquea_norm = _norm(bloquea)
        destino = next((n for n in nombres_plan if _norm(n) == bloquea_norm), None)
        if not destino:
            destino = next((n for n in nombres_plan if bloquea_norm in _norm(n) or _norm(n) in bloquea_norm), None)
        destino_norm = _norm(destino) if destino else bloquea_norm

        if destino_norm != origen_norm:
            if destino_norm not in DEPENDENCIAS:
                DEPENDENCIAS[destino_norm] = []
            if origen_norm not in DEPENDENCIAS[destino_norm]:
                DEPENDENCIAS[destino_norm].append(origen_norm)


def construir_entregables(tracker_unidades, dependencias_externas=None):
    """Ensambla el WBS: elementos fijos de la clase + construccion del tracker.

    Si no hay unidades en el tracker, la construccion queda vacia, sin romper
    la generacion.
    """
    if dependencias_externas is None:
        dependencias_externas = DEPENDENCIAS_EXTERNAS
    construccion = construir_entregables_construccion(tracker_unidades)
    inception, cierre = entregables_fijos_de_la_clase()
    entregables = inception + construccion + cierre
    entregables = inyectar_tareas_enlace_soporte(entregables, dependencias_externas)
    # Garantiza gestion en inception/construccion y luego aplica las exenciones.
    entregables = _asegurar_tarea_gestion(entregables)
    return _quitar_tarea_gestion(entregables)


# ============================================================ MODELO DE ESFUERZO
def hh_generacion(tipo):
    return GEN_HH.get(tipo, 0.0)


def hh_supervision(tipo, hh_trad):
    """HH de supervision humana por tarea.

    Para categorias con supervision fija (SUP_HH), se usa ese valor + margen de
    re-trabajo. Para categorias humanas/discovery/despliegue/etc. (SUP_HH None),
    la supervision ES el trabajo humano, calibrado con un factor sobre HH_trad.
    """
    if tipo in DOC_TOTAL_HH:
        # El total normativo ya incorpora el margen de retrabajo; la
        # supervision es el remanente despues de la generacion.
        objetivo = DOC_TOTAL_HH[tipo]
        gen = hh_generacion(tipo)
        return round(objetivo - gen, 2)

    fijo = SUP_HH.get(tipo, None)
    if fijo is not None:
        return round(fijo * (1 + REWORK_FACTOR), 2)

    # categorias sin valor fijo: el humano hace el trabajo con aceleracion IA
    factores_humano = {
        "humano": 1.0,        # diseno/UAT/cierre: 1:1 sin aceleracion
        "discovery": 0.40,    # discovery con IA
        "despliegue": 0.20,
        "implementacion": 0.20,
        "cti": 0.25,          # pruebas y refactor
        "gestion": 1.0,       # coordinacion/documentacion sin aceleracion IA
        "enlace_soporte": 1.0,# enlace temprano con areas de soporte
    }
    f = factores_humano.get(tipo, 1.0)
    return round(hh_trad * f, 2)


def hh_total_tarea(tipo, hh_trad):
    return round(hh_generacion(tipo) + hh_supervision(tipo, hh_trad), 2)


# ============================================================ RESOLUCION DE FASES
#
# La estimacion se ancla a las fechas REALES de las fases AI-DLC:
#   - Inicio de inception  -> aidlc-state.md, campo "Start Date" (solo lectura).
#   - Fin de inception     -> estimacion-fases.json, "inception_fin_real".
#   - Inicio de construccion -> estimacion-fases.json, "construccion_inicio_real".
#
# Flujo pedido:
#   1. Al inicio (inception en curso): estimacion INICIAL APROXIMADA, todo
#      anclado al inicio real de inception; la construccion se estima como
#      continuacion (sin fecha real todavia).
#   2. Al marcar el fin de inception: se registra la fecha real y, si aun no se
#      conocen, se SOLICITAN la fecha de inicio de construccion, el total de
#      recursos y el % de dedicacion. La estimacion no se congela hasta tenerlos.
#   3. Con todo resuelto: estimacion con dos anclas reales.

def _parse_fecha(valor):
    """Acepta ISO o DD/MM/YYYY. None si esta vacio o es un placeholder."""
    if not valor:
        return None
    s = str(valor).strip()
    if not s or s.lower() in {"null", "sin-timestamp", "en curso", "n/d", "na"} or s == "\u2014":
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return datetime.strptime(s, "%d/%m/%Y").date()
        except ValueError:
            return None


def leer_inicio_inception(state_path=AIDLC_STATE_PATH):
    """Lee 'Start Date' de aidlc-state.md (fecha real de inicio de inception)."""
    if not Path(state_path).exists():
        return START_DATE
    for linea in Path(state_path).read_text(encoding="utf-8").splitlines():
        m = re.search(r"\*\*Start Date\*\*:\s*(\S+)", linea)
        if m:
            f = _parse_fecha(m.group(1))
            if f:
                return f
    return START_DATE


def cargar_fases(fases_path=FASES_PATH):
    """Carga estimacion-fases.json. Devuelve dict con claves resueltas."""
    if not Path(fases_path).exists():
        return {}
    try:
        return json.loads(Path(fases_path).read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


class FaltanDatosConstruccion(Exception):
    """Se lanza cuando inception finalizo pero faltan datos de construccion."""
    def __init__(self, faltantes):
        self.faltantes = faltantes
        super().__init__("Faltan datos de la fase de construccion: " + ", ".join(faltantes))


def resolver_contexto(state_path=AIDLC_STATE_PATH, fases_path=FASES_PATH):
    """Resuelve fechas y recursos desde las fuentes reales.

    Devuelve (contexto, modo):
      modo = "aproximada"  -> inception en curso; estimacion inicial aproximada.
      modo = "completa"    -> inception finalizada y datos de construccion listos.

    Lanza FaltanDatosConstruccion si inception finalizo pero faltan la fecha de
    inicio de construccion, el total de recursos o su dedicacion.
    """
    inicio_inception = leer_inicio_inception(state_path)
    fases = cargar_fases(fases_path)

    inception_fin = _parse_fecha(fases.get("inception_fin_real"))
    construccion_inicio = _parse_fecha(fases.get("construccion_inicio_real"))
    # "personas" es el formato de asignacion. "seniors" se acepta como alias.
    personas = fases.get("personas")
    if personas is None:
        personas = fases.get("seniors")
    recursos = fases.get("recursos")
    recursos_efectivos = personas if (personas is not None) else recursos

    deps_ext_raw = fases.get("dependencias_externas")
    if deps_ext_raw is None:
        deps_ext_raw = _PCFG.get("dependencias_externas")

    if deps_ext_raw is not None and isinstance(deps_ext_raw, list):
        deps_ext = [normalizar_dependencia_externa(d) for d in deps_ext_raw]
    else:
        deps_ext = derivar_dependencias_desde_perfil()

    ctx = {
        "inicio_inception": inicio_inception,
        "inception_fin_real": inception_fin,
        "construccion_inicio_real": construccion_inicio,
        "recursos": recursos_efectivos,
        "lider": fases.get("lider_solicitud"),
        "responsable": fases.get("responsable_solicitud"),
        "dependencias": fases.get("dependencias") or {},
        "dependencias_externas": deps_ext,
        "modo_asignacion": fases.get("modo_asignacion", "por_entregable"),
        "roles_por_tarea": fases.get("roles_por_tarea") or {},
        "responsables_funcionales": (
            fases.get("responsables_funcionales")
            or _PCFG.get("responsables_funcionales")
            or fases.get("interlocutores_negocio")
            or []
        ),
    }

    # Inception aun en curso -> estimacion inicial aproximada
    if inception_fin is None:
        return ctx, "aproximada"

    # Inception finalizada -> se requieren los datos de construccion
    faltantes = []
    if construccion_inicio is None:
        faltantes.append("fecha de inicio de construccion (construccion_inicio_real)")
    if personas is not None:
        if not isinstance(personas, list) or len(personas) == 0:
            faltantes.append("lista de personas (personas)")
        else:
            for i, s in enumerate(personas, 1):
                if s.get("dedicacion") is None:
                    faltantes.append(f"dedicacion de la persona {i} ({s.get('nombre', '?')})")
                else:
                    try:
                        normalizar_dedicacion(s.get("dedicacion"))
                    except (TypeError, ValueError):
                        faltantes.append(f"dedicacion valida de la persona {i} ({s.get('nombre', '?')})")
                fecha_persona = s.get("fecha_inicio_participacion", s.get("fecha_inicio"))
                if fecha_persona and _parse_fecha(fecha_persona) is None:
                    faltantes.append(f"fecha de inicio valida de la persona {i} ({s.get('nombre', '?')})")
    elif not recursos or not isinstance(recursos, list) or len(recursos) == 0:
        faltantes.append("personas, su dedicacion y sus agentes (personas)")
    else:
        for i, r in enumerate(recursos, 1):
            if r.get("dedicacion") is None:
                faltantes.append(f"dedicacion del recurso {i} ({r.get('nombre', '?')})")
            else:
                try:
                    normalizar_dedicacion(r.get("dedicacion"))
                except (TypeError, ValueError):
                    faltantes.append(f"dedicacion valida del recurso {i} ({r.get('nombre', '?')})")
    lider = fases.get("lider_solicitud") or {}
    responsable = fases.get("responsable_solicitud") or {}
    personas_roles = personas if isinstance(personas, list) else []
    hay_lider_por_rol = any(_lista_roles(p) & ROLES_LIDER for p in personas_roles)
    hay_responsable_por_rol = any(
        _lista_roles(p) & ROLES_DOCUMENTACION for p in personas_roles
    )
    if not lider.get("nombre") and not hay_lider_por_rol:
        faltantes.append("lider de la solicitud (lider_solicitud.nombre o rol en personas)")
    elif lider.get("dedicacion") is not None:
        try:
            normalizar_dedicacion(lider.get("dedicacion"))
        except (TypeError, ValueError):
            faltantes.append("dedicacion valida del lider de la solicitud")
    if not responsable.get("nombre") and not hay_responsable_por_rol:
        faltantes.append("responsable de la solicitud (responsable_solicitud.nombre o rol en personas)")
    elif responsable.get("dedicacion") is not None:
        try:
            normalizar_dedicacion(responsable.get("dedicacion"))
        except (TypeError, ValueError):
            faltantes.append("dedicacion valida del responsable de la solicitud")
    if faltantes:
        raise FaltanDatosConstruccion(faltantes)

    return ctx, "completa"


def _rol_desde(datos, nombre_respaldo, rol):
    """Arma lider o responsable. La dedicacion omitida queda en 1.0."""
    datos = datos or {}
    nombre = datos.get("nombre") or nombre_respaldo or rol
    dedicacion = datos.get("dedicacion")
    return {
        "name": nombre,
        "role": rol,
        "roles": {_norm_rol(rol)},
        "dedication": normalizar_dedicacion(dedicacion) if dedicacion is not None else 1.0,
        "agentes": None,
        "ejecuta_desarrollo": False,
        "fecha_inicio": _fecha_participacion(datos),
        "entregables": set(),
        "especialidades": [],
        "cursor": 0.0,
        "ultima": None,
    }


def _persona_desde(datos, indice):
    """Convierte un item de personas/seniors/recursos en quien ejecuta."""
    asignacion = datos.get("asignacion") or {}
    tipo_asignacion = _norm_rol(asignacion.get("tipo") or "")
    entregables = asignacion.get("entregables", datos.get("entregables")) or []
    especialidades = asignacion.get(
        "especialidades", datos.get("especialidades", datos.get("especialidad"))
    ) or []
    if tipo_asignacion == "global":
        entregables = []
        especialidades = []
    if isinstance(entregables, str):
        entregables = [entregables]
    if isinstance(especialidades, str):
        especialidades = [especialidades]
    agentes = datos.get("agentes", 1)
    try:
        agentes = max(1, int(agentes))
    except (TypeError, ValueError):
        agentes = 1
    roles = _lista_roles(datos)
    if "ejecuta_desarrollo" in datos:
        ejecuta_desarrollo = bool(datos.get("ejecuta_desarrollo"))
    elif roles:
        ejecuta_desarrollo = bool(roles & ROLES_DESARROLLO)
    else:
        # Compatibilidad con personas antiguas sin roles declarados.
        ejecuta_desarrollo = True
        roles = {"desarrollador"}
    persona = {
        "name": datos.get("nombre") or f"Persona {indice}",
        "role": "",
        "roles": roles,
        "dedication": normalizar_dedicacion(datos.get("dedicacion", 1.0)),
        "agentes": agentes,
        "ejecuta_desarrollo": ejecuta_desarrollo,
        "fecha_inicio": _fecha_participacion(datos),
        "entregables": {_norm(n) for n in entregables if _norm(n)},
        "especialidades": [_norm(n) for n in especialidades if _norm(n)],
        "exclusivo": bool(asignacion.get(
            "exclusivo", datos.get("exclusivo", datos.get("responsable_exclusivo", False))
        )),
        "cursor": 0.0,
        "ultima": None,
    }
    persona["role"] = _texto_roles(persona)
    return persona


def _fecha_participacion(datos):
    valor = datos.get("fecha_inicio_participacion", datos.get("fecha_inicio"))
    fecha = _parse_fecha(valor)
    if valor and fecha is None:
        raise ValueError(
            f"Fecha de inicio invalida para {datos.get('nombre', 'participante')}: {valor}"
        )
    return fecha


def _agregar_rol(persona, rol):
    persona.setdefault("roles", set()).add(_norm_rol(rol))
    persona["role"] = _texto_roles(persona)
    return persona


def _actor_desde(datos, respaldo, rol, extras):
    """Resuelve un rol contra una persona existente para no duplicar capacidad."""
    datos = datos or {}
    nombre = datos.get("nombre") or respaldo or rol
    existente = next(
        (p for p in PERSONAS + extras if _norm(p.get("name")) == _norm(nombre)),
        None,
    )
    if existente is not None:
        if datos.get("dedicacion") is not None:
            declarada = normalizar_dedicacion(datos.get("dedicacion"))
            if abs(declarada - existente["dedication"]) > 1e-9:
                raise ValueError(
                    f"{nombre} tiene dedicaciones distintas entre persona y rol"
                )
        return _agregar_rol(existente, rol)
    actor = _rol_desde(datos, respaldo, rol)
    extras.append(actor)
    return actor


def _primera_persona_con_roles(roles):
    return next((p for p in PERSONAS if set(p.get("roles") or []) & set(roles)), None)


def aplicar_equipo(ctx):
    """Carga personas, lider, responsable y dependencias del contexto de fases."""
    global PERSONAS, LIDER, RESPONSABLE, DEPENDENCIAS, DEPENDENCIAS_EXTERNAS, MODO_ASIGNACION
    global ROLES_POR_TAREA, RESPONSABLES_FUNCIONALES
    recursos = ctx.get("recursos") or []
    if recursos and isinstance(recursos, list) and any("agentes" in r or "entregables" in r or "especialidades" in r for r in recursos):
        PERSONAS = [_persona_desde(r, i) for i, r in enumerate(recursos, 1)]
    elif recursos and isinstance(recursos, list):
        # Lista plana antigua: cada item con dedicacion es una persona con 1 agente.
        PERSONAS = [_persona_desde(r, i) for i, r in enumerate(recursos, 1)]
    else:
        PERSONAS = [_persona_desde({"nombre": "Persona 1", "dedicacion": 1.0, "agentes": 1}, 1)]

    nombres_personas = [_norm(p["name"]) for p in PERSONAS]
    duplicados = sorted({n for n in nombres_personas if nombres_personas.count(n) > 1})
    if duplicados:
        raise ValueError(
            "Cada persona debe aparecer una sola vez; usa 'roles' para acumular "
            "responsabilidades: " + ", ".join(duplicados)
        )

    lider_datos = ctx.get("lider") or {}
    responsable_datos = ctx.get("responsable") or {}
    lider_por_rol = _primera_persona_con_roles(ROLES_LIDER)
    responsable_por_rol = _primera_persona_con_roles(ROLES_DOCUMENTACION)
    if not lider_datos and lider_por_rol:
        lider_datos = {"nombre": lider_por_rol["name"]}
    if not responsable_datos and responsable_por_rol:
        responsable_datos = {"nombre": responsable_por_rol["name"]}
    extras = []
    LIDER = _actor_desde(lider_datos, LEADER, "lider_proyecto", extras)
    if not responsable_datos:
        responsable_datos = {"nombre": LIDER["name"]}
    RESPONSABLE = _actor_desde(
        responsable_datos, LIDER["name"], "responsable_documentacion", extras
    )

    DEPENDENCIAS = {}
    for clave, valor in (ctx.get("dependencias") or {}).items():
        if isinstance(valor, str):
            valor = [valor]
        if valor is None:
            valor = []
        DEPENDENCIAS[_norm(clave)] = [_norm(v) for v in valor if _norm(v)]
    modo = _norm(ctx.get("modo_asignacion") or "por_entregable").replace(" ", "_")
    if modo not in {"por_entregable", "por_tarea"}:
        raise ValueError("modo_asignacion debe ser 'por_entregable' o 'por_tarea'")
    MODO_ASIGNACION = modo
    ROLES_POR_TAREA = {}
    for clave, valor in (ctx.get("roles_por_tarea") or {}).items():
        valores = [valor] if isinstance(valor, str) else (valor or [])
        ROLES_POR_TAREA[_norm(clave)] = {_norm_rol(v) for v in valores if _norm_rol(v)}
    funcionales = ctx.get("responsables_funcionales") or ctx.get("interlocutores_negocio") or []
    if isinstance(funcionales, (str, dict)):
        funcionales = [funcionales]
    RESPONSABLES_FUNCIONALES = funcionales
    DEPENDENCIAS_EXTERNAS = list(ctx.get("dependencias_externas") or [])
    _derivar_pools()


def _acotada(persona, nombre_norm):
    """True si la ventana de la persona cubre el entregable, False si no, None si es general."""
    if persona["entregables"]:
        return nombre_norm in persona["entregables"]
    if persona["especialidades"]:
        return any(esp and esp in nombre_norm for esp in persona["especialidades"])
    return None


def _roles_requeridos(tarea):
    """Obtiene roles configurados por nombre exacto o por `tipo:<categoria>`."""
    if not tarea:
        return set()
    nombre = _norm(tarea[0])
    tipo = _norm(tarea[2] if len(tarea) > 2 else "")
    return set(ROLES_POR_TAREA.get(nombre) or ROLES_POR_TAREA.get(f"tipo:{tipo}") or [])


def _cumple_roles(persona, requeridos):
    if not requeridos:
        return bool(persona.get("ejecuta_desarrollo", True))
    return bool(set(persona.get("roles") or []) & set(requeridos))


def _candidatos(nombre, shells=None):
    """Personas elegibles; la exclusividad solo existe cuando se declara."""
    nombre_norm = _norm(nombre)
    acotados = []
    generales = []
    for persona in PERSONAS:
        requisitos = [
            _roles_requeridos(s["src"]) for s in (shells or [])
            if not s.get("gestion")
        ]
        habilitada_por_rol = any(r and _cumple_roles(persona, r) for r in requisitos)
        if not persona.get("ejecuta_desarrollo", True) and not habilitada_por_rol:
            continue
        marca = _acotada(persona, nombre_norm)
        if marca is None:
            generales.append(persona)
        elif marca:
            acotados.append(persona)
    exclusivos = [p for p in acotados if p.get("exclusivo")]
    if exclusivos:
        candidatos = exclusivos
    elif acotados:
        candidatos = acotados + generales
    else:
        candidatos = generales
    if MODO_ASIGNACION == "por_entregable" and shells:
        requisitos = [
            _roles_requeridos(s["src"]) for s in shells if not s.get("gestion")
        ]
        candidatos = [p for p in candidatos if all(_cumple_roles(p, r) for r in requisitos)]
    return candidatos


def _dueno_acta():
    """El responsable elabora el acta. Si tambien ejecuta, comparte su cursor."""
    encontrado = next(
        (p for p in PERSONAS if _norm(p["name"]) == _norm(RESPONSABLE["name"])),
        None,
    )
    return encontrado or RESPONSABLE


def _offset_fecha(dias_habiles, fecha):
    if fecha is None:
        return 0.0
    for i, dia in enumerate(dias_habiles):
        if dia >= fecha:
            return i * HOURS_PER_DAY
    return (len(dias_habiles) - 1) * HOURS_PER_DAY


def _inicio_disponible(persona, dias_habiles):
    return max(
        persona.get("cursor", 0.0),
        _offset_fecha(dias_habiles, persona.get("fecha_inicio")),
    )


def _deps_de(nombre, nombres):
    """Dependencias de un entregable. El cierre trae una cadena por defecto."""
    clave = _norm(nombre)
    if clave in DEPENDENCIAS:
        return list(DEPENDENCIAS[clave])
    if nombre in ENTREGABLES_INCEPCION:
        previos = [n for n in nombres if n in ENTREGABLES_INCEPCION and nombres.index(n) < nombres.index(nombre)]
        return [_norm(previos[-1])] if previos else []
    if nombre in CIERRE_ORDEN:
        idx = CIERRE_ORDEN.index(nombre)
        previos = [_norm(n) for n in CIERRE_ORDEN[:idx] if n in nombres]
        if previos:
            return [previos[-1]]
        return [_norm(n) for n in nombres if n not in CIERRE_ORDEN and n not in ENTREGABLES_INCEPCION]
    inception_en_lista = [n for n in nombres if n in ENTREGABLES_INCEPCION]
    if inception_en_lista:
        return [_norm(inception_en_lista[-1])]
    return []


def _etiqueta_recurso(nombre, tipo, entregable):
    """Texto de la columna de recursos. La persona verifica y sigue; el agente ejecuta."""
    rec = next((r for r in RESOURCES if r["name"] == nombre), None)
    ded = int(round((rec or {"dedication": 1.0})["dedication"] * 100))
    base = f"{nombre}[{ded}%]"
    if tipo in ("verif_humana", "gestion", "enlace_soporte") or entregable == "Acta de Cierre":
        return base
    n_ag = int((rec or {}).get("agentes") or 1)
    sufijo = "agente" if n_ag == 1 else f"{n_ag} agentes"
    return f"{base} + {sufijo}"


def _programar_fase(entregables, dias_habiles, results, id_counters, latencia_horas,
                    usar_fechas_reales=False):
    """Programa entregables en paralelo entre personas y en serie dentro de cada una.

    Un entregable cae en la persona cuya ventana lo cubre. Si nadie tiene ventana,
    cae en quien queda libre antes. Las tareas de esa persona avanzan en su cursor
    (o en sus agentes, si tiene mas de uno). La verificacion la hace la misma
    persona. El seguimiento lo ejecuta el lider y consume su disponibilidad. El
    acta la elabora el responsable de documentacion.
    """
    for recurso in RESOURCES:
        recurso["cursor"] = 0.0
        recurso["ultima"] = None

    nombres = [e[0] for e in entregables]
    por_nombre = {_norm(e[0]): e for e in entregables}
    deps_de = { _norm(n): _deps_de(n, nombres) for n in nombres }

    # IDs en el orden del WBS, antes de programar, para que la dependencia apunte
    # a una clave estable.
    preparados = {}
    for entregable in entregables:
        if len(entregable) == 3:
            nombre, tareas, verif_meta = entregable
        else:
            nombre, tareas = entregable
            verif_meta = None
        prefijo = prefijo_entregable(nombre)
        id_counters[prefijo] += 1
        id_ent = f"{prefijo}-{id_counters[prefijo]:03d}"
        cont = 0
        shells = []
        for tarea in tareas:
            cont += 1
            shells.append({
                "src": tarea,
                "id_jerarquico": f"{id_ent}-{cont:03d}",
                "gestion": _es_tarea_gestion(tarea),
            })
        verif_jid = None
        lleva_verif = verif_meta is not None and nombre not in VERIF_EXCLUIDOS
        if lleva_verif:
            cont += 1
            verif_jid = f"{id_ent}-{cont:03d}"
        preparados[_norm(nombre)] = {
            "nombre": nombre,
            "id_ent": id_ent,
            "shells": shells,
            "verif_meta": verif_meta,
            "verif_jid": verif_jid,
            "lleva_verif": lleva_verif,
        }

    completados = {}
    pendientes = list(nombres)
    guard = 0
    while pendientes:
        guard += 1
        if guard > 1000:
            raise FaltanDatosConstruccion(["ciclo en las dependencias de los entregables"])
        listos = [n for n in pendientes if all(d in completados for d in deps_de[_norm(n)])]
        if not listos:
            raise FaltanDatosConstruccion([
                "dependencias sin resolver: " + ", ".join(pendientes)
            ])
        mejor = None
        for nombre in listos:
            clave = _norm(nombre)
            fin_deps = max((completados[d]["fin"] for d in deps_de[clave]), default=0.0)
            if nombre == "Acta de Cierre":
                candidatos = [_dueno_acta()]
            else:
                candidatos = _candidatos(nombre, preparados[clave]["shells"])
            if not candidatos:
                raise FaltanDatosConstruccion([
                    f"quien hace '{nombre}' (ninguna persona cubre ese entregable)"
                ])
            for dueno in candidatos:
                inicio = max(_inicio_disponible(dueno, dias_habiles), fin_deps)
                prioridad_ventana = 0 if _acotada(dueno, clave) else 1
                # A igual arranque, la ventana declarada tiene prioridad. Una
                # persona general puede apoyar cuando la especialista no esta
                # libre, salvo que la ventana sea exclusiva.
                rank = (
                    inicio,
                    prioridad_ventana,
                    dueno.get("cursor", 0.0),
                    -float(dueno.get("dedication", 1.0)),
                    nombres.index(nombre),
                    dueno["name"],
                )
                if mejor is None or rank < mejor[0]:
                    mejor = (rank, nombre, dueno, fin_deps, list(candidatos))
        _, nombre, dueno, fin_deps, candidatos_entregable = mejor
        completados[_norm(nombre)] = _armar_entregable(
            preparados[_norm(nombre)], dueno, fin_deps, deps_de[_norm(nombre)],
            completados, dias_habiles, usar_fechas_reales,
            candidatos=candidatos_entregable if MODO_ASIGNACION == "por_tarea" else [dueno],
        )
        pendientes.remove(nombre)

    for nombre in nombres:
        results.append(completados[_norm(nombre)]["result"])


def _armar_entregable(prep, dueno, fin_deps, deps, completados, dias_habiles,
                      usar_fechas_reales, candidatos=None):
    """Fecha tareas por entregable o las distribuye entre personas elegibles."""
    nombre = prep["nombre"]
    candidatos = list(candidatos or [dueno])

    reales = []
    if usar_fechas_reales:
        for shell in prep["shells"]:
            src = shell["src"]
            rl = src[3] if len(src) > 3 else None
            if rl and rl.get("inicio"):
                reales.append(rl["inicio"])
    inicio_min = _offset_fecha(dias_habiles, min(reales)) if reales else 0.0
    base = max(
        min(_inicio_disponible(p, dias_habiles) for p in candidatos),
        fin_deps,
        inicio_min,
    )

    trabajo = [s for s in prep["shells"] if not s["gestion"]]
    gestion = [s for s in prep["shells"] if s["gestion"]]
    tareas_fecha = []
    ent_gen = ent_sup = ent_trad = ent_dur = 0.0

    # La coordinacion consume capacidad real. Si el lider tambien desarrolla,
    # ambas responsabilidades comparten el mismo cursor de la persona.
    for shell in gestion:
        src = shell["src"]
        t_nombre, t_hh_trad, t_tipo = src[0], src[1], src[2]
        g = hh_generacion(t_tipo)
        s = hh_supervision(t_tipo, t_hh_trad)
        total = round(g + s, 2)
        ded_lider = normalizar_dedicacion(LIDER.get("dedication", 1.0))
        h_ini = max(_inicio_disponible(LIDER, dias_habiles), fin_deps, inicio_min)
        h_fin = h_ini + total / ded_lider
        pred_jids = []
        ultima = LIDER.get("ultima")
        if ultima is not None and abs(ultima.get("h_fin", -1) - h_ini) < 1e-6:
            pred_jids.append(ultima["id_jerarquico"])
        if abs(h_ini - fin_deps) < 1e-6:
            pred_jids.extend(completados[d]["jid"] for d in deps if d in completados)
        fila = {
            "nombre": t_nombre, "hh_trad": t_hh_trad, "hh_gen": g, "hh_sup": s,
            "hh_total": total, "tipo": t_tipo, "id_jerarquico": shell["id_jerarquico"],
            "recurso": LIDER["name"], "pred_jids": list(dict.fromkeys(pred_jids)),
            "h_ini": h_ini, "h_fin": h_fin, "latencia_horas": 0, "id_tracker": "",
            "inicio": fecha_en_offset(dias_habiles, h_ini),
            "fin": fecha_fin_offset(dias_habiles, h_fin),
        }
        tareas_fecha.append(fila)
        LIDER["cursor"] = h_fin
        LIDER["ultima"] = fila
        ent_gen += g
        ent_sup += s
        ent_trad += t_hh_trad

    estados = {}
    for persona in candidatos:
        base_persona = max(
            _inicio_disponible(persona, dias_habiles), fin_deps, inicio_min
        )
        n_agentes = (max(1, int(persona.get("agentes") or 1))
                     if nombre != "Acta de Cierre" else 1)
        estados[persona["name"]] = {
            "persona": persona,
            "cursores": [base_persona] * n_agentes,
            "ultimos": [None] * n_agentes,
        }
    usados = set()
    prioridades_usadas = set()

    for shell in trabajo:
        src = shell["src"]
        t_nombre, t_hh_trad, t_tipo = src[0], src[1], src[2]
        g = hh_generacion(t_tipo)
        s = hh_supervision(t_tipo, t_hh_trad)
        total = round(g + s, 2)
        ent_gen += g
        ent_sup += s
        ent_trad += t_hh_trad
        ent_dur += total
        primer_inicio_disponible = min(
            min(estado["cursores"]) for estado in estados.values()
        )
        preferidos = [
            estado for estado in estados.values()
            if _acotada(estado["persona"], _norm(nombre))
            and estado["persona"]["name"] not in prioridades_usadas
            and min(estado["cursores"]) <= primer_inicio_disponible + 1e-6
        ]
        requeridos = _roles_requeridos(src)
        elegibles_rol = [
            estado for estado in estados.values()
            if _cumple_roles(estado["persona"], requeridos)
        ]
        preferidos = [estado for estado in preferidos if estado in elegibles_rol]
        disponibles = preferidos or elegibles_rol
        if not disponibles:
            roles_texto = ", ".join(sorted(requeridos)) or "desarrollo"
            raise FaltanDatosConstruccion([
                f"rol para la tarea '{t_nombre}' ({roles_texto}) en '{nombre}'"
            ])
        opciones = []
        for estado in disponibles:
            persona = estado["persona"]
            ded = normalizar_dedicacion(persona.get("dedication", 1.0))
            ia = min(range(len(estado["cursores"])), key=lambda k: estado["cursores"][k])
            h_ini_opcion = estado["cursores"][ia]
            opciones.append((h_ini_opcion + total / ded, h_ini_opcion,
                             PERSONAS.index(persona) if persona in PERSONAS else 999,
                             estado, ia, ded))
        _, h_ini, _, estado, ia, ded = min(opciones, key=lambda x: x[:3])
        persona = estado["persona"]
        h_fin = h_ini + (total / ded)
        estado["cursores"][ia] = h_fin
        usados.add(persona["name"])
        if estado in preferidos:
            prioridades_usadas.add(persona["name"])
        pred_jids = []
        anterior = estado["ultimos"][ia]
        if anterior is not None and abs(anterior["h_fin"] - h_ini) < 1e-6:
            pred_jids.append(anterior["id_jerarquico"])
        ultima = persona.get("ultima")
        if ultima is not None and abs(ultima.get("h_fin", -1) - h_ini) < 1e-6:
            if ultima["id_jerarquico"] not in pred_jids:
                pred_jids.append(ultima["id_jerarquico"])
        if abs(h_ini - fin_deps) < 1e-6:
            for dep in deps:
                jid = completados[dep]["jid"]
                if jid not in pred_jids:
                    pred_jids.append(jid)
        fila = {
            "nombre": t_nombre, "hh_trad": t_hh_trad, "hh_gen": g, "hh_sup": s,
            "hh_total": total, "tipo": t_tipo, "id_jerarquico": shell["id_jerarquico"],
            "recurso": persona["name"], "pred_jids": pred_jids,
            "h_ini": h_ini, "h_fin": h_fin, "latencia_horas": 0, "id_tracker": "",
            "inicio": fecha_en_offset(dias_habiles, h_ini),
            "fin": fecha_fin_offset(dias_habiles, h_fin),
        }
        estado["ultimos"][ia] = fila
        tareas_fecha.append(fila)

    for estado in estados.values():
        persona = estado["persona"]
        if persona["name"] in usados:
            persona["cursor"] = max(estado["cursores"])
            asignadas = [t for t in estado["ultimos"] if t is not None]
            if asignadas:
                persona["ultima"] = max(asignadas, key=lambda t: t["h_fin"])

    fin_trabajo = max(
        (t["h_fin"] for t in tareas_fecha if t.get("tipo") not in ("gestion", "enlace_soporte")),
        default=base,
    )
    verif_horas = 0.0
    verif_fin_offset = fin_trabajo
    verificador = dueno
    if prep["lleva_verif"]:
        verif_horas = round(VERIF_FACTOR * ent_dur, 2)
        h_ini = fin_trabajo
        revisores = [p for p in candidatos if p["name"] in usados] or [dueno]
        verificador = min(
            revisores,
            key=lambda p: (max(p.get("cursor", 0.0), h_ini)
                           + verif_horas / normalizar_dedicacion(p.get("dedication", 1.0)),
                           0 if p is dueno else 1),
        )
        ded_verificador = normalizar_dedicacion(verificador.get("dedication", 1.0))
        h_fin = h_ini + (verif_horas / ded_verificador if verif_horas else 0.0)
        verif_fin_offset = h_fin
        meta = prep["verif_meta"] or {}
        verif_nombre = meta.get("nombre") or f"Verificación técnica de {_corregir_nombre_entregable_plan(nombre)}"
        verif_nombre = verif_nombre.replace("Verificacion humana", "Verificación técnica")
        verif_nombre = verif_nombre.replace("Verificación humana", "Verificación técnica")
        verif_nombre = verif_nombre.replace("Verificacion tecnica", "Verificación técnica")
        pred_verif = [t["id_jerarquico"] for t in tareas_fecha if abs(t["h_fin"] - h_ini) < 1e-6]
        if not pred_verif and tareas_fecha:
            pred_verif = [tareas_fecha[-1]["id_jerarquico"]]
        fila = {
            "nombre": verif_nombre, "hh_trad": 0, "hh_gen": 0.0, "hh_sup": 0.0,
            "hh_total": verif_horas, "tipo": "verif_humana",
            "latencia_horas": verif_horas, "id_jerarquico": prep["verif_jid"],
            "id_tracker": meta.get("id_tracker", ""), "recurso": verificador["name"],
            "pred_jids": pred_verif, "h_ini": h_ini, "h_fin": h_fin,
            "inicio": fecha_en_offset(dias_habiles, h_ini),
            "fin": fecha_fin_offset(dias_habiles, h_fin),
        }
        tareas_fecha.append(fila)
        verificador["cursor"] = verif_fin_offset
        verificador["ultima"] = fila

    inicio_offset = min((t.get("h_ini", base) for t in tareas_fecha), default=base)
    fin_offset = max((t.get("h_fin", base) for t in tareas_fecha), default=verif_fin_offset)
    inicio_ent = fecha_en_offset(dias_habiles, inicio_offset)
    fin_ent = fecha_fin_offset(dias_habiles, fin_offset)
    if usar_fechas_reales and reales:
        inicio_ent = min(reales)

    # La gestion se muestra primero porque consume capacidad antes del trabajo;
    # asi la recalibracion de un borrador conserva el mismo calendario.
    orden = {s["id_jerarquico"]: i for i, s in enumerate(prep["shells"])}
    if prep["verif_jid"]:
        orden[prep["verif_jid"]] = len(prep["shells"]) + 1
    tareas_fecha.sort(key=lambda t: (
        0 if t.get("tipo") in ("gestion", "enlace_soporte") else 1,
        orden.get(t["id_jerarquico"], 0),
    ))
    # La verificacion queda despues del seguimiento en el orden de shells si el
    # seguimiento ya venia al final. Se fuerza verificacion al cierre de la lista.
    verificaciones = [t for t in tareas_fecha if t["tipo"] == "verif_humana"]
    resto = [t for t in tareas_fecha if t["tipo"] != "verif_humana"]
    tareas_fecha = resto + verificaciones

    lat_dias = int(round(VERIF_LATENCY_DIAS)) if prep["lleva_verif"] else 0
    fin_para_deps = fin_offset + lat_dias * HOURS_PER_DAY
    ultima_tarea = max(tareas_fecha, key=lambda t: t.get("h_fin", 0.0)) if tareas_fecha else None
    jid_dep = ultima_tarea["id_jerarquico"] if ultima_tarea else prep["id_ent"]
    pred_ent = [completados[d]["jid"] for d in deps if d in completados]

    result = {
        "nombre": nombre, "tareas": tareas_fecha, "id_jerarquico": prep["id_ent"],
        "hh_gen": round(ent_gen, 2), "hh_sup": round(ent_sup, 2),
        "hh_total": round(ent_gen + ent_sup, 2), "hh_trad": ent_trad,
        "latencia_horas": round(verif_horas, 2),
        "tiene_verificacion": prep["lleva_verif"],
        "inicio": inicio_ent, "fin": fin_ent, "pred_jids": pred_ent,
    }
    return {"fin": fin_para_deps, "jid": jid_dep, "result": result}


def schedule(entregables, inception_start, construction_start=None, latencia_horas=None):
    """Programa las fases anclando a las fechas reales.

    - Inception (ENTREGABLES_INCEPCION) siempre arranca en inception_start.
    - Construccion/operaciones (el resto):
        * Si construction_start is None (modo APROXIMADO, inception en curso):
          se estima como continuacion directa de inception, en la misma linea de
          dias habiles. Es una aproximacion inicial.
        * Si construction_start tiene fecha (modo COMPLETO): la construccion se
          re-ancla a esa fecha real, reflejando el arranque real de la fase.

    El esfuerzo por tarea = HH_generacion + HH_supervision, repartido entre los
    recursos con list-scheduling y su dedicacion individual. Las unidades de
    construccion suman ademas la latencia de verificacion humana.
    """
    if latencia_horas is None:
        latencia_horas = VERIF_CONFIG["fallback_horas"]

    vincular_bloqueos_dependencias_externas(entregables, DEPENDENCIAS_EXTERNAS)

    inception = [e for e in entregables if e[0] in ENTREGABLES_INCEPCION]
    construccion = [e for e in entregables if e[0] not in ENTREGABLES_INCEPCION]

    results = []
    # Contadores del ID jerarquico compartidos entre fases (numeracion continua)
    id_counters = {"EST": 0, "PAR": 0}

    if construction_start is None:
        # Aproximada: todo sobre una sola linea de dias habiles desde inception.
        dias = construir_dias_habiles(inception_start)
        _programar_fase(inception + construccion, dias, results, id_counters, latencia_horas)
    else:
        dias_inception = construir_dias_habiles(inception_start)
        dias_construccion = construir_dias_habiles(construction_start)
        _programar_fase(inception, dias_inception, results, id_counters, latencia_horas)
        # Construccion en modo "fechas reales": cada unidad usa sus fechas reales
        # del task-tracker; las unidades sin fecha real se encadenan estimadas.
        _programar_fase(construccion, dias_construccion, results, id_counters,
                        latencia_horas, usar_fechas_reales=True)

    return results


# ============================================================ TASK-TRACKER
TRACKER_PESOS = {
    "\u2b1c": 0.0, "\U0001f504": 0.0, "\U0001f7e1": 0.9,
    "\U0001f527": 0.9, "\u2705": 1.0,
}
TRACKER_OMITIDA = "\u23ed"
TRACKER_PATH = AI_DLC_LAYOUT.progress_index
# Fuente de respaldo de la CONSTRUCCION cuando NO hay task-tracker (cambios
# Menor/Intermedio hechos fuera del flujo /aidlc). Vive junto al script, igual
# que project-config.json y estimacion-fases.json. La escribe la skill de ficha
# al cerrar la ficha corta (volcado de las tres respuestas) o el usuario a mano.
# Ver parse_construccion_ficha() y resolver_construccion().
CONSTRUCCION_MENOR_PATH = Path(__file__).resolve().parent / "construccion-menor.json"
# Inverso de UNIDAD_A_ENTREGABLE: nombre de entregable -> unidad del tracker.
# Se deriva de UNIDAD_A_ENTREGABLE para no duplicar el mapeo y evitar desajustes.
ENTREGABLE_A_UNIDAD = {ent: uni for uni, ent in UNIDAD_A_ENTREGABLE.items()}
ENTREGABLE_OVERRIDE_PCT = {
    "Mob Elaboration": 100,
    "Modelo de la solucion": 100,
    "Arquitectura de la solucion": 100,
}


def parse_tracker(path=TRACKER_PATH):
    path = Path(path)
    if not path.exists():
        return {}
    resultados = {}
    unidad_actual = None
    suma_pesos = 0.0
    n_tareas = 0

    def cerrar():
        if unidad_actual is not None:
            resultados[unidad_actual] = (
                round(suma_pesos / n_tareas * 100) if n_tareas > 0 else 0
            )

    for linea in path.read_text(encoding="utf-8").splitlines():
        s = linea.strip()
        if s.startswith("## Unidad:"):
            cerrar()
            unidad_actual = s.split("## Unidad:", 1)[1].strip()
            suma_pesos = 0.0
            n_tareas = 0
            continue
        if unidad_actual is None or not s.startswith("|"):
            continue
        celdas = [c.strip() for c in s.strip("|").split("|")]
        if len(celdas) < 3:
            continue
        if celdas[0].upper() == "ID" or set(celdas[0]) <= {"-", ":"}:
            continue
        estado = celdas[2]
        if TRACKER_OMITIDA in estado:
            continue
        peso = None
        for simbolo, w in TRACKER_PESOS.items():
            if simbolo in estado:
                peso = w
                break
        if peso is None:
            continue
        suma_pesos += peso
        n_tareas += 1
    cerrar()
    return resultados


def pct_entregable(nombre, tracker):
    if nombre in ENTREGABLE_OVERRIDE_PCT:
        return ENTREGABLE_OVERRIDE_PCT[nombre]
    unidad = ENTREGABLE_A_UNIDAD.get(nombre)
    if unidad is None:
        return 0
    return tracker.get(unidad, 0)


def parse_tracker_unidades(path=TRACKER_PATH):
    """Lee INDICE-PROGRESO.md y devuelve las UNIDADES de construccion en orden.

    Cada unidad: {"unidad": <id>, "tareas": [{"id","nombre","estado"}...],
                  "verif": {"id","nombre"} | None}
    - Las filas cuyo ID empieza por 'VER-' se separan como la verificacion humana
      de la unidad (no entran en 'tareas').
    - Se preserva el ORDEN de aparicion de las unidades y de sus tareas.
    Devuelve [] si el indice no existe (la construccion queda vacia sin romper).
    """
    path = Path(path)
    if not path.exists():
        return []
    unidades = []
    actual = None
    for linea in path.read_text(encoding="utf-8").splitlines():
        s = linea.strip()
        if s.startswith("## Unidad:"):
            actual = {"unidad": s.split("## Unidad:", 1)[1].strip(),
                      "tareas": [], "verif": None}
            unidades.append(actual)
            continue
        # Cualquier OTRO header (p. ej. "## Avance por Historia", "## Resumen") o
        # el marcador de resumen de US cierra la unidad actual: las tablas que
        # siguen (historias, resumen) NO son tareas de la unidad.
        if s.startswith("#") or s.startswith("<!-- US-SUMMARY"):
            actual = None
            continue
        if actual is None or not s.startswith("|"):
            continue
        celdas = [c.strip() for c in s.strip("|").split("|")]
        if len(celdas) < 3:
            continue
        ident = celdas[0]
        if ident.upper() == "ID" or set(ident) <= {"-", ":"}:
            continue  # cabecera o separador
        nombre = celdas[1]
        estado = celdas[2]
        # Fechas reales del tracker (col 4 Inicio, col 5 Fin): ISO o '—'.
        ini_real = _parse_fecha(celdas[3]) if len(celdas) > 3 else None
        fin_real = _parse_fecha(celdas[4]) if len(celdas) > 4 else None
        if ident.upper().startswith("VER-"):
            actual["verif"] = {"id": ident, "nombre": nombre,
                               "inicio": ini_real, "fin": fin_real}
            continue
        actual["tareas"].append({"id": ident, "nombre": nombre, "estado": estado,
                                 "inicio": ini_real, "fin": fin_real})
    # Solo unidades con al menos una tarea de trabajo
    return [u for u in unidades if u["tareas"]]


# ============================================================ CONSTRUCCION SIN TRACKER
#
# Fuente de respaldo de la CONSTRUCCION para cambios Menor/Intermedio hechos
# FUERA del flujo /aidlc, donde no existe el task-tracker (INDICE-PROGRESO.md).
# La skill de ficha, al cerrar la ficha corta, vuelca las tres respuestas y el
# paquete de construccion en construccion-menor.json. parse_construccion_ficha()
# lo lee y devuelve la MISMA estructura que parse_tracker_unidades(), de modo que
# construir_entregables_construccion() y el resto del pipeline no cambian.
def _normalizar_paquetes_ficha(datos):
    """Normaliza el JSON a una lista de paquetes {entregable, tareas:[...]}.

    Acepta dos formas:
      - objeto unico:      {"entregable": "...", "tareas": [...]}
      - lista de paquetes: {"paquetes": [{"entregable": "...", "tareas": [...]}, ...]}
    Devuelve [] si no hay nada util.
    """
    if not isinstance(datos, dict):
        return []
    if isinstance(datos.get("paquetes"), list):
        crudos = datos["paquetes"]
    elif datos.get("entregable") or datos.get("tareas"):
        crudos = [datos]
    else:
        return []
    paquetes = []
    for p in crudos:
        if not isinstance(p, dict):
            continue
        entregable = str(p.get("entregable") or "").strip()
        tareas = [str(t).strip() for t in (p.get("tareas") or []) if str(t).strip()]
        if not entregable:
            continue
        if not tareas:
            # Degradacion elegante: paquete sin tareas -> minimo util para no
            # dejar el entregable vacio (implementacion + verificacion tecnica).
            tareas = [
                f"Implementar {entregable}",
                f"Verificacion tecnica de {entregable}",
            ]
        paquetes.append({"entregable": entregable, "tareas": tareas})
    return paquetes


def parse_construccion_ficha(path=CONSTRUCCION_MENOR_PATH):
    """Lee construccion-menor.json y devuelve UNIDADES de construccion.

    Misma forma que parse_tracker_unidades():
      [{"unidad": <entregable>,
        "tareas": [{"id","nombre","estado","inicio","fin"}...],
        "verif":  {"id","nombre","inicio","fin"} | None}]
    - Sin ID de tracker (cadena vacia): no hay join con seguimiento. El ID
      Jerarquico se genera por orden de aparicion, igual que con el tracker.
    - Una tarea cuyo nombre empiece por "verificaci" se separa como la fila de
      verificacion de la unidad (igual que las filas VER-* del tracker), para que
      el modelo de verificacion humana (VERIF_FACTOR) aplique sin cambios.
    Devuelve [] si el archivo no existe o no trae paquetes validos (mismo
    contrato de "vacio sin romper" que parse_tracker_unidades()).
    """
    path = Path(path)
    if not path.exists():
        return []
    try:
        datos = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    unidades = []
    for paquete in _normalizar_paquetes_ficha(datos):
        tareas = []
        verif = None
        for nombre in paquete["tareas"]:
            if nombre.lower().startswith("verificaci"):
                # Solo la primera tarea de verificacion define la fila VER-*; las
                # adicionales caen como tareas normales (categoria_tarea las
                # clasifica como 'verif' igualmente).
                if verif is None:
                    verif = {"id": "", "nombre": nombre, "inicio": None, "fin": None}
                    continue
            tareas.append({"id": "", "nombre": nombre, "estado": "\u2b1c",
                           "inicio": None, "fin": None})
        if tareas or verif:
            unidades.append({"unidad": paquete["entregable"], "tareas": tareas,
                             "verif": verif})
    # Solo unidades con al menos una tarea de trabajo (coherente con el tracker).
    return [u for u in unidades if u["tareas"]]


def _recorrido_corto_ficha(path=CONSTRUCCION_MENOR_PATH):
    """Devuelve el bloque de trazabilidad del recorrido corto (o {}).

    Acepta las claves bajo 'recorrido_corto' o en la raiz del JSON (objetivo,
    donde_vive, criterio_termino). Solo informativo: alimenta la hoja Resumen y
    no afecta las HH.
    """
    path = Path(path)
    if not path.exists():
        return {}
    try:
        datos = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    fuente = datos.get("recorrido_corto") if isinstance(datos, dict) else None
    if not isinstance(fuente, dict):
        fuente = datos if isinstance(datos, dict) else {}
    recorrido = {}
    for clave in ("objetivo", "donde_vive", "criterio_termino"):
        valor = str(fuente.get(clave) or "").strip()
        if valor:
            recorrido[clave] = valor
    return recorrido


def resolver_construccion():
    """Resuelve la fuente de la CONSTRUCCION con precedencia explicita.

    tracker (si tiene unidades) > ficha corta (construccion-menor.json) > vacia.
    Devuelve (unidades, fuente, recorrido) donde:
      - fuente in {"tracker","ficha","vacia"}
      - recorrido es el dict del recorrido corto (solo cuando fuente == "ficha").
    Con tracker presente, el fallback de la ficha nunca se activa: el camino
    AI-DLC existente no cambia.
    """
    # Se leen las rutas como globales (no como defaults de parametro) para que un
    # override en tiempo de ejecucion tome efecto de verdad.
    unidades = parse_tracker_unidades(TRACKER_PATH)
    if unidades:
        return unidades, "tracker", {}
    ficha = parse_construccion_ficha(CONSTRUCCION_MENOR_PATH)
    if ficha:
        return ficha, "ficha", _recorrido_corto_ficha(CONSTRUCCION_MENOR_PATH)
    return [], "vacia", {}


# ============================================================ CALIBRACION HIBRIDA (v11)
def _duracion_a_horas(texto):
    """Convierte 'HH:MM:SS' -> horas (float). None si no es una duracion valida.

    Ignora placeholders del tracker: '', '-', '—', 'sin-timestamp', 'null'.
    """
    if texto is None:
        return None
    s = str(texto).strip()
    if not s or s in {"-", "\u2014"} or s.lower() in {"sin-timestamp", "null", "n/d", "na"}:
        return None
    partes = s.split(":")
    if len(partes) != 3:
        return None
    try:
        h, m, seg = (int(p) for p in partes)
    except ValueError:
        return None
    return h + m / 60.0 + seg / 3600.0


def _mediana(valores):
    xs = sorted(valores)
    n = len(xs)
    if n == 0:
        return None
    mid = n // 2
    if n % 2 == 1:
        return xs[mid]
    return (xs[mid - 1] + xs[mid]) / 2.0


def leer_muestras_verificacion(path=None):
    """Lee del task-tracker las filas VER-* FINALIZADAS con duracion valida.

    Una muestra valida es una fila cuyo ID empieza por 'VER-', esta verificada
    (✅) y trae una duracion parseable en la columna Duracion. Se ignoran:
      - VER-* pendientes (⬜/🔄) o sin cerrar,
      - duracion '—', 'sin-timestamp', vacia o invalida,
      - inicio/fin no usados aqui (el tracker ya calcula la duracion).

    Devuelve lista de horas (float). Para v11 devuelve [] porque VER-INF esta
    cerrada pero su Duracion es '—' (sin duracion normalizada registrada).
    """
    if path is None:
        path = TRACKER_PATH
    path = Path(path)
    if not path.exists():
        return []
    muestras = []
    for linea in path.read_text(encoding="utf-8").splitlines():
        s = linea.strip()
        if not s.startswith("|"):
            continue
        celdas = [c.strip() for c in s.strip("|").split("|")]
        if len(celdas) < 6:
            continue
        ident = celdas[0]
        if not ident.upper().startswith("VER-"):
            continue
        estado = celdas[2] if len(celdas) > 2 else ""
        # Solo muestras de verificaciones ya finalizadas (verificadas).
        if "\u2705" not in estado:
            continue
        horas = _duracion_a_horas(celdas[5])  # columna Duracion
        if horas is None:
            continue
        muestras.append(horas)
    return muestras


def resolver_latencia_verificacion(path=None):
    """Calibracion hibrida de la latencia de verificacion humana (horas habiles).

    Devuelve dict con la decision tomada:
      { horas, fuente, n_muestras, umbral, estadistico, valor_estadistico }

    Regla:
      - n_muestras < umbral            -> fallback (12 h), fuente="fallback".
      - n_muestras >= umbral           -> estadistico (mediana), fuente="calibrado".
    """
    fallback = VERIF_CONFIG["fallback_horas"]
    umbral = VERIF_CONFIG["umbral_muestras"]
    estadistico = VERIF_CONFIG["estadistico"]
    muestras = leer_muestras_verificacion(path)
    n = len(muestras)

    valor_estadistico = None
    if n >= umbral:
        if estadistico == "mediana":
            valor_estadistico = round(_mediana(muestras), 2)
        else:  # extensible a otros estadisticos futuros
            valor_estadistico = round(sum(muestras) / n, 2)
        return {
            "horas": valor_estadistico,
            "fuente": "calibrado",
            "n_muestras": n,
            "umbral": umbral,
            "estadistico": estadistico,
            "valor_estadistico": valor_estadistico,
        }
    return {
        "horas": fallback,
        "fuente": "fallback",
        "n_muestras": n,
        "umbral": umbral,
        "estadistico": estadistico,
        "valor_estadistico": None,
    }


# ============================================================ VERSIONADO
VERSION_RE = re.compile(
    r"PLAN-ESTIMACION-" + re.escape(PROJECT_CODE) + r"-v(\d+)(?:-FINAL)?\.xlsx$",
    re.IGNORECASE,
)


def max_version_existente(output_dir):
    output_dir = Path(output_dir)
    if not output_dir.exists():
        return 0
    maxn = 0
    for f in output_dir.glob(f"PLAN-ESTIMACION-{PROJECT_CODE}-v*.xlsx"):
        if f.name.startswith("~$"):
            continue
        m = VERSION_RE.search(f.name)
        if m:
            maxn = max(maxn, int(m.group(1)))
    return maxn


def resolve_version(output_dir, version_pedida=None, es_final=False):
    if version_pedida is not None:
        n = int(str(version_pedida).lower().lstrip("v"))
    elif es_final:
        _, version = find_latest_draft(output_dir)
        n = int(version.lstrip("v")) if version else 1
    else:
        n = max_version_existente(output_dir) + 1
    return f"v{n}"


# ============================================================ VALIDACION PRE-FINAL
PLAN_HEADER_ROW = 4
PLAN_FIRST_DATA_ROW = 5
PLAN_COL_NAME = 2
PLAN_COL_DURATION = 4
PLAN_COL_START = 5
PLAN_COL_FINISH = 6
PLAN_COL_PREDECESSORS = 7
PLAN_COL_RESOURCES = 8
PLAN_COL_HIERARCHICAL_ID = 11
PLAN_COL_LATENCY = 12
PLAN_COL_TRACKER_ID = 13
PLAN_ID_ENTREGABLE_RE = re.compile(r"^[A-Z]{2,5}-\d{3}$")
PLAN_ID_TAREA_RE = re.compile(r"^[A-Z]{2,5}-\d{3}-\d{3}$")
PLAN_VERSION_RE = re.compile(
    r"^PLAN-ESTIMACION-" + re.escape(PROJECT_CODE) +
    r"-v(?P<n>\d+)\.xlsx$", re.IGNORECASE
)


def _numero_plan(valor):
    if isinstance(valor, bool):
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    if valor is None:
        return None
    try:
        return float(str(valor).strip().replace(",", "."))
    except (TypeError, ValueError):
        return None


def _texto_plan(valor):
    return "" if valor is None else str(valor).strip()


def _evaluar_formula_plan(formula, valores_d, fila):
    """Evalua las formulas de totales que escribe write_plan sin depender de Excel."""
    numero = _numero_plan(formula)
    if numero is not None:
        return numero
    texto = str(formula or "").replace("$", "").replace(" ", "")
    suma = re.fullmatch(r"=SUM\(D(\d+):D(\d+)\)", texto, re.IGNORECASE)
    if suma:
        inicio, fin = int(suma.group(1)), int(suma.group(2))
        return sum(_numero_plan(valores_d.get(r)) or 0.0 for r in range(inicio, fin + 1))
    referencias = re.findall(r"D(\d+)", texto, re.IGNORECASE)
    if texto.startswith("=") and referencias:
        return sum(_numero_plan(valores_d.get(int(r))) or 0.0 for r in referencias)
    return None


def find_latest_draft(output_dir, version_pedida=None):
    """Localiza el borrador que debe validarse antes de crear -FINAL."""
    output_dir = Path(output_dir)
    if version_pedida is not None:
        n = int(str(version_pedida).lower().lstrip("v"))
        candidato = output_dir / f"PLAN-ESTIMACION-{PROJECT_CODE}-v{n}.xlsx"
        return (candidato, f"v{n}") if candidato.exists() else (None, None)
    candidatos = []
    if output_dir.exists():
        for f in output_dir.glob(f"PLAN-ESTIMACION-{PROJECT_CODE}-v*.xlsx"):
            if f.name.startswith("~$") or f.name.upper().endswith("-FINAL.XLSX"):
                continue
            m = PLAN_VERSION_RE.match(f.name)
            if m:
                candidatos.append((int(m.group("n")), f))
    if not candidatos:
        return None, None
    n, path = max(candidatos, key=lambda item: item[0])
    return path, f"v{n}"


def _recurso_y_dedicacion(valor):
    """Lee 'Recurso[50%]' y devuelve (nombre, dedicacion)."""
    texto = _texto_plan(valor)
    if not texto:
        return "Sin recurso", 1.0
    partes = [p.strip() for p in re.split(r"[;\n]+", texto) if p.strip()]
    parte = partes[0] if partes else texto
    marca = re.search(r"\[\s*([0-9]+(?:[.,][0-9]+)?)\s*%\s*\]", parte)
    nombre = re.sub(r"\s*\[[^]]*\]", "", parte).strip(" ,;") or "Sin recurso"
    dedicacion = None
    if marca:
        dedicacion = float(marca.group(1).replace(",", ".")) / 100.0
    if dedicacion is None:
        recurso = next((r for r in RESOURCES if r["name"] == nombre), None)
        dedicacion = recurso["dedication"] if recurso else 1.0
    return nombre, dedicacion


def _predecesoras_plan(valor):
    return [int(v) for v in re.findall(r"\d+", _texto_plan(valor))]


def _leer_plan_borrador(path):
    """Lee Plan dos veces: conserva formulas y obtiene caches cuando existen."""
    wb = openpyxl.load_workbook(path, data_only=False)
    wb_values = openpyxl.load_workbook(path, data_only=True, read_only=True)
    try:
        if "Plan" not in wb.sheetnames:
            raise ValueError("El borrador no contiene la hoja 'Plan'.")
        ws = wb["Plan"]
        ws_values = wb_values["Plan"]
        valores_d = {r: ws_values.cell(r, PLAN_COL_DURATION).value
                     for r in range(1, ws.max_row + 1)}
        filas = []
        actual_entregable = None
        total_row = None
        for r in range(PLAN_FIRST_DATA_ROW, ws.max_row + 1):
            nombre_raw = ws.cell(r, PLAN_COL_NAME).value
            if nombre_raw in (None, ""):
                continue
            nombre = str(nombre_raw)
            if nombre.strip().upper().startswith("TOTAL PROYECTO"):
                total_row = r
                continue
            ident = _texto_plan(ws.cell(r, PLAN_COL_HIERARCHICAL_ID).value).upper()
            es_entregable = bool(PLAN_ID_ENTREGABLE_RE.match(ident)) or (
                not ident and not nombre.startswith(" ")
            )
            es_tarea = bool(PLAN_ID_TAREA_RE.match(ident)) or not es_entregable
            if es_entregable:
                actual_entregable = ident or f"ROW-{r}"
            parent = actual_entregable if es_tarea else None
            filas.append({
                "row": r,
                "id": ident or f"ROW-{r}",
                "id_original": ident,
                "kind": "entregable" if es_entregable else "tarea",
                "parent": parent,
                "name": nombre.strip(),
                "duration_formula": ws.cell(r, PLAN_COL_DURATION).value,
                "duration": (_numero_plan(ws_values.cell(r, PLAN_COL_DURATION).value)
                             if not isinstance(ws.cell(r, PLAN_COL_DURATION).value, str)
                             else None),
                "start": _texto_plan(ws.cell(r, PLAN_COL_START).value),
                "finish": _texto_plan(ws.cell(r, PLAN_COL_FINISH).value),
                "predecessors": _predecesoras_plan(ws.cell(r, PLAN_COL_PREDECESSORS).value),
                "resources": _texto_plan(ws.cell(r, PLAN_COL_RESOURCES).value),
                "hierarchical_id": ident,
                "latency": _numero_plan(ws_values.cell(r, PLAN_COL_LATENCY).value),
                "tracker_id": _texto_plan(ws_values.cell(r, PLAN_COL_TRACKER_ID).value),
            })
        for fila in filas:
            if fila["duration"] is None:
                fila["duration"] = _evaluar_formula_plan(
                    fila["duration_formula"], valores_d, fila["row"]
                )
        return wb, filas, total_row, valores_d
    except Exception:
        wb.close()
        raise
    finally:
        wb_values.close()


def _filas_esperadas(scheduled):
    esperadas = {}
    for ent in scheduled:
        total = sum(float(t.get("hh_total") or 0) for t in ent["tareas"])
        esperadas[ent["id_jerarquico"]] = {
            "id": ent["id_jerarquico"], "kind": "entregable",
            "name": ent["nombre"], "duration": round(total, 2), "resources": "",
        }
        for tarea in ent["tareas"]:
            esperadas[tarea["id_jerarquico"]] = {
                "id": tarea["id_jerarquico"], "kind": "tarea",
                "name": tarea["nombre"], "duration": round(float(tarea.get("hh_total") or 0), 2),
                "resources": _etiqueta_recurso(
                    tarea.get("recurso", ""), tarea.get("tipo"), ent["nombre"]
                ),
            }
    return esperadas


def _comparar_plan_generado(filas, scheduled):
    esperadas = _filas_esperadas(scheduled)
    actuales = {fila["id"]: fila for fila in filas if fila["id_original"]}
    cambios = []
    for fila in filas:
        esperado = esperadas.get(fila["id"])
        if esperado is None:
            cambios.append({"tarea": fila["name"], "campo": "fila", "anterior": "no existia", "nuevo": f"agregada (fila {fila['row']})"})
            continue
        if _texto_plan(fila["name"]) != _texto_plan(esperado["name"]):
            cambios.append({"tarea": fila["id"], "campo": "Nombre de tarea", "anterior": esperado["name"], "nuevo": fila["name"]})
        if fila["kind"] == "tarea" and abs((fila["duration"] or 0) - esperado["duration"]) > 0.01:
            cambios.append({"tarea": fila["id"], "campo": "HH (col D)", "anterior": esperado["duration"], "nuevo": fila["duration"]})
        if fila["kind"] == "tarea" and _texto_plan(fila["resources"]) != _texto_plan(esperado["resources"]):
            cambios.append({"tarea": fila["id"], "campo": "Recursos (col H)", "anterior": esperado["resources"], "nuevo": fila["resources"]})
    for ident, esperado in esperadas.items():
        if ident not in actuales:
            cambios.append({"tarea": ident, "campo": "fila", "anterior": esperado["name"], "nuevo": "eliminada"})
    if not cambios:
        print("El plan no tiene modificaciones manuales")
    else:
        print("Cambios manuales detectados:")
        for cambio in cambios:
            print(f"  - {cambio['tarea']} | {cambio['campo']}: {cambio['anterior']} -> {cambio['nuevo']}")
    return cambios


def _recalcular_fechas_plan(filas, fecha_inicio):
    """Recalcula E/F con 8 HH por dia, dedicacion, calendario y predecesoras."""
    dias_habiles = construir_dias_habiles(fecha_inicio)
    por_numero = {}
    for fila in filas:
        valor_id = _numero_plan(fila["row"])
        # La columna A es la clave de las predecesoras en el Excel.
        fila["numeric_id"] = _numero_plan(fila.get("numeric_id"))
    # Leer el identificador numerico desde el propio registro de fila cuando exista.
    # El lector conserva el numero en la clave auxiliar creada abajo.
    por_numero = {fila["excel_id"]: fila for fila in filas if fila.get("excel_id") is not None}
    inicios = {}
    fines = {}
    errores = []
    cursores = {}
    entregables = [f for f in filas if f["kind"] == "entregable"]
    for entregable in entregables:
        predecesoras = entregable["predecessors"]
        piso = 0.0
        for pred in predecesoras:
            if pred not in fines:
                errores.append(f"Predecesora {pred} no disponible para {entregable['id']}")
            else:
                piso = max(piso, fines[pred])
        tareas = [f for f in filas if f["parent"] == entregable["id"] and f["kind"] == "tarea"]
        for tarea in tareas:
            piso_tarea = piso
            for pred in tarea["predecessors"]:
                if pred not in por_numero:
                    errores.append(f"Predecesora {pred} inexistente para {tarea['id']}")
                elif pred == tarea.get("excel_id"):
                    errores.append(f"Predecesora circular {pred} en {tarea['id']}")
                elif pred == entregable.get("excel_id"):
                    piso_tarea = max(piso_tarea, piso)
                elif pred not in fines:
                    errores.append(f"Predecesora {pred} no disponible para {tarea['id']}")
                else:
                    piso_tarea = max(piso_tarea, fines[pred])
            hh = _numero_plan(tarea["duration"])
            if hh is None or hh < 0:
                errores.append(f"HH invalida en {tarea['id']}: {tarea['duration']}")
                hh = 0.0
            recurso, dedicacion = _recurso_y_dedicacion(tarea["resources"])
            if dedicacion <= 0:
                errores.append(f"Dedicacion invalida en {tarea['id']}: {tarea['resources']}")
                dedicacion = 1.0
            inicio = max(piso_tarea, cursores.get(recurso, 0.0))
            fin = inicio + (hh / dedicacion)
            inicios[tarea["id"]] = fecha_en_offset(dias_habiles, inicio)
            fines[tarea["excel_id"]] = fin
            tarea["recalculated_start"] = inicios[tarea["id"]]
            tarea["recalculated_finish"] = fecha_fin_offset(dias_habiles, fin)
            cursores[recurso] = fin
        if tareas:
            inicios[entregable["id"]] = min(t["recalculated_start"] for t in tareas)
            fin_ent = max(t["recalculated_finish"] for t in tareas)
            # El fin del entregable se representa también como offset para las
            # predecesoras de la siguiente unidad.
            fines[entregable.get("excel_id")] = max(
                fines.get(t["excel_id"], 0.0) for t in tareas
            ) if all(t.get("excel_id") in fines for t in tareas) else max(
                fines.get(t["numeric_id"], 0.0) for t in tareas
            )
            entregable["recalculated_start"] = inicios[entregable["id"]]
            entregable["recalculated_finish"] = fin_ent
        else:
            inicios[entregable["id"]] = fecha_en_offset(dias_habiles, piso)
            entregable["id"] = entregable["id"]
            entregable["recalculated_start"] = inicios[entregable["id"]]
            entregable["recalculated_finish"] = fecha_en_offset(dias_habiles, piso)
            fines[entregable.get("excel_id")] = piso
    return inicios, errores


def _validar_totales_plan(filas, valores_d, total_row):
    discrepancias = []
    entregables = [f for f in filas if f["kind"] == "entregable"]
    calculados = {}
    for ent in entregables:
        tareas = [f for f in filas if f["parent"] == ent["id"] and f["kind"] == "tarea"]
        calculado = round(sum(_numero_plan(t["duration"]) or 0.0 for t in tareas), 2)
        actual = round(_evaluar_formula_plan(ent["duration_formula"], valores_d, ent["row"]) or 0.0, 2)
        calculados[ent["id"]] = calculado
        if abs(actual - calculado) > 0.01:
            discrepancias.append((ent["name"], actual, calculado, round(calculado - actual, 2)))
    total_calculado = round(sum(calculados.values()), 2)
    total_actual = None
    if total_row:
        valores_totales = dict(valores_d)
        for ent in entregables:
            valores_totales[ent["row"]] = calculados[ent["id"]]
        total_actual = round(_evaluar_formula_plan(
            valores_d.get(total_row), valores_totales, total_row
        ) or 0.0, 2)
    return discrepancias, calculados, total_actual, total_calculado


def _imprimir_discrepancias_totales(discrepancias, total_actual, total_calculado):
    if discrepancias:
        print("Discrepancias de totales detectadas y corregidas:")
        for nombre, actual, calculado, diferencia in discrepancias:
            print(f"  - {nombre}: actual {actual:g}, calculado {calculado:g}, diferencia {diferencia:+g}")
    if total_actual is not None and abs(total_actual - total_calculado) > 0.01:
        print(f"  - TOTAL PROYECTO: actual {total_actual:g}, calculado {total_calculado:g}, diferencia {total_calculado - total_actual:+g}")


def _aplicar_recalculo_al_libro(wb, validacion, output_path):
    ws = wb["Plan"]
    for fila in validacion["filas"]:
        inicio = fila.get("recalculated_start")
        fin = fila.get("recalculated_finish")
        if inicio:
            ws.cell(fila["row"], PLAN_COL_START).value = inicio.strftime("%d/%m/%Y")
        if fin:
            ws.cell(fila["row"], PLAN_COL_FINISH).value = fin.strftime("%d/%m/%Y")
    entregables = [f for f in validacion["filas"] if f["kind"] == "entregable"]
    filas_entregables = []
    for ent in entregables:
        tareas = [f for f in validacion["filas"] if f["parent"] == ent["id"] and f["kind"] == "tarea"]
        if tareas:
            primera = min(t["row"] for t in tareas)
            ultima = max(t["row"] for t in tareas)
            ws.cell(ent["row"], PLAN_COL_DURATION).value = f"=SUM(D{primera}:D{ultima})"
        else:
            ws.cell(ent["row"], PLAN_COL_DURATION).value = 0
        filas_entregables.append(ent["row"])
    if validacion["total_row"]:
        formula = "=" + "+".join(f"D{r}" for r in filas_entregables) if filas_entregables else "=0"
        ws.cell(validacion["total_row"], PLAN_COL_DURATION).value = formula
        ws.cell(validacion["total_row"], PLAN_COL_START).value = min(
            (f["recalculated_start"] for f in validacion["filas"] if f.get("recalculated_start")),
            default=START_DATE,
        ).strftime("%d/%m/%Y")
        ws.cell(validacion["total_row"], PLAN_COL_FINISH).value = max(
            (f["recalculated_finish"] for f in validacion["filas"] if f.get("recalculated_finish")),
            default=START_DATE,
        ).strftime("%d/%m/%Y")
    if ws["A2"].value:
        ws["A2"].value = re.sub(
            r"Fin:.*$", f"Fin: {max((f['recalculated_finish'] for f in validacion['filas'] if f.get('recalculated_finish')), default=START_DATE).strftime('%d/%m/%Y')}",
            str(ws["A2"].value),
        )
    if "Resumen" in wb.sheetnames:
        resumen = wb["Resumen"]
        for row in range(1, resumen.max_row + 1):
            ident = _texto_plan(resumen.cell(row, 1).value)
            if ident in validacion["calculados"]:
                ent = next((f for f in entregables if f["id"] == ident), None)
                resumen.cell(row, 6).value = validacion["calculados"][ident]
                if ent:
                    resumen.cell(row, 8).value = ent["recalculated_start"].strftime("%d/%m/%Y")
                    resumen.cell(row, 9).value = ent["recalculated_finish"].strftime("%d/%m/%Y")
            if _texto_plan(resumen.cell(row, 3).value).upper() == "TOTAL":
                resumen.cell(row, 6).value = validacion["total_calculado"]
            etiqueta = _texto_plan(resumen.cell(row, 1).value)
            if etiqueta == "HH total esfuerzo (gen + sup)":
                resumen.cell(row, 2).value = f"{validacion['total_calculado']:.1f} HH"
            elif etiqueta == "Fecha fin estimada":
                resumen.cell(row, 2).value = max(
                    (f["recalculated_finish"] for f in validacion["filas"] if f.get("recalculated_finish")),
                    default=START_DATE,
                ).strftime("%d/%m/%Y")
    if "Colaboradores" in wb.sheetnames:
        colaboradores = wb["Colaboradores"]
        agregados = {}
        for fila in validacion["filas"]:
            if fila["kind"] != "tarea":
                continue
            recurso, _ = _recurso_y_dedicacion(fila["resources"])
            dato = agregados.setdefault(recurso, {"trabajo": 0.0, "verif": 0.0, "tareas": 0})
            hh = _numero_plan(fila["duration"]) or 0.0
            es_verif = (fila.get("latency") or 0.0) > 0 or "verificacion" in fila["name"].lower()
            dato["verif" if es_verif else "trabajo"] += hh
            dato["tareas"] += 1
        for row in range(1, colaboradores.max_row + 1):
            recurso = _texto_plan(colaboradores.cell(row, 2).value)
            dato = agregados.get(recurso)
            if dato:
                colaboradores.cell(row, 5).value = round(dato["trabajo"], 2)
                colaboradores.cell(row, 6).value = round(dato["verif"], 2)
                colaboradores.cell(row, 7).value = dato["tareas"]
            elif recurso.upper() == "TOTAL":
                colaboradores.cell(row, 5).value = round(sum(d["trabajo"] for d in agregados.values()), 2)
                colaboradores.cell(row, 6).value = round(sum(d["verif"] for d in agregados.values()), 2)
                colaboradores.cell(row, 7).value = sum(d["tareas"] for d in agregados.values())
    if hasattr(wb, "calculation"):
        wb.calculation.fullCalcOnLoad = True
        wb.calculation.forceFullCalc = True
        wb.calculation.calcMode = "auto"
    wb.save(str(output_path))


def validar_pre_final(draft_path, scheduled):
    wb, filas, total_row, valores_d = _leer_plan_borrador(draft_path)
    ws_total = wb["Plan"]
    if total_row:
        total_formula = ws_total.cell(total_row, PLAN_COL_DURATION).value
        valores_d[total_row] = total_formula
    for fila in filas:
        fila["excel_id"] = _numero_plan(ws_total.cell(fila["row"], 1).value)
        fila["numeric_id"] = fila["excel_id"]
    cambios = _comparar_plan_generado(filas, scheduled)
    discrepancias, calculados, total_actual, total_calculado = _validar_totales_plan(
        filas, valores_d, total_row
    )
    _imprimir_discrepancias_totales(discrepancias, total_actual, total_calculado)
    _, errores_recalculo = _recalcular_fechas_plan(filas, START_DATE)
    wb.close()
    errores = list(errores_recalculo)
    if total_row is None:
        errores.append("No existe la fila TOTAL PROYECTO en la hoja Plan")
    for fila in filas:
        inicio = fila.get("recalculated_start")
        fin = fila.get("recalculated_finish")
        if inicio and fin and inicio > fin:
            errores.append(f"Rango de fechas invalido en {fila['id']}")
    return {
        "draft_path": draft_path,
        "filas": filas,
        "total_row": total_row,
        "cambios": cambios,
        "discrepancias": discrepancias,
        "total_actual": total_actual,
        "total_calculado": total_calculado,
        "errores": errores,
        "calculados": calculados,
    }


# ============================================================ EXCEL
def style_row(ws, row, cols, font, fill=None, border=True):
    for c in range(1, cols + 1):
        cell = ws.cell(row=row, column=c)
        cell.font = font
        if fill:
            cell.fill = fill
        if border:
            cell.border = BORDER_THIN
        cell.alignment = ALIGN_CENTER if c != 2 else ALIGN_LEFT


def write_plan(ws, scheduled, tracker=None):
    """Hoja Plan MS Project-style con las horas condensadas en una sola columna.

    Las HH de generacion y supervision se suman en "Duracion (horas)". El desglose
    generacion/supervision se conserva en la hoja Resumen.
    """
    if tracker is None:
        tracker = {}
    # Cols 1-8: layout base. Cols 9-10: RESERVADAS para la skill de seguimiento
    # (Inicio real / Fin real). Col 11: ID Jerarquico (nace aqui, seguimiento lo
    # hereda por header, no lo recalcula). Ver plan del ID jerarquico, secc. 4.1/4.4.
    # Cols 12-13 (v11): Latencia (horas) e ID Tracker, añadidas DESPUES de K para
    # no romper a los consumidores de las columnas I/J/K.
    headers = ["Id", "Nombre de tarea", "% completado", "Duración (horas)",
               "Comienzo", "Fin", "Predecesoras", "Nombres de los recursos"]
    COL_ID_JERARQUICO = 11
    COL_LATENCIA = 12
    COL_ID_TRACKER = 13
    NC = COL_ID_TRACKER  # ancho total incluyendo latencia e ID Tracker

    ws.merge_cells(f"A1:{get_column_letter(NC)}1")
    ws["A1"] = f"Plan de Trabajo - {PROJECT_NAME}"
    ws["A1"].font = FONT_TITLE
    ws["A1"].alignment = ALIGN_LEFT

    constr_txt = (CONSTRUCTION_START_DATE.strftime('%d/%m/%Y')
                  if CONSTRUCTION_START_DATE else "por definir")
    ws.merge_cells(f"A2:{get_column_letter(NC)}2")
    ws["A2"] = (f"Código: {PROJECT_CODE}  |  Líder: {LEADER}  |  Metodología: {METHODOLOGY} (v3 gen+sup)  |  "
                f"Inception: {START_DATE.strftime('%d/%m/%Y')}  |  Construcción: {constr_txt}  |  "
                f"Fin: {scheduled[-1]['fin'].strftime('%d/%m/%Y')}")
    ws["A2"].font = FONT_NORMAL
    ws["A2"].alignment = ALIGN_LEFT

    row = 4
    for ci, h in enumerate(headers, 1):
        cell = ws.cell(row=row, column=ci, value=h)
        cell.font = FONT_HEADER
        cell.fill = FILL_HEADER
        cell.alignment = ALIGN_CENTER
        cell.border = BORDER_THIN
    # Cabeceras de las columnas 11-13 (ID Jerarquico, Latencia, ID Tracker)
    for col, titulo in (
        (COL_ID_JERARQUICO, "ID Jerárquico"),
        (COL_LATENCIA, "Latencia (horas)"),
        (COL_ID_TRACKER, "ID Tracker"),
    ):
        cell = ws.cell(row=4, column=col, value=titulo)
        cell.font = FONT_HEADER
        cell.fill = FILL_HEADER
        cell.alignment = ALIGN_CENTER
        cell.border = BORDER_THIN

    def es_verificacion(t):
        return t.get("tipo") == "verif_humana"

    row = 5
    gid = 0
    jid_a_gid = {}
    for ent in scheduled:
        gid += 1
        jid_a_gid[ent["id_jerarquico"]] = gid
        for t in ent["tareas"]:
            gid += 1
            jid_a_gid[t["id_jerarquico"]] = gid

    def preds_celda(jids):
        ids = [str(jid_a_gid[j]) for j in (jids or []) if j in jid_a_gid]
        return ",".join(ids)

    gid = 0
    filas_entregables = []   # filas (row) de cada fila de entregable, para el TOTAL PROYECTO formulado
    for ent in scheduled:
        gid += 1
        ent_id = gid
        # El nombre del entregable NUNCA lleva sufijo de latencia como
        # "(+1.5d verif. humana)" (eso era de una version <v11 ya descartada). La
        # verificacion humana es una FILA PROPIA por entregable (factor x Duracion);
        # anadir un sufijo al nombre duplicaria esa representacion.
        nombre_ent = _corregir_nombre_entregable_plan(ent["nombre"])
        ws.cell(row=row, column=1, value=gid)
        ws.cell(row=row, column=2, value=nombre_ent)
        ws.cell(row=row, column=3, value=f"{pct_entregable(ent['nombre'], tracker)}%")
        # La Duracion del entregable (col 4) se deja FORMULADA: =SUM(primera:ultima
        # tarea). Se rellena despues de escribir sus tareas (ver mas abajo), para
        # que si se cambian las HH de una tarea, el total del entregable recalcule.
        fila_entregable = row
        ws.cell(row=row, column=5, value=ent["inicio"].strftime("%d/%m/%Y"))
        ws.cell(row=row, column=6, value=ent["fin"].strftime("%d/%m/%Y"))
        ws.cell(row=row, column=7, value=preds_celda(ent.get("pred_jids")))
        # La fila del ENTREGABLE deja la columna de recursos EN BLANCO; solo las
        # filas de TAREA muestran el recurso asignado a cada una.
        ws.cell(row=row, column=8, value="")
        ws.cell(row=row, column=COL_ID_JERARQUICO, value=ent["id_jerarquico"])
        style_row(ws, row, NC, FONT_SUBHEADER, FILL_LIGHT)
        row += 1

        for t in ent["tareas"]:
            gid += 1
            if es_verificacion(t):
                # Fila de verificacion tecnica: Duracion (col D) = horas de
                # verificacion (VERIF_FACTOR x sumaD del entregable); fechas =
                # inicio/fin de la verificacion; recurso = Senior verificador.
                ws.cell(row=row, column=1, value=gid)
                ws.cell(row=row, column=2, value=f"   {_corregir_nombre_tarea_plan(t['nombre'])}")
                ws.cell(row=row, column=3, value="0%")
                ws.cell(row=row, column=4, value=t["hh_total"])
                ws.cell(row=row, column=5, value=t["inicio"].strftime("%d/%m/%Y"))
                ws.cell(row=row, column=6, value=t["fin"].strftime("%d/%m/%Y"))
                ws.cell(row=row, column=7, value=preds_celda(t.get("pred_jids")))
                ws.cell(row=row, column=8,
                        value=_etiqueta_recurso(t.get("recurso", ""), t.get("tipo"), ent["nombre"]))
                ws.cell(row=row, column=COL_ID_JERARQUICO, value=t["id_jerarquico"])
                ws.cell(row=row, column=COL_LATENCIA, value=t["latencia_horas"])
                ws.cell(row=row, column=COL_ID_TRACKER, value=t.get("id_tracker", ""))
                style_row(ws, row, NC, FONT_NORMAL)
                row += 1
                continue

            ws.cell(row=row, column=1, value=gid)
            ws.cell(row=row, column=2, value=f"   {_corregir_nombre_tarea_plan(t['nombre'])}")
            ws.cell(row=row, column=3, value="0%")
            ws.cell(row=row, column=4, value=t["hh_total"])
            ws.cell(row=row, column=5, value=t["inicio"].strftime("%d/%m/%Y"))
            ws.cell(row=row, column=6, value=t["fin"].strftime("%d/%m/%Y"))
            ws.cell(row=row, column=7, value=preds_celda(t.get("pred_jids")))
            ws.cell(row=row, column=8,
                    value=_etiqueta_recurso(t.get("recurso", ""), t.get("tipo"), ent["nombre"]))
            ws.cell(row=row, column=COL_ID_JERARQUICO, value=t["id_jerarquico"])
            ws.cell(row=row, column=COL_LATENCIA, value=0)
            ws.cell(row=row, column=COL_ID_TRACKER, value="")
            style_row(ws, row, NC, FONT_NORMAL)
            row += 1

        # Formula del total del entregable (col 4) = SUMA de las Duraciones de sus
        # filas de tarea (desde la fila siguiente al entregable hasta la ultima
        # escrita). Incluye la fila de verificacion tecnica (su col 4 tambien suma).
        primera_tarea = fila_entregable + 1
        ultima_tarea = row - 1
        col_d = get_column_letter(4)
        if ultima_tarea >= primera_tarea:
            ws.cell(row=fila_entregable, column=4,
                    value=f"=SUM({col_d}{primera_tarea}:{col_d}{ultima_tarea})")
        else:
            # Entregable sin tareas (caso borde): total 0.
            ws.cell(row=fila_entregable, column=4, value=0)
        filas_entregables.append(fila_entregable)

    row += 1
    # Horas de verificacion humana (columna D de las filas de verificacion).
    total_verif = sum(
        t["hh_total"]
        for e in scheduled for t in e["tareas"]
        if t.get("tipo") == "verif_humana"
    )
    # Duracion total del proyecto (col D): FORMULADA como la suma de las celdas de
    # total de cada entregable (que a su vez son =SUM de sus tareas). Asi, cambiar
    # las HH de cualquier tarea recalcula el total del entregable Y el del proyecto.
    ws.cell(row=row, column=2, value="TOTAL PROYECTO")
    col_d = get_column_letter(4)
    if filas_entregables:
        formula_total = "=" + "+".join(f"{col_d}{fr}" for fr in filas_entregables)
        ws.cell(row=row, column=4, value=formula_total)
    else:
        ws.cell(row=row, column=4, value=0)
    ws.cell(row=row, column=5, value=scheduled[0]["inicio"].strftime("%d/%m/%Y"))
    ws.cell(row=row, column=6, value=scheduled[-1]["fin"].strftime("%d/%m/%Y"))
    # La columna Latencia (horas) totaliza las horas de verificacion humana.
    ws.cell(row=row, column=COL_LATENCIA, value=round(total_verif, 2))
    style_row(ws, row, NC, FONT_TOTAL, FILL_GREY)

    # Anchos: 1-8 base, 9-10 reservadas seguimiento, 11 = ID Jerarquico,
    # 12 = Latencia (horas), 13 = ID Tracker.
    for i, w in enumerate([5, 54, 12, 16, 13, 13, 14, 36, 12, 12, 15, 15, 13], 1):
        ws.column_dimensions[get_column_letter(i)].width = w


_FUENTE_CONSTRUCCION_TXT = {
    "tracker": "Task-tracker (registro AI-DLC activo/INDICE-PROGRESO.md)",
    "ficha": "Ficha corta (construccion-menor.json)",
    "vacia": "Sin paquete: falta tracker y construccion-menor.json",
}
_RECORRIDO_CORTO_ETIQUETAS = (
    ("objetivo", "Objetivo del cambio"),
    ("donde_vive", "Dónde vive el cambio"),
    ("criterio_termino", "Criterio de término"),
)


def _meta_fuente_construccion(fuente_construccion, recorrido_corto):
    """Filas de Resumen que documentan de dónde salió la construcción.

    Siempre informa la fuente. Cuando la fuente es la ficha corta, agrega el
    recorrido corto (objetivo, dónde vive, criterio de término) como trazabilidad.
    """
    filas = [("Fuente de construcción",
              _FUENTE_CONSTRUCCION_TXT.get(fuente_construccion, fuente_construccion))]
    recorrido = recorrido_corto or {}
    if fuente_construccion == "ficha":
        for clave, etiqueta in _RECORRIDO_CORTO_ETIQUETAS:
            valor = str(recorrido.get(clave) or "").strip()
            if valor:
                filas.append((etiqueta, valor))
    return filas


def write_resumen(ws, scheduled, version="v3", estado="Borrador", fecha_estado=None,
                  modo="completa", verif_info=None, fuente_construccion="tracker",
                  recorrido_corto=None, dependencias_externas=None):
    ws.merge_cells("A1:G1")
    ws["A1"] = f"Resumen de Estimación — {PROJECT_CODE} {version} ({estado}) — Modelo Generación+Supervisión"
    ws["A1"].font = FONT_TITLE
    ws["A1"].alignment = ALIGN_LEFT

    if dependencias_externas is None:
        dependencias_externas = DEPENDENCIAS_EXTERNAS

    estado_valor = estado
    if estado.lower().startswith("defin") and fecha_estado:
        estado_valor = f"Definitiva (confirmada {fecha_estado})"

    if verif_info is None:
        verif_info = resolver_latencia_verificacion()

    total_gen = sum(e["hh_gen"] for e in scheduled)
    total_sup = sum(e["hh_sup"] for e in scheduled)
    total_trad = sum(e["hh_trad"] for e in scheduled)

    # Verificaciones humanas (v11.1): horas por entregable = VERIF_FACTOR x
    # (suma de la Duración de sus tareas de trabajo). Ya NO es una latencia fija.
    n_verif = sum(1 for e in scheduled if e.get("tiene_verificacion"))
    total_verif = sum(
        t["hh_total"]
        for e in scheduled for t in e["tareas"]
        if t.get("tipo") == "verif_humana"
    )

    recursos_txt = "; ".join(
        f"{r['name']} ({int(r['dedication']*100)}%)" for r in PERSONAS
    ) + f"  = {CAPACIDAD_DIA:.0f} HH/día"
    if modo == "aproximada":
        tipo_txt = "APROXIMADA — inception en curso; construcción estimada como continuación"
        inicio_constr_txt = "Por definir (se solicita al finalizar inception)"
    else:
        tipo_txt = "COMPLETA — anclada a fechas reales de fase"
        inicio_constr_txt = (CONSTRUCTION_START_DATE.strftime("%d/%m/%Y")
                             if CONSTRUCTION_START_DATE else "N/D")

    dep_ext_resumen = (
        f"{len(dependencias_externas)} áreas identificadas"
        if dependencias_externas
        else "Ninguna declarada ni detectada"
    )

    meta = [
        ("Proyecto", PROJECT_NAME),
        ("Código", PROJECT_CODE),
        ("Clasificación de mantenimiento", CLASIFICACIONES_MANTENIMIENTO.get(CLASIFICACION, "N/D")),
        ("HH fijas del Acta de Cierre", f"{ACTA_CIERRE_HH:g} HH" if ACTA_CIERRE_HH is not None else "N/D"),
        ("Versión", version),
        ("Estado", estado_valor),
        ("Tipo de estimación", tipo_txt),
        ("Modelo", "v3 — Generación (agente) + Supervisión (humano) separadas"),
        ("Modo de asignación", MODO_ASIGNACION),
        *_meta_fuente_construccion(fuente_construccion, recorrido_corto),
        ("Dependencias de soporte", dep_ext_resumen),
        ("Líder", LIDER["name"]),
        ("Metodología", f"{METHODOLOGY} con {AI_TOOLING}"),
        ("País / Calendario", validar_calendario()),
        ("Recursos", recursos_txt),
        ("HH generación (agente)", f"{total_gen:.1f} HH"),
        ("HH supervisión (humano)", f"{total_sup:.1f} HH"),
        ("HH total esfuerzo (gen + sup)", f"{total_gen + total_sup:.1f} HH"),
        ("HH tradicional (referencia)", f"{total_trad:.0f} HH"),
        ("Re-trabajo aplicado", f"{REWORK_FACTOR*100:.0f}% sobre supervisión (evidencia: 1 ajuste / 27 tareas)"),
        ("--- Verificación técnica (proporcional al entregable) ---", ""),
        ("Factor de verificación", f"{VERIF_FACTOR:.2f} x (suma de Duración de las tareas del entregable)"),
        ("Verificaciones técnicas", f"{n_verif} entregables de desarrollo (exentos: inception y cierre)"),
        ("Horas totales de verificación", f"{total_verif:.1f} h (incluidas en la Duración total del proyecto)"),
        ("Fecha de corte", datetime.now().strftime("%d/%m/%Y")),
        ("Inicio inception (real)", START_DATE.strftime("%d/%m/%Y") + " — fuente: aidlc-state.md"),
        ("Inicio construcción (real)", inicio_constr_txt),
        ("Fecha fin estimada", scheduled[-1]["fin"].strftime("%d/%m/%Y")),
    ]
    row = 3
    for label, value in meta:
        ws.cell(row=row, column=1, value=label).font = FONT_SUBHEADER
        ws.cell(row=row, column=2, value=value).font = FONT_NORMAL
        row += 1

    row += 2
    headers = ["ID Jerárquico", "#", "Entregable", "HH gen", "HH sup", "HH total esf.",
               "Verif. humana (h)", "Inicio", "Fin"]
    for ci, h in enumerate(headers, 1):
        cell = ws.cell(row=row, column=ci, value=h)
        cell.font = FONT_HEADER
        cell.fill = FILL_HEADER
        cell.alignment = ALIGN_CENTER
        cell.border = BORDER_THIN
    row += 1

    for idx, ent in enumerate(scheduled, 1):
        ws.cell(row=row, column=1, value=ent["id_jerarquico"])
        ws.cell(row=row, column=2, value=idx)
        ws.cell(row=row, column=3, value=_corregir_nombre_entregable_plan(ent["nombre"]))
        ws.cell(row=row, column=4, value=round(ent["hh_gen"], 2))
        ws.cell(row=row, column=5, value=round(ent["hh_sup"], 2))
        ws.cell(row=row, column=6, value=round(ent["hh_total"], 2))
        ws.cell(row=row, column=7, value=ent["latencia_horas"] if ent.get("tiene_verificacion") else "")
        ws.cell(row=row, column=8, value=ent["inicio"].strftime("%d/%m/%Y"))
        ws.cell(row=row, column=9, value=ent["fin"].strftime("%d/%m/%Y"))
        style_row(ws, row, 9, FONT_NORMAL)
        row += 1

    ws.cell(row=row, column=3, value="TOTAL")
    ws.cell(row=row, column=4, value=round(total_gen, 2))
    ws.cell(row=row, column=5, value=round(total_sup, 2))
    ws.cell(row=row, column=6, value=round(total_gen + total_sup, 2))
    ws.cell(row=row, column=7, value=round(total_verif, 2))
    ws.cell(row=row, column=8, value=scheduled[0]["inicio"].strftime("%d/%m/%Y"))
    ws.cell(row=row, column=9, value=scheduled[-1]["fin"].strftime("%d/%m/%Y"))
    style_row(ws, row, 9, FONT_TOTAL, FILL_LIGHT)

    row += 3
    ws.cell(row=row, column=1, value="Interpretación:").font = FONT_SUBHEADER
    row += 1
    ws.cell(row=row, column=1, value=(
        "La verificación técnica de cada entregable se dimensiona como "
        f"{VERIF_FACTOR:.2f} x la suma de la Duración de sus tareas de trabajo: es "
        f"lo que le toma a un desarrollador verificar lo que produjo el agente "
        f"({total_verif:.1f} h en total). Se refleja en la Duración de la fila de "
        "verificación y en la Duración total del proyecto; la ejecuta la persona dueña del entregable."
    )).font = FONT_NORMAL

    row += 2
    dias = 0
    d = scheduled[0]["inicio"]
    while d <= scheduled[-1]["fin"]:
        if es_laborable(d):
            dias += 1
        d += timedelta(days=1)
    ws.cell(row=row, column=1, value="Días hábiles:").font = FONT_SUBHEADER
    ws.cell(row=row, column=2, value=f"{dias}").font = FONT_NORMAL
    row += 1
    semanas = math.ceil((scheduled[-1]["fin"] - scheduled[0]["inicio"]).days / 7)
    ws.cell(row=row, column=1, value="Semanas calendario:").font = FONT_SUBHEADER
    ws.cell(row=row, column=2, value=f"{semanas}").font = FONT_NORMAL

    row += 3
    ws.cell(row=row, column=1, value="Dependencias Externas de Áreas de Soporte (Enlace Temprano)").font = FONT_SUBHEADER
    row += 1
    if not dependencias_externas:
        ws.cell(row=row, column=1, value="Sin dependencias externas declaradas ni derivadas del perfil de infraestructura.").font = FONT_NORMAL
    else:
        dep_headers = ["#", "Área", "Necesidad de soporte", "Contacto", "Estado", "Bloquea / Impacto"]
        for ci, h in enumerate(dep_headers, 1):
            cell = ws.cell(row=row, column=ci, value=h)
            cell.font = FONT_HEADER
            cell.fill = FILL_HEADER
            cell.alignment = ALIGN_CENTER
            cell.border = BORDER_THIN
        row += 1
        for idx, dep in enumerate(dependencias_externas, 1):
            area = dep.get("area", "")
            necesidad = dep.get("necesidad", "")
            contacto = dep.get("contacto") or "Por coordinar"
            estado_dep = (dep.get("estado") or "pendiente").capitalize()
            bloquea = dep.get("bloquea") or "Sin bloqueo directo"
            ws.cell(row=row, column=1, value=idx)
            ws.cell(row=row, column=2, value=area)
            ws.cell(row=row, column=3, value=necesidad)
            ws.cell(row=row, column=4, value=contacto)
            ws.cell(row=row, column=5, value=estado_dep)
            ws.cell(row=row, column=6, value=bloquea)
            style_row(ws, row, 6, FONT_NORMAL)
            row += 1

    for i, w in enumerate([15, 5, 40, 10, 10, 10, 10, 12, 12], 1):
        ws.column_dimensions[get_column_letter(i)].width = w


def write_colaboradores(ws, scheduled):
    # HH de trabajo (gen+sup) y horas de verificacion por recurso.
    hh_trabajo_r = {r["name"]: 0.0 for r in RESOURCES}
    hh_verif_r = {r["name"]: 0.0 for r in RESOURCES}
    tareas_r = {r["name"]: 0 for r in RESOURCES}
    for ent in scheduled:
        for t in ent["tareas"]:
            rc = t.get("recurso")
            if not rc or rc not in hh_trabajo_r:
                continue
            if t.get("tipo") == "verif_humana":
                hh_verif_r[rc] += t["hh_total"]
            else:
                hh_trabajo_r[rc] += t["hh_total"]
            tareas_r[rc] += 1

    ws.merge_cells("A1:I1")
    ws["A1"] = "Colaboradores del Proyecto"
    ws["A1"].font = FONT_TITLE
    ws["A1"].alignment = ALIGN_LEFT

    headers = ["Id", "Nombre / Recurso", "Roles", "Dedicación %",
               "Inicio participación", "Alcance", "HH trabajo",
               "HH verificación", "Tareas"]
    row = 3
    for ci, h in enumerate(headers, 1):
        cell = ws.cell(row=row, column=ci, value=h)
        cell.font = FONT_HEADER
        cell.fill = FILL_HEADER
        cell.alignment = ALIGN_CENTER
        cell.border = BORDER_THIN

    row = 4
    for idx, r in enumerate(RESOURCES, 1):
        ws.cell(row=row, column=1, value=idx)
        ws.cell(row=row, column=2, value=r["name"])
        ws.cell(row=row, column=3, value=_texto_roles(r))
        ws.cell(row=row, column=4, value=f"{int(r['dedication']*100)}%")
        ws.cell(row=row, column=5, value=(r.get("fecha_inicio") or "").isoformat() if r.get("fecha_inicio") else "Desde el inicio")
        ws.cell(row=row, column=6, value=_texto_alcance(r))
        ws.cell(row=row, column=7, value=round(hh_trabajo_r[r["name"]], 2))
        ws.cell(row=row, column=8, value=round(hh_verif_r[r["name"]], 2))
        ws.cell(row=row, column=9, value=tareas_r[r["name"]])
        style_row(ws, row, 9, FONT_NORMAL)
        row += 1

    ws.cell(row=row, column=2, value="TOTAL")
    ws.cell(row=row, column=7, value=round(sum(hh_trabajo_r.values()), 2))
    ws.cell(row=row, column=8, value=round(sum(hh_verif_r.values()), 2))
    ws.cell(row=row, column=9, value=sum(tareas_r.values()))
    style_row(ws, row, 9, FONT_TOTAL, FILL_LIGHT)
    row += 2

    n_agentes = sum(
        int(p.get("agentes") or 1) for p in PERSONAS if p.get("ejecuta_desarrollo", True)
    )
    nombres_funcionales = []
    for item in RESPONSABLES_FUNCIONALES:
        nombres_funcionales.append(item.get("nombre", "") if isinstance(item, dict) else str(item))
    info = [
        ("Líder de la solicitud:", f"{LIDER['name']} ({int(LIDER['dedication']*100)}%)"),
        ("Responsable de la solicitud:", f"{RESPONSABLE['name']} ({int(RESPONSABLE['dedication']*100)}%)"),
        ("Herramienta IA:", AI_TOOLING),
        ("Modelo de recursos:", f"{len(PERSONAS)} participante(s) y {n_agentes} agente(s). "
                                "Los roles de una misma persona comparten dedicación y calendario."),
        ("Asignación:", f"Modo {MODO_ASIGNACION}. Las ventanas con exclusivo=true se reservan; "
                        "con false admiten apoyo del pozo general."),
        ("Seguimiento:", "Lo hace el líder de la solicitud y consume su capacidad disponible."),
        ("Acta de Cierre:", "La elabora el responsable de la solicitud."),
        ("Consultas de negocio:", ", ".join(n for n in nombres_funcionales if n) or "No informado"),
        ("HH verificación:", f"Factor {VERIF_FACTOR:.2f} x la Duración de las tareas del entregable."),
    ]
    for label, value in info:
        ws.cell(row=row, column=1, value=label).font = FONT_SUBHEADER
        ws.cell(row=row, column=2, value=value).font = FONT_NORMAL
        row += 1

    for i, w in enumerate([5, 22, 42, 13, 18, 38, 12, 16, 10], 1):
        ws.column_dimensions[get_column_letter(i)].width = w


def parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="Genera la estimacion v3 (modelo generacion+supervision) como artefacto iterable."
    )
    p.add_argument("--final", action="store_true",
                   help="Marca la estimacion como DEFINITIVA (sufijo -FINAL).")
    p.add_argument("--version", dest="version", default=None,
                   help="Fuerza un numero de version concreto (ej. 3 o v3).")
    p.add_argument("--verif-factor", dest="verif_factor", type=float, default=None,
                   help=("Factor de esfuerzo de la verificacion humana: horas de "
                         "verificacion = factor x Duracion de las tareas del "
                         "entregable. Default 0.30. Ej: --verif-factor 0.20 (solo "
                         "auditoria de codigo) o 0.40 (incluye validacion de negocio)."))
    p.add_argument("--verif-latency", dest="verif_latency", type=float, default=None,
                   help=("Latencia de cola (DIAS HABILES) tras la verificacion de un "
                         "entregable, antes de arrancar el siguiente (espera de "
                         "aprobacion humana). Default 0. Ej: --verif-latency 1 = el "
                         "siguiente entregable espera 1 dia habil adicional."))
    return p.parse_args(argv)


def _solicitar_datos_construccion(faltantes):
    """Imprime la solicitud de datos de construccion y detiene la generacion.

    Cumple el flujo pedido: al marcar el fin de inception, se solicitan la fecha
    de inicio de construccion, el total de recursos y su % de dedicacion. La
    estimacion no se genera hasta que esos datos esten en estimacion-fases.json.
    """
    print("=" * 64)
    print("  FIN DE INCEPCION REGISTRADO — se requieren datos de construccion")
    print("=" * 64)
    print("  Inception finalizo, pero faltan datos para estimar la construccion:")
    for f in faltantes:
        print(f"    - {f}")
    print("-" * 64)
    print(f"  Completa estos campos en: {FASES_PATH}")
    print("    * construccion_inicio_real : 'YYYY-MM-DD' (fecha real de arranque)")
    print("    * personas                 : quien ejecuta; dedicacion, agentes,")
    print("                                 roles, inicio y alcance global/entregables.")
    print("    * modo_asignacion          : por_entregable o por_tarea.")
    print("    * lider_solicitud          : alias compatible; puede inferirse por roles.")
    print("    * responsable_solicitud    : alias compatible; puede inferirse por roles.")
    print("    * roles_por_tarea          : tarea o tipo -> roles habilitados.")
    print("    * responsables_funcionales : contactos para dudas de negocio; sin capacidad.")
    print("    * dependencias             : entregable -> lista de entregables previos.")
    print("    * dependencias_externas    : lista de { area, necesidad, contacto, estado, bloquea }.")
    print("  Dedicacion: 0-1, 0-100 o texto con %. 'exclusivo' controla si una")
    print("  ventana especializada admite apoyo del pozo general.")
    print("  Ejemplo:")
    print('    "personas": [')
    print('      { "nombre": "Persona A", "dedicacion": 1.0, "roles": ["lider_proyecto", "desarrollador"], "ejecuta_desarrollo": true, "agentes": 1 },')
    print('      { "nombre": "Persona B", "dedicacion": "20%", "roles": ["especialista_integracion"], "ejecuta_desarrollo": true, "asignacion": {"tipo": "entregables", "entregables": ["Integracion"], "exclusivo": false} }')
    print("    ],")
    print('    "modo_asignacion": "por_tarea",')
    print('    "roles_por_tarea": { "Definir especificaciones tecnicas": ["especialista_tecnico"] },')
    print('    "responsables_funcionales": [{ "nombre": "Usuario de negocio", "area": "Comercial" }]')
    print("=" * 64)


def _solicitar_project_config():
    """Detiene la generacion y solicita los datos del proyecto.

    La clasificacion confirmada es obligatoria porque controla las HH del Acta
    de Cierre; no se permite generar usando un valor predeterminado.
    """
    p = Path(PROJECT_CONFIG_PATH)
    creada = False
    if not p.exists():
        plantilla = {
            "_descripcion": (
                "Configuracion central del proyecto compartida por las skills de "
                "estimacion, seguimiento y task-tracker. Completa 'code', 'name' y "
                "'clasificacion'."
            ),
            "code": "",
            "name": "",
            "leader": "",
            "country": "VE",
            "holidays": [],
            "clasificacion": "",
        }
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(plantilla, indent=2, ensure_ascii=False), encoding="utf-8")
            creada = True
        except OSError:
            creada = False

    print("=" * 64)
    print("  CONFIGURACION DEL PROYECTO REQUERIDA")
    print("=" * 64)
    if creada:
        print(f"  Se creo una plantilla en: {p}")
    else:
        print(f"  Config incompleta o ilegible en: {p}")
    print("  Completa estos campos antes de generar la estimacion:")
    print("    * code : codigo del proyecto (ej. ABC12345). Es la clave de los")
    print("             nombres de archivo (PLAN-ESTIMACION-<code>-...).")
    print("    * name : nombre legible (ej. ABC12345-nombre-del-proyecto).")
    print("    * leader, country : metadata y calendario.")
    print("    * holidays : requerido para paises sin calendario automatico; YYYY-MM-DD.")
    print("    * clasificacion : obligatoria; menor, intermedio o mayor.")
    print("-" * 64)
    print("  Luego vuelve a ejecutar el generador.")
    print("=" * 64)


def main(argv=None):
    global START_DATE, CONSTRUCTION_START_DATE, VERIF_FACTOR, VERIF_LATENCY_DIAS
    args = parse_args(argv)

    # Overrides por CLI de los parametros de verificacion humana (opcionales).
    if getattr(args, "verif_factor", None) is not None:
        VERIF_FACTOR = args.verif_factor
    if getattr(args, "verif_latency", None) is not None:
        VERIF_LATENCY_DIAS = args.verif_latency

    # Opcion A: sin config valida (code/name/clasificacion), la skill se detiene y la solicita.
    if not PROJECT_CONFIG_OK:
        _solicitar_project_config()
        return 2

    try:
        validar_calendario()
    except ValueError as exc:
        print(f"ERROR DE CALENDARIO: {exc}")
        return 2

    # Resolver fechas y recursos desde las fuentes reales (aidlc-state.md + fases)
    try:
        ctx, modo = resolver_contexto()
    except FaltanDatosConstruccion as e:
        _solicitar_datos_construccion(e.faltantes)
        return 2  # detiene: faltan insumos que debe aportar el usuario

    START_DATE = ctx["inicio_inception"]
    CONSTRUCTION_START_DATE = ctx["construccion_inicio_real"]  # None en modo aproximado
    try:
        aplicar_equipo(ctx)
    except ValueError as exc:
        _solicitar_datos_construccion([str(exc)])
        return 2

    # Calibracion hibrida de la latencia de verificacion humana (v11).
    verif_info = resolver_latencia_verificacion()
    # WBS: inception fijo + CONSTRUCCION + cierre fijo. La construccion sale del
    # task-tracker cuando existe; si no (cambios Menor/Intermedio fuera de
    # /aidlc), del paquete de la ficha corta (construccion-menor.json). Sin
    # ninguna de las dos, la construccion queda vacia (se avisa en Resumen).
    construccion_unidades, fuente_construccion, recorrido_corto = resolver_construccion()
    # Deteccion automatica por CONTENIDO del WBS: suma las areas de soporte cuyas
    # señales aparecen en las unidades/tareas y que no vengan ya declaradas o del
    # perfil. Las declaradas/perfil mantienen precedencia (fusionar_dependencias).
    global DEPENDENCIAS_EXTERNAS
    deps_contenido = derivar_dependencias_desde_contenido(construccion_unidades)
    if deps_contenido:
        DEPENDENCIAS_EXTERNAS = fusionar_dependencias(
            DEPENDENCIAS_EXTERNAS, deps_contenido
        )
    entregables = construir_entregables(construccion_unidades)
    try:
        scheduled = schedule(entregables, START_DATE, CONSTRUCTION_START_DATE,
                             latencia_horas=verif_info["horas"])
    except FaltanDatosConstruccion as e:
        _solicitar_datos_construccion(e.faltantes)
        return 2
    tracker = parse_tracker()

    workspace_root = next(
        (parent for parent in Path(__file__).resolve().parents if (parent / ".kiro").is_dir()),
        Path.cwd(),
    )
    output_dir = workspace_root / ".intelix" / "outputs" / "estimacion"
    output_dir.mkdir(parents=True, exist_ok=True)

    version = resolve_version(output_dir, args.version, es_final=args.final)
    filename = f"PLAN-ESTIMACION-{PROJECT_CODE}-{version}{'-FINAL' if args.final else ''}.xlsx"
    output_path = output_dir / filename

    if args.final:
        draft_path, draft_version = find_latest_draft(output_dir, args.version)
        print("=" * 64)
        print("  VALIDACION PRE-FINAL")
        if not draft_path:
            print(f"  ERROR: no existe el borrador PLAN-ESTIMACION-{PROJECT_CODE}-{version}.xlsx")
            print("  No se genera el archivo -FINAL.")
            print("=" * 64)
            return 2
        if output_path.exists():
            print(f"  ERROR: ya existe el archivo definitivo {output_path.name}.")
            print("  La version definitiva esta congelada; use una nueva version borrador.")
            print("=" * 64)
            return 2
        print(f"  Borrador leido: {draft_path.name}")
        try:
            validacion = validar_pre_final(draft_path, scheduled)
        except (OSError, ValueError, KeyError) as error:
            print(f"  ERROR: no se pudo validar el borrador: {error}")
            print("  No se genera el archivo -FINAL.")
            print("=" * 64)
            return 2
        print(f"  Cambios manuales: {len(validacion['cambios'])}")
        print(f"  Fechas: recalculadas con 8 HH/dia, dedicacion, calendario y predecesoras")
        print(f"  Total proyecto recalculado: {validacion['total_calculado']:g} HH")
        if validacion["errores"]:
            print("  ERRORES DE VALIDACION:")
            for error in validacion["errores"]:
                print(f"    - {error}")
            print("  No se genera el archivo -FINAL.")
            print("=" * 64)
            return 2
        wb_final = openpyxl.load_workbook(draft_path)
        _aplicar_recalculo_al_libro(wb_final, validacion, output_path)
        wb_final.close()
        print(f"  {filename} generado a partir del borrador validado y recalculado")
        print("  Estado: Definitiva (validacion pre-final aprobada)")
        print("=" * 64)
        return 0

    estado = "Borrador"
    fecha_estado = None
    sufijo = ""
    wb = openpyxl.Workbook()
    ws_plan = wb.active
    ws_plan.title = "Plan"
    write_plan(ws_plan, scheduled, tracker)

    ws_res = wb.create_sheet("Resumen")
    write_resumen(ws_res, scheduled, version=version, estado=estado,
                  fecha_estado=fecha_estado, modo=modo, verif_info=verif_info,
                  fuente_construccion=fuente_construccion,
                  recorrido_corto=recorrido_corto,
                  dependencias_externas=DEPENDENCIAS_EXTERNAS)

    ws_col = wb.create_sheet("Colaboradores")
    write_colaboradores(ws_col, scheduled)
    wb.save(str(output_path))

    total_gen = sum(e["hh_gen"] for e in scheduled)
    total_sup = sum(e["hh_sup"] for e in scheduled)
    total_trad = sum(e["hh_trad"] for e in scheduled)

    modo_txt = "APROXIMADA (inception en curso)" if modo == "aproximada" else "COMPLETA (fechas reales de fase)"
    print("=" * 64)
    print(f"  {filename} generado (modelo v3: generacion + supervision)")
    print(f"  Tipo: estimacion {modo_txt}")
    print(f"  Estado: {estado} (iterable)")
    print("=" * 64)
    print(f"  HH generacion (agente):   {total_gen:.1f} HH")
    print(f"  HH supervision (humano):  {total_sup:.1f} HH")
    print(f"  HH total (gen + sup):     {total_gen + total_sup:.1f} HH")
    print(f"  HH tradicional (ref.):    {total_trad:.0f} HH")
    print(f"  Inception arranca:        {START_DATE.strftime('%d/%m/%Y')} (real, de aidlc-state.md)")
    if CONSTRUCTION_START_DATE:
        print(f"  Construccion arranca:     {CONSTRUCTION_START_DATE.strftime('%d/%m/%Y')} (real, de estimacion-fases.json)")
    else:
        print("  Construccion arranca:     (aproximada — continua tras inception)")
    _rec_desc = ", ".join(f"{r['name']} {int(r['dedication']*100)}%" for r in RESOURCES)
    print(f"  Recursos:                 {len(RESOURCES)} ({_rec_desc})")
    print(f"  Fin estimado:             {scheduled[-1]['fin'].strftime('%d/%m/%Y')}")
    print(f"  Dependencias externas:    {len(DEPENDENCIAS_EXTERNAS)} áreas de soporte (enlace temprano)")
    _n_verif = sum(1 for e in scheduled if e.get("tiene_verificacion"))
    _tot_verif = sum(t["hh_total"] for e in scheduled for t in e["tareas"]
                     if t.get("tipo") == "verif_humana")
    print(f"  Verificaciones tecnicas:  {_n_verif} (factor {VERIF_FACTOR:.2f} x Duracion del entregable)")
    print(f"  Horas verificacion total: {_tot_verif:.1f} h (incluidas en la Duracion total)")
    print("-" * 64)
    if tracker:
        print("  % completado por entregable (task-tracker):")
        for ent in entregables:
            nombre = ent[0]
            print(f"    - {nombre:<44} {pct_entregable(nombre, tracker)}%")
    else:
        print("  Task-tracker no encontrado: % en 0 (salvo overrides inception).")
    print("  BORRADOR iterable. Usa --final para iniciar la validacion pre-final.")
    print("=" * 64)


if __name__ == "__main__":
    sys.exit(main() or 0)
