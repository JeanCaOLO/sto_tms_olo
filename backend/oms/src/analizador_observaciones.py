"""AnalizadorObservaciones — clasifica el texto libre de observaciones (esqueleto).

Contrato (US12/US13):
- Entrada: un PedidoCandidato (con `observaciones`, texto libre).
- Salida: ResultadoRegla con la señal `cliente_retira` y puntos de urgencia; la
  primera salida a implementar del DECIDED es "cliente retira" (prioridad máxima +
  viaje/cliente dummy, efecto que aplica MotorReglasOMS).
- Degrada SIN bloquear: si el clasificador falla, devuelve una ResultadoRegla
  neutra (0 puntos, cliente_retira=False) en vez de romper la corrida.

Decisiones ancladas:
- La clasificación real usará MODELOS NATIVOS DE AMAZON BEDROCK (ultraligeros),
  con el prompt en la Lambda (no editable desde la UI). AÚN NO INTEGRADO.
- Para el ESQUELETO se usa un CLASIFICADOR STUB determinístico (abajo), por
  palabras clave. Es intercambiable: el analizador recibe el clasificador por
  inyección, así los tests usan el stub y en vivo se pasa el cliente Bedrock.

TODO(Bedrock): reemplazar `clasificador_stub` por un clasificador real contra
Amazon Bedrock. Reactivar nfr/infra-design antes de conectar Bedrock en vivo
(ver external-dependency-map.md, gate de reactivación).
"""

from __future__ import annotations

from collections.abc import Callable

from models import PedidoCandidato, ResultadoRegla

REGLA = "observaciones"

# Un clasificador toma el texto de observaciones y devuelve etiquetas detectadas.
Clasificador = Callable[[str], frozenset[str]]

ETIQUETA_CLIENTE_RETIRA = "cliente_retira"
PUNTOS_CLIENTE_RETIRA = 100.0

# Palabras clave del stub determinístico. ponytail: heurístico de keywords, no IA;
# techo conocido: no entiende variantes/typos ni contexto. Upgrade path: Bedrock.
_KEYWORDS_CLIENTE_RETIRA = ("cliente retira", "retira cliente", "pasa a buscar", "recoge en bodega", "pickup")


def clasificador_stub(texto: str) -> frozenset[str]:
    """Clasificador STUB determinístico por palabras clave (reemplaza a Bedrock en el esqueleto).

    Entrada: texto de observaciones (ya normalizado o no).
    Salida: conjunto de etiquetas detectadas (hoy solo ETIQUETA_CLIENTE_RETIRA).
    """
    bajo = (texto or "").lower()
    etiquetas = set()
    if any(k in bajo for k in _KEYWORDS_CLIENTE_RETIRA):
        etiquetas.add(ETIQUETA_CLIENTE_RETIRA)
    return frozenset(etiquetas)


def evaluar(pedido: PedidoCandidato, clasificador: Clasificador = clasificador_stub) -> ResultadoRegla:
    """Clasifica las observaciones del pedido. Degrada a neutro si el clasificador falla."""
    texto = pedido.observaciones or ""
    if not texto.strip():
        return ResultadoRegla(regla=REGLA, puntos=0.0, detalle="Sin observaciones.")

    try:
        etiquetas = clasificador(texto)
    except Exception as err:  # noqa: BLE001 — degradar sin bloquear la corrida es intencional
        return ResultadoRegla(
            regla=REGLA,
            puntos=0.0,
            detalle=f"Clasificador no disponible, se continúa sin clasificar: {err}",
        )

    if ETIQUETA_CLIENTE_RETIRA in etiquetas:
        return ResultadoRegla(
            regla=REGLA,
            puntos=PUNTOS_CLIENTE_RETIRA,
            cliente_retira=True,
            detalle="Observación clasificada como cliente retira.",
        )
    return ResultadoRegla(regla=REGLA, puntos=0.0, detalle=f"Etiquetas: {sorted(etiquetas) or 'ninguna'}.")
