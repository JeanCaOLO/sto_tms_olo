"""
Núcleo del Consolidado de Avance (multi-rama / multi-colaborador).

Principio rector (NO negociable):
    El avance OFICIAL del proyecto se calcula desde el índice de la rama canónica
    de integración (por defecto `develop`), DESPUÉS de integrar los Merge Requests.
    Las ramas de trabajo (`feature/*`, `bugfix/*`) son fuentes de trabajo EN CURSO,
    no se suman automáticamente al avance oficial.

Qué hace este módulo:
    1. Lee el índice de progreso de la rama canónica vía `git show <rama>:<ruta>`
       (sin hacer checkout) y calcula el avance oficial reutilizando exactamente
       los mismos estados y pesos del task-tracker.
    2. Lee el índice de cada rama REMOTA `feature/*` / `bugfix/*` (solo remotas:
       el trabajo local aún no compartido no cuenta) y cruza cada tarea por su
       identificador de índice (columna ID) contra la rama canónica, clasificando:
         - integrada             (misma tarea y mismo estado que en develop)
         - pendiente-integracion (avance en la rama que develop aún no tiene)
         - divergente            (mismo ID con distinto estado entre rama y develop)
         - solo-en-rama          (ID que no existe en develop)
    3. Atribuye el trabajo por colaborador con DOS vistas independientes:
         - "según plan":   columna Recursos del SEGUIMIENTO-*.xlsx (leer_entregables.py)
         - "quién commiteó": autor real de los commits exclusivos de cada rama (git log)

Este módulo NO escribe nada: solo lee git y el índice y devuelve un modelo. La
escritura (MD/HTML/JSON) vive en generar_consolidado.py.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Estados canónicos del tracker (idénticos a intelix-task-tracker/tracker_core.py)
# símbolo -> (etiqueta, peso agente, cuenta_verificada)
# ---------------------------------------------------------------------------

STATE_MAP: dict[str, tuple[str, Optional[float], bool]] = {
    "\u2b1c": ("Pendiente", 0.0, False),            # ⬜
    "\U0001f504": ("En progreso", 0.0, False),       # 🔄
    "\U0001f7e1": ("Completada (agente)", 0.9, False),  # 🟡
    "\U0001f527": ("En ajuste", 0.9, False),         # 🔧
    "\u2705": ("Verificada", 1.0, True),             # ✅
    "\u23ed\ufe0f": ("Omitida", None, False),        # ⏭️
}

# La ruta predeterminada se resuelve desde el registro activo (v1 o v2).
INDICE_REL_DEFAULT: Optional[str] = None


def resolver_indice_rel(root: Path) -> str:
    """Devuelve la ruta git-relative del indice activo en AI-DLC v1 o v2."""
    skill_file = Path(__file__).resolve()
    for ancestor in (skill_file.parent, *skill_file.parents):
        common = ancestor / ".intelix" / "scripts"
        if (common / "aidlc_paths.py").is_file():
            sys.path.insert(0, str(common))
            from aidlc_paths import resolve_layout
            return resolve_layout(root).progress_index_relative
    raise GitError("no se encontro .intelix/scripts/aidlc_paths.py")

# Plan de estimación DEFINITIVO (baseline del proyecto). Formato de la hoja "Plan"
# heredado del generador de estimación (ver intelix-seguimiento-plan, no se toca):
#   col 2(B)=nombre (entregable sin sangría / tarea con sangría), 3(C)=%plan,
#   4(D)=HH, 5(E)=inicio planificado, 6(F)=fin planificado, 8(H)=recursos,
#   11(K)=ID jerárquico. Datos desde la fila 5. Fila "TOTAL..." cierra.
ESTIMACION_DIR_REL = ".intelix/outputs/estimacion"
PLAN_HOJA = "Plan"
PLAN_FILA_DATOS = 5
PLAN_COL_NOMBRE = 2
PLAN_COL_PCT = 3
PLAN_COL_HH = 4
PLAN_COL_INICIO = 5
PLAN_COL_FIN = 6
PLAN_COL_RECURSOS = 8
PLAN_COL_ID = 11

# Rama canónica de integración por defecto.
RAMA_CANONICA_DEFAULT = "develop"

# Prefijos de ramas de trabajo efímeras.
PREFIJOS_TRABAJO = ("feature/", "bugfix/")

# ID de tarea del índice (formato del tracker: AUT-T01, VER-01, REP-T02...).
TASK_ID_RE = re.compile(r"^[A-Z]{2,5}-T\d{2}$|^VER-\d{2}$|^VER-[A-Z]{2,5}$")

# ID jerárquico del plan (EST-001, PAR-002-003) — para la atribución "según plan".
RE_ID_JERARQUICO = re.compile(r"^[A-Z]{2,5}-\d{3}(?:-\d{3})?$")

US_ID_RE = re.compile(r"US-\d{2}[a-z]?")

# Rango de progresión en el ciclo de vida de una tarea. A diferencia del peso
# (⬜ y 🔄 pesan 0), el rango distingue "pendiente" de "en progreso": una rama
# que mueve una tarea de ⬜ a 🔄 avanzó, no divergió. ⏭️ (omitida) queda aparte.
PROGRESION_ESTADO: dict[str, int] = {
    "\u2b1c": 0,          # ⬜ Pendiente
    "\U0001f504": 1,      # 🔄 En progreso
    "\U0001f7e1": 2,      # 🟡 Completada (agente)
    "\U0001f527": 2,      # 🔧 En ajuste (mismo plano que 🟡)
    "\u2705": 3,          # ✅ Verificada
}


def _rango(state: str) -> int:
    return PROGRESION_ESTADO.get(state, 0)


# ---------------------------------------------------------------------------
# Modelos
# ---------------------------------------------------------------------------

@dataclass
class Task:
    id: str
    description: str
    state: str
    unit: str = ""
    inicio: Optional[str] = None
    fin: Optional[str] = None
    duracion: Optional[str] = None
    stories: list[str] = field(default_factory=list)
    # Rama de procedencia del estado (se rellena al consolidar).
    rama: str = ""
    # Datos del plan de estimación (modo completo; vacíos si no hay plan).
    colaborador: str = ""
    inicio_plan: str = ""
    fin_plan: str = ""

    @property
    def weight(self) -> Optional[float]:
        info = STATE_MAP.get(self.state)
        return info[1] if info else 0.0

    @property
    def is_skipped(self) -> bool:
        return self.weight is None

    @property
    def is_verified(self) -> bool:
        info = STATE_MAP.get(self.state)
        return bool(info and info[2])

    @property
    def state_label(self) -> str:
        info = STATE_MAP.get(self.state)
        return info[0] if info else "Desconocido"


@dataclass
class Unit:
    name: str
    plan: str = ""
    tasks: list[Task] = field(default_factory=list)


@dataclass
class Stats:
    total: int = 0
    agent_pct: float = 0.0
    verified_pct: float = 0.0
    verified: int = 0
    agent_done: int = 0
    adjusting: int = 0
    in_progress: int = 0
    pending: int = 0


# ---------------------------------------------------------------------------
# Git (mismo patrón que scripts/verificar-sync-git.js: subprocess desde ROOT)
# ---------------------------------------------------------------------------

class GitError(RuntimeError):
    pass


def _run(root: Path, args: list[str]) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=str(root),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        raise GitError(f"git {' '.join(args)} -> {proc.stderr.strip()}")
    return proc.stdout


def _run_ok(root: Path, args: list[str]) -> tuple[int, str, str]:
    proc = subprocess.run(
        ["git", *args],
        cwd=str(root),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return proc.returncode, proc.stdout, proc.stderr


def es_repo(root: Path) -> bool:
    code, _, _ = _run_ok(root, ["rev-parse", "--is-inside-work-tree"])
    return code == 0


def indice_versionado(root: Path, indice_rel: str) -> dict:
    """Determina si el índice está versionado o ignorado (Escenario A vs B).

    Escenario A (correcto para consolidar multi-rama): el índice se versiona,
    viaja por git y cada rama lleva su propia copia -> `git show` funciona.

    Escenario B (plantilla / índice local por clon): el índice está en
    .gitignore, nunca sale de la máquina -> no se puede consolidar por rama.
    Devuelve el detalle para que el generador avise con una guía clara.
    """
    # ¿Está trackeado en HEAD o en el índice de staging?
    code_tracked, out_tracked, _ = _run_ok(root, ["ls-files", "--error-unmatch", indice_rel])
    trackeado = code_tracked == 0 and out_tracked.strip() != ""

    # ¿Está ignorado por .gitignore?
    code_ign, out_ign, _ = _run_ok(root, ["check-ignore", "-v", indice_rel])
    ignorado = code_ign == 0 and out_ign.strip() != ""
    regla_ignore = out_ign.strip().splitlines()[0] if ignorado and out_ign.strip() else ""

    return {
        "versionado": trackeado,
        "ignorado": ignorado,
        "regla_ignore": regla_ignore,
        # Escenario B si el índice NO está versionado (típicamente por estar ignorado)
        "escenario_b": not trackeado,
    }


def ref_remota_existe(root: Path, ref: str) -> bool:
    code, out, _ = _run_ok(root, ["rev-parse", "--verify", "--quiet", ref])
    return code == 0 and out.strip() != ""


def listar_ramas_trabajo_remotas(root: Path, remoto: str = "origin") -> list[str]:
    """Devuelve las ramas remotas feature/* y bugfix/* como refs cortas.

    Ej.: 'origin/feature/ISSUE-001-...' -> 'feature/ISSUE-001-...'
    Solo remotas: el trabajo local no compartido aún no cuenta.
    """
    code, out, _ = _run_ok(
        root,
        ["for-each-ref", "--format=%(refname:short)", f"refs/remotes/{remoto}"],
    )
    if code != 0:
        return []
    ramas: list[str] = []
    prefijo = f"{remoto}/"
    for linea in out.splitlines():
        ref = linea.strip()
        if not ref or ref.endswith("/HEAD") or "->" in ref:
            continue
        corta = ref[len(prefijo):] if ref.startswith(prefijo) else ref
        if corta.startswith(PREFIJOS_TRABAJO):
            ramas.append(corta)
    return sorted(ramas)


def leer_indice_de_rama(root: Path, ref_completa: str, indice_rel: str) -> Optional[str]:
    """Lee el contenido del índice en una rama vía `git show`, sin checkout.

    Devuelve None si esa rama no tiene el archivo.
    """
    code, out, _ = _run_ok(root, ["show", f"{ref_completa}:{indice_rel}"])
    if code != 0:
        return None
    return out


def leer_indice_working_tree(root: Path, indice_rel: str) -> Optional[str]:
    """Lee el índice directamente del working tree local (sin pasar por git).

    Útil cuando el índice aún no está versionado (Escenario B) o para un único
    desarrollador que quiere validar el consolidado antes de que exista trabajo
    remoto. No cambia el principio rector: el avance oficial sigue saliendo del
    índice de la rama canónica; solo cambia de dónde se lee ese índice.
    """
    ruta = root / indice_rel
    if not ruta.is_file():
        return None
    return ruta.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Parser del índice (compatible con el formato del tracker y del CLI JS)
# ---------------------------------------------------------------------------

def _clean(cell: str) -> Optional[str]:
    cell = cell.strip()
    if cell in ("\u2014", "—", "", "-"):
        return None
    return cell


def _parse_stories(cell: Optional[str]) -> list[str]:
    if not cell:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for us in US_ID_RE.findall(cell):
        if us not in seen:
            seen.add(us)
            out.append(us)
    return out


def parse_indice(content: str) -> list[Task]:
    """Extrae las tareas del INDICE-PROGRESO.md, saltando la tabla de Resumen."""
    return [t for u in parse_indice_unidades(content) for t in u.tasks]


def parse_indice_unidades(content: str) -> list[Unit]:
    """Extrae las unidades (con su plan) y sus tareas (con fechas), saltando el
    Resumen y las tablas sin encabezado '## Unidad:' (p. ej. el registro SEG-*)."""
    units: list[Unit] = []
    current: Optional[Unit] = None
    for raw in content.split("\n"):
        line = raw.rstrip()

        m = re.match(r"^##\s+Unidad:\s+(.+)$", line)
        if m:
            current = Unit(name=m.group(1).strip())
            units.append(current)
            continue
        if re.match(r"^##\s+Resumen\s*$", line):
            current = None
            continue
        if current is None:
            continue

        # Plan de la unidad
        if current and not current.tasks and "Plan:" in line and "`" in line:
            pm = re.search(r"`([^`]+)`", line)
            if pm:
                current.plan = pm.group(1).strip()
            continue

        if not line.startswith("|") or line.startswith("|---") or line.startswith("| ID"):
            continue

        cols = [c.strip() for c in line.split("|")[1:-1]]
        if len(cols) < 7:
            continue
        task_id = cols[0].strip()
        if not task_id or not TASK_ID_RE.match(task_id):
            continue
        stories_raw = _clean(cols[7]) if len(cols) >= 8 else None
        current.tasks.append(Task(
            id=task_id,
            description=cols[1].strip(),
            state=cols[2].strip(),
            unit=current.name,
            inicio=_clean(cols[3]),
            fin=_clean(cols[4]),
            duracion=_clean(cols[5]),
            stories=_parse_stories(stories_raw),
        ))
    return units


# ---------------------------------------------------------------------------
# Cálculos
# ---------------------------------------------------------------------------

def calcular_stats(tasks: list[Task]) -> Stats:
    s = Stats()
    agent_score = 0.0
    for t in tasks:
        if t.is_skipped:
            continue
        s.total += 1
        w = t.weight or 0.0
        if w == 1.0:
            s.verified += 1
            agent_score += 1.0
        elif w == 0.9:
            agent_score += 0.9
            if t.state == "\U0001f527":
                s.adjusting += 1
            else:
                s.agent_done += 1
        elif t.state == "\U0001f504":
            s.in_progress += 1
        else:
            s.pending += 1
    if s.total > 0:
        s.agent_pct = round(agent_score / s.total * 100, 1)
        s.verified_pct = round(s.verified / s.total * 100, 1)
    return s


# ---------------------------------------------------------------------------
# Plan de estimación (baseline): entregables, tareas, colaboradores, fechas
# ---------------------------------------------------------------------------

@dataclass
class PlanTask:
    id_jerarquico: Optional[str]
    nombre: str
    colaborador: str = ""
    inicio_plan: str = ""
    fin_plan: str = ""


@dataclass
class PlanEntregable:
    id_jerarquico: Optional[str]
    nombre: str
    colaborador: str = ""
    inicio_plan: str = ""
    fin_plan: str = ""
    tasks: list[PlanTask] = field(default_factory=list)


def _limpiar_recursos(valor) -> str:
    """Nombre(s) de recurso sin el sufijo de dedicación '[100%]'.

    'Persona A[100%]' -> 'Persona A'; 'Senior 1; Senior 2' -> 'Senior 1, Senior 2'.
    """
    if valor is None or valor == "":
        return ""
    partes = re.split(r"[;\n]+", str(valor))
    nombres: list[str] = []
    for p in partes:
        nombre = re.sub(r"\[[^\]]*\]", "", p).strip(" ,;")
        if nombre and nombre.lower() not in ("recursos", "n/a", "na", "tbd", "-", "--"):
            if nombre not in nombres:
                nombres.append(nombre)
    return ", ".join(nombres)


def _fmt_fecha_plan(valor) -> str:
    """Normaliza una celda de fecha del plan a texto 'YYYY-MM-DD' cuando se puede."""
    if valor is None or valor == "":
        return ""
    # openpyxl puede devolver datetime/date
    try:
        return valor.strftime("%Y-%m-%d")  # type: ignore[union-attr]
    except AttributeError:
        pass
    s = str(valor).strip()
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return m.group(0)
    # formato DD/MM/AAAA -> AAAA-MM-DD
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", s)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return s


def localizar_plan_final(root: Path) -> Optional[Path]:
    """Devuelve el PLAN-ESTIMACION-*-FINAL.xlsx más reciente, o None si no hay."""
    carpeta = (root / ESTIMACION_DIR_REL)
    if not carpeta.is_dir():
        return None
    candidatos = [
        p for p in carpeta.glob("PLAN-ESTIMACION-*-FINAL.xlsx")
        if not p.name.startswith("~$")
    ]
    if not candidatos:
        return None

    def _clave(p: Path):
        m = re.search(r"-v(\d+)-FINAL", p.stem, re.IGNORECASE)
        version = int(m.group(1)) if m else 0
        return (version, p.stat().st_mtime)

    candidatos.sort(key=_clave)
    return candidatos[-1]


def leer_plan_estimacion(plan_path: Path) -> list[PlanEntregable]:
    """Lee la hoja 'Plan' del PLAN-ESTIMACION-*-FINAL.xlsx.

    Requiere openpyxl. Entregable = fila sin sangría en col B; tarea = fila con
    sangría inicial. Fila 'TOTAL...' cierra. No modifica el archivo.
    """
    try:
        import openpyxl  # import perezoso: solo se necesita en modo completo
    except ImportError:
        raise RuntimeError("falta openpyxl para leer el plan de estimación")

    wb = openpyxl.load_workbook(plan_path, data_only=True, read_only=True)
    try:
        if PLAN_HOJA not in wb.sheetnames:
            raise RuntimeError(f"el plan no tiene la hoja '{PLAN_HOJA}'")
        ws = wb[PLAN_HOJA]
        entregables: list[PlanEntregable] = []
        actual: Optional[PlanEntregable] = None
        for r in range(PLAN_FILA_DATOS, ws.max_row + 1):
            nombre = ws.cell(r, PLAN_COL_NOMBRE).value
            if not nombre:
                continue
            texto = str(nombre)
            if texto.strip().upper().startswith("TOTAL"):
                actual = None
                continue
            id_col = ws.cell(r, PLAN_COL_ID).value
            id_col = str(id_col).strip() if id_col not in (None, "") else None
            recursos = ws.cell(r, PLAN_COL_RECURSOS).value
            recursos = _limpiar_recursos(recursos)
            inicio = _fmt_fecha_plan(ws.cell(r, PLAN_COL_INICIO).value)
            fin = _fmt_fecha_plan(ws.cell(r, PLAN_COL_FIN).value)

            if texto.startswith(" "):
                # Fila de tarea (sangrada)
                if actual is not None:
                    actual.tasks.append(PlanTask(
                        id_jerarquico=id_col,
                        nombre=texto.strip(),
                        colaborador=recursos,
                        inicio_plan=inicio,
                        fin_plan=fin,
                    ))
                continue
            # Fila de entregable
            actual = PlanEntregable(
                id_jerarquico=id_col,
                nombre=texto.strip(),
                colaborador=recursos,
                inicio_plan=inicio,
                fin_plan=fin,
            )
            entregables.append(actual)
        return entregables
    finally:
        wb.close()


def _norm(s: str) -> str:
    """Normaliza para emparejar nombres de entregable (sin acentos, minúsculas)."""
    import unicodedata
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(s.lower().split())


def indexar_plan_por_unidad(entregables_plan: list[PlanEntregable]) -> dict[str, PlanEntregable]:
    """Índice {nombre_normalizado_entregable -> PlanEntregable} para cruzar con
    las unidades del índice de progreso por nombre."""
    return {_norm(e.nombre): e for e in entregables_plan}


# ---------------------------------------------------------------------------
# Consolidado tipo DASHBOARD (mismo formato que el reporte de avance normal)
# ---------------------------------------------------------------------------

def _etiqueta_rama(ref_completa: str, remoto: str, rama_canonica: str) -> str:
    """Nombre corto de rama para mostrar en la columna 'Rama'."""
    corta = ref_completa
    if corta.startswith(f"{remoto}/"):
        corta = corta[len(remoto) + 1:]
    if corta == rama_canonica:
        return rama_canonica
    return corta


def construir_dashboard_consolidado(
    root: Path,
    rama_canonica: str = RAMA_CANONICA_DEFAULT,
    remoto: str = "origin",
    indice_rel: Optional[str] = INDICE_REL_DEFAULT,
    fuente_local: bool = False,
) -> dict:
    """Consolida el avance de TODAS las ramas en el formato del reporte normal.

    Por cada (unidad, ID de tarea) toma el estado MÁS AVANZADO presente en
    cualquier rama (canónica + remotas de trabajo) y registra en qué rama vive ese
    estado ganador (columna 'Rama'). El avance oficial se reporta aparte, solo
    desde la rama canónica, para respetar el principio rector.
    """
    if not es_repo(root):
        raise GitError("el directorio no es un repositorio git")

    indice_rel = indice_rel or resolver_indice_rel(root)

    ver = indice_versionado(root, indice_rel)

    # Fuentes de índice: (etiqueta_rama, contenido). La canónica primero.
    fuentes: list[tuple[str, str]] = []

    ref_canonica = f"{remoto}/{rama_canonica}"
    if not ref_remota_existe(root, ref_canonica):
        ref_canonica = rama_canonica if ref_remota_existe(root, rama_canonica) else ""

    if fuente_local:
        contenido = leer_indice_working_tree(root, indice_rel)
        if contenido is None:
            raise GitError(f"no existe el índice local '{indice_rel}' en el working tree")
        fuentes.append((rama_canonica, contenido))
        fuente_desc = f"working tree local ({indice_rel})"
    else:
        if ver["escenario_b"]:
            raise GitError(
                "ESCENARIO_B: el índice '" + indice_rel + "' no está versionado"
                + (f" (ignorado por {ver['regla_ignore']})" if ver["ignorado"] else "")
                + ". Para consolidar multi-rama, versiona el índice de tracking en cada "
                "rama. Para validar ahora con un solo checkout, usa --fuente-local."
            )
        if not ref_canonica:
            raise GitError(
                f"no existe la rama canónica '{remoto}/{rama_canonica}' ni '{rama_canonica}'"
            )
        contenido = leer_indice_de_rama(root, ref_canonica, indice_rel)
        if contenido is None:
            raise GitError(f"la rama canónica '{ref_canonica}' no contiene '{indice_rel}'")
        fuentes.append((rama_canonica, contenido))
        fuente_desc = f"git show {ref_canonica}:{indice_rel} (+ ramas remotas)"

        # Ramas remotas de trabajo (solo si el índice viaja por git).
        for corta in listar_ramas_trabajo_remotas(root, remoto):
            c = leer_indice_de_rama(root, f"{remoto}/{corta}", indice_rel)
            if c is not None:
                fuentes.append((corta, c))

    # Consolidación: unidad -> {id_tarea -> Task ganadora (estado más avanzado)}.
    unidades_orden: list[str] = []
    consolidado: dict[str, dict[str, Task]] = {}
    plan_por_unidad: dict[str, str] = {}
    ramas_incluidas: list[str] = []

    for etiqueta_rama, contenido in fuentes:
        ramas_incluidas.append(etiqueta_rama)
        for u in parse_indice_unidades(contenido):
            if u.name not in consolidado:
                consolidado[u.name] = {}
                unidades_orden.append(u.name)
            if u.plan and u.name not in plan_por_unidad:
                plan_por_unidad[u.name] = u.plan
            for t in u.tasks:
                t.rama = etiqueta_rama
                actual = consolidado[u.name].get(t.id)
                # Gana el estado más avanzado; ante empate, conserva el primero
                # (la canónica se procesó primero => prioridad a lo integrado).
                if actual is None or _rango(t.state) > _rango(actual.state):
                    consolidado[u.name][t.id] = t

    # Armar unidades consolidadas conservando el orden de aparición.
    unidades: list[Unit] = []
    for nombre in unidades_orden:
        tareas = list(consolidado[nombre].values())
        unidades.append(Unit(name=nombre, plan=plan_por_unidad.get(nombre, ""), tasks=tareas))

    # --- Modo COMPLETO: enriquecer con el plan de estimación (baseline) --------
    # Si existe un PLAN-ESTIMACION-*-FINAL.xlsx y openpyxl está disponible, se
    # añade colaborador y fechas planificadas por tarea (cruce entregable por
    # nombre de unidad, tarea por posición dentro de la unidad — mismo mecanismo
    # que intelix-seguimiento-plan). Si no hay plan, se sigue en modo solo-índice.
    plan_info = {"disponible": False, "archivo": None, "motivo": ""}
    plan_path = localizar_plan_final(root)
    if plan_path is not None:
        try:
            entregables_plan = leer_plan_estimacion(plan_path)
            idx_plan = indexar_plan_por_unidad(entregables_plan)
            for u in unidades:
                ent = idx_plan.get(_norm(u.name))
                if ent is None:
                    continue
                # Cruce por posición: la tarea i de la unidad <-> tarea i del plan.
                # (VER-* del índice no suele tener contraparte en el plan.)
                tareas_no_ver = [t for t in u.tasks]
                for i, t in enumerate(tareas_no_ver):
                    pt = ent.tasks[i] if i < len(ent.tasks) else None
                    if pt is not None:
                        t.colaborador = pt.colaborador
                        t.inicio_plan = pt.inicio_plan
                        t.fin_plan = pt.fin_plan
                    else:
                        # sin contraparte en el plan: hereda el colaborador del entregable
                        t.colaborador = t.colaborador or ent.colaborador
            plan_info = {"disponible": True, "archivo": plan_path.name, "motivo": ""}
        except (RuntimeError, Exception) as e:  # noqa: BLE001 - degradar con motivo
            plan_info = {"disponible": False, "archivo": plan_path.name,
                         "motivo": f"no se pudo leer el plan: {e}"}
    else:
        plan_info = {"disponible": False, "archivo": None,
                     "motivo": "sin PLAN-ESTIMACION-*-FINAL.xlsx en .intelix/outputs/estimacion"}

    # Avance oficial: SOLO la rama canónica (primera fuente).
    tasks_canonica = parse_indice(fuentes[0][1])
    stats_oficial = calcular_stats(tasks_canonica)

    # Avance consolidado (todas las ramas, estado más avanzado por tarea).
    todas = [t for u in unidades for t in u.tasks]
    stats_consolidado = calcular_stats(todas)

    # Progreso por colaborador (solo en modo completo, desde el plan).
    por_colaborador = _progreso_por_colaborador(unidades) if plan_info["disponible"] else []

    es_ejemplo = bool(
        re.search(r"Nota \(plantilla\)", fuentes[0][1], re.IGNORECASE)
        or re.search(r"##\s*Unidad:\s*Ejemplo\s*[—–-]", fuentes[0][1], re.IGNORECASE)
    )

    return {
        "titulo": _titulo_desde_indice(fuentes[0][1]),
        "rama_canonica": rama_canonica,
        "ref_canonica_usada": ref_canonica or rama_canonica,
        "remoto": remoto,
        "indice_rel": indice_rel,
        "fuente_indice": fuente_desc,
        "fuente_local": fuente_local,
        "es_ejemplo": es_ejemplo,
        "versionado": ver,
        "ramas_incluidas": ramas_incluidas,
        "modo_completo": plan_info["disponible"],
        "plan": plan_info,
        "avance_oficial": _stats_dict(stats_oficial),
        "avance_consolidado": _stats_dict(stats_consolidado),
        "por_colaborador": por_colaborador,
        "unidades": [_unit_dict(u, rama_canonica) for u in unidades],
    }


def _progreso_por_colaborador(unidades: list[Unit]) -> list[dict]:
    """Agrega el avance por colaborador (del plan) sobre el consolidado.

    Cada tarea aporta su peso al colaborador asignado. Tareas sin colaborador se
    agrupan en '(sin asignar)'.
    """
    acc: dict[str, dict] = {}
    for u in unidades:
        for t in u.tasks:
            if t.is_skipped:
                continue
            quien = (t.colaborador or "").strip() or "(sin asignar)"
            reg = acc.setdefault(quien, {"total": 0, "score": 0.0, "verificadas": 0})
            reg["total"] += 1
            reg["score"] += (t.weight or 0.0)
            if t.is_verified:
                reg["verificadas"] += 1
    salida = []
    for quien, reg in sorted(acc.items(), key=lambda kv: (-kv[1]["total"], kv[0])):
        total = reg["total"] or 1
        salida.append({
            "colaborador": quien,
            "tareas": reg["total"],
            "agent_pct": round(reg["score"] / total * 100, 1),
            "verified_pct": round(reg["verificadas"] / total * 100, 1),
        })
    return salida


def _titulo_desde_indice(contenido: str) -> str:
    """Extrae el título del índice (primera línea '# ...')."""
    for line in contenido.split("\n"):
        m = re.match(r"^#\s+(.+)$", line.strip())
        if m:
            return re.sub(r"^Índice de Progreso\s*[—–-]\s*", "", m.group(1)).strip()
    return "Proyecto AI-DLC"


def _progreso_unidad(u: Unit) -> int:
    """Progreso ponderado de la unidad (verificada=1.0, agente/ajuste=0.9,
    en progreso=0.5), redondeado; mismo criterio que el reporte normal."""
    activas = [t for t in u.tasks if not t.is_skipped]
    if not activas:
        return 0
    acc = 0.0
    for t in activas:
        if t.state == "\u2705":
            acc += 1.0
        elif t.weight == 0.9:
            acc += 0.9
        elif t.state == "\U0001f504":
            acc += 0.5
    return round(acc / len(activas) * 100)


def _unit_dict(u: Unit, rama_canonica: str) -> dict:
    total = len([t for t in u.tasks if not t.is_skipped])
    ver = sum(1 for t in u.tasks if t.is_verified)
    agente = sum(1 for t in u.tasks if t.weight == 0.9)
    prog = sum(1 for t in u.tasks if t.state == "\U0001f504")
    pend = total - ver - agente - prog
    return {
        "nombre": u.name,
        "plan": u.plan,
        "progreso": _progreso_unidad(u),
        "stats": {"verificada": ver, "completada": agente, "progreso": prog, "pendiente": pend},
        "tareas": [
            {
                "id": t.id,
                "tarea": t.description,
                "estado": t.state,
                "estado_label": t.state_label,
                "inicio": t.inicio,
                "fin": t.fin,
                "duracion": t.duracion,
                "rama": t.rama,
                "es_canonica": t.rama == rama_canonica,
                "colaborador": t.colaborador,
                "inicio_plan": t.inicio_plan,
                "fin_plan": t.fin_plan,
                "historias": ", ".join(t.stories) if t.stories else "",
            }
            for t in u.tasks
        ],
    }


# ---------------------------------------------------------------------------
# Serialización a dicts (para JSON / generadores)
# ---------------------------------------------------------------------------

def _stats_dict(s: Stats) -> dict:
    return {
        "total": s.total,
        "agent_pct": s.agent_pct,
        "verified_pct": s.verified_pct,
        "verified": s.verified,
        "agent_done": s.agent_done,
        "adjusting": s.adjusting,
        "in_progress": s.in_progress,
        "pending": s.pending,
    }



