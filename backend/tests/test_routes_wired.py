"""Guard de cableado de rutas (API Gateway).

Cada microservicio despacha sus rutas desde un dict ``ROUTES`` en su ``app.py``,
pero API Gateway solo enruta a la Lambda las rutas DECLARADAS como ``RouteKey``
en su ``template.yaml``. Si se agrega un handler a ``ROUTES`` y se olvida el
``RouteKey``, esa ruta devuelve un 404 de gateway (sin header CORS) y nunca
toca la Lambda — justo lo que pasó con ``bandeja`` y ``planes/replanificar``.

Este test afirma que TODA ruta con handler está declarada en el template, por
cada stack que tenga ambos. Falla listando las rutas sin cablear.
"""
import re
from pathlib import Path

import pytest

from conftest import STACK_SOURCES, load_stack_module

BACKEND = Path(__file__).resolve().parent.parent


def _route_keys_del_template(template: Path) -> set[str]:
    txt = template.read_text(encoding="utf-8")
    return {m.strip() for m in re.findall(r"RouteKey:\s*(.+)", txt)}


def _stacks_con_rutas():
    casos = []
    for nombre, src in STACK_SOURCES.items():
        template = src.parent / "template.yaml"
        if not template.exists():
            continue
        try:
            mod = load_stack_module(nombre)
        except Exception:
            continue
        rutas = getattr(mod, "ROUTES", None)
        if isinstance(rutas, dict) and rutas:
            casos.append((nombre, set(rutas.keys()), template))
    return casos


CASOS = _stacks_con_rutas()


@pytest.mark.parametrize("nombre,handlers,template", CASOS, ids=[c[0] for c in CASOS])
def test_toda_ruta_con_handler_esta_cableada_en_el_template(nombre, handlers, template):
    declaradas = _route_keys_del_template(template)
    sin_cablear = handlers - declaradas
    assert not sin_cablear, (
        f"[{nombre}] rutas con handler en app.py pero SIN RouteKey en "
        f"{template.name} (darian 404 en API Gateway): {sorted(sin_cablear)}"
    )


def test_hay_stacks_para_verificar():
    # Red flag si el descubrimiento se rompe y no verifica nada.
    assert CASOS, "No se descubrio ningun stack con ROUTES + template.yaml"
