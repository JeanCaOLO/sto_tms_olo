"""
Mapeo conservador tarea → historias de usuario.

PLANTILLA: este modulo viene VACIO. Cada proyecto lo puebla con la trazabilidad
derivada EXCLUSIVAMENTE de sus propios artefactos:
  - aidlc-docs/inception/application-design/unit-of-work-story-map.md
  - aidlc-docs/construction/plans/*code-generation-plan.md

Cada asociacion debe estar sustentada por texto demostrable del plan y del mapa.
Si no existe evidencia directa se usa "—" (sin asociacion).

Nota de version:
  En AI-DLC v2 la fuente directa de la trazabilidad es el archivo
  `traceability.json` de cada unidad
  (<record>/construction/<unit>/code-generation/traceability.json). En v2,
  preferir ese JSON sobre este mapeo estatico. Este modulo se mantiene como
  respaldo para proyectos v1.

Formato (un diccionario por unidad del tracker):

    UNIDAD_MAP: dict[str, list[str]] = {
        "XX-T01": [],                      # tarea sin historias (transversal)
        "XX-T02": ["US-01", "US-02"],      # tarea que habilita esas historias
        "VER-XX": [],                      # verificacion humana de la unidad
    }

Luego registrar cada mapa en la lista de get_full_mapping().
"""

# ---------------------------------------------------------------------------
# Mapeo por unidad (vacio en la plantilla; poblar por proyecto)
# ---------------------------------------------------------------------------

# Registrar aqui los diccionarios de unidad del proyecto, por ejemplo:
#   INFRASTRUCTURE_MAP, DATA_ACCESS_MAP, API_MAP, FRONTEND_MAP, ...
_MAPAS_POR_UNIDAD: list[dict[str, list[str]]] = []


# ---------------------------------------------------------------------------
# Mapa consolidado
# ---------------------------------------------------------------------------

def get_full_mapping() -> dict[str, list[str]]:
    """Devuelve el mapeo completo task_id → lista de US.

    En la plantilla devuelve {} (sin trazabilidad precargada). El proyecto
    agrega sus diccionarios de unidad a _MAPAS_POR_UNIDAD.
    """
    full: dict[str, list[str]] = {}
    for m in _MAPAS_POR_UNIDAD:
        full.update(m)
    return full
