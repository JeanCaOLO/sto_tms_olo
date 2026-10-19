"""Detección de "cliente retira" (Capa 1) sobre el texto de OBSERVACIONESEXPEDICION.

En eFlow no hay campo estructurado: la señal es el token RETIR (RETIRA/RETIRAN/
RETIRAR) y variantes (RECOGE, PASA(N) A RETIRAR/BUSCAR, PICK UP). Alta precisión
sobre los datos reales (~0 falsos positivos). La Capa 2 (IA Bedrock para casos
ambiguos, p. ej. negaciones) se suma después.
"""

import re
import unicodedata

_PATRON = re.compile(
    r"(CLIENTE\s+RETIRA|\bRETIRAN?\b|\bRETIRAR|\bRECOGE[RN]?|PASA[RN]?.*(RETIR|BUSCAR|RECOG)|PICK\s*-?\s*UP)"
)


def _normalizar(texto: str) -> str:
    sin_acentos = "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))
    return sin_acentos.upper()


def es_cliente_retira(observacion: str | None) -> bool:
    return bool(observacion) and bool(_PATRON.search(_normalizar(observacion)))
