"""EstrategiasPrioridad — cómo se convierte el resultado del motor en el NÚMERO de
prioridad de un pedido, elegido POR SCOPE vía config (`ConfiguracionReglas.estrategia`).

Por qué esto es una costura y no un `if compañía`:
- El NÚMERO de prioridad lo calculaba un único punto fijo (`score.score_a_prioridad`).
  Distintas compañías pueden numerar distinto, así que ese punto pasa a ser ELEGIBLE
  por config. Dos niveles de flexibilidad, para no tener que crear una estrategia por
  cada compañía:
    · PARÁMETROS (lo común): una compañía que numere IGUAL con otros números/ancla/piso
      solo cambia parámetros en su fila de config → cero código.
    · ESTRATEGIA NUEVA (lo raro): una FÓRMULA genuinamente distinta → se registra UNA
      función aquí y su fila la apunta. El barrido, la escritura al WMS, el panel y el
      resolver de scope NO cambian.
- Los NOMBRES de las estrategias y los anclas viven en `models` (fuente única); aquí se
  importan. Mantiene el DECIDED "el Motor de Reglas NO es un constructor dinámico": la
  lógica vive en código; la config solo elige cuál y con qué parámetros.

Estrategias actuales:
- 'escala_lineal' (default, retrocompatible): mapea el score ponderado a [1, escala]
  (lo de siempre, `score.score_a_prioridad`). La usan GLOBAL y quien no fije otra.
- 'dias_hasta_salida' (Cofersa, DECIDED 2026-10-29): el número = cuántos días faltan
  para la fecha de salida del pedido. Parámetros de config: `ancla_fecha` (contra qué
  fecha se cuentan los días) y `prioridad_piso` (mínimo de la cola; 0 se reserva para
  el pedido ya liberado, por eso el default es 1 y la cola no muestra 0).

Funciones PURAS (sin I/O): reciben un ContextoPrioridad y devuelven int. Regla de
Testing Posture del proyecto (el cálculo de prioridad es un submódulo puro y testeable).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date

import regla_fecha
import score as score_mod
from models import (
    ANCLA_ENTREGA,
    ESTRATEGIA_DIAS_HASTA_SALIDA,
    ESTRATEGIA_ESCALA_LINEAL,
    PRIORIDAD_PISO_DEFECTO,
    ConfiguracionReglas,
    PedidoCandidato,
)

# Piso de la cola por defecto (el 0 se reserva para el pedido ya LIBERADO). El piso
# real sale de `config.prioridad_piso`; esta constante es solo el default de referencia.
PRIORIDAD_MINIMA_COLA = PRIORIDAD_PISO_DEFECTO

ESTRATEGIA_POR_DEFECTO = ESTRATEGIA_ESCALA_LINEAL


@dataclass(frozen=True)
class ContextoPrioridad:
    """Todo lo que una estrategia puede necesitar para calcular el número de prioridad.

    Se arma en `motor_reglas._priorizar_uno` una vez calculado el score. Agrupar las
    entradas en un contexto deja que una estrategia nueva use el pedido/fecha/score sin
    cambiar la firma del registro ni los llamadores.
    """

    pedido: PedidoCandidato
    hoy: date
    score: float
    cliente_retira: bool
    config: ConfiguracionReglas


# Una estrategia: del contexto al número de prioridad (numérico invertido, menor = más urgente).
EstrategiaPrioridad = Callable[[ContextoPrioridad], int]


def escala_lineal(ctx: ContextoPrioridad) -> int:
    """Esquema clásico: mapea el score ponderado a [1, escala_prioridad] (invertido).

    Delega en el submódulo puro `score`; es el comportamiento previo del motor, intacto.
    """
    return score_mod.score_a_prioridad(ctx.score, cliente_retira=ctx.cliente_retira, config=ctx.config)


def dias_hasta_salida(ctx: ContextoPrioridad) -> int:
    """Esquema de Cofersa: el número = días que faltan para la salida del pedido.

    Parametrizado por la config (no hace falta una estrategia nueva por compañía):
    - `ancla_fecha`: 'alistado' (default, entrega − lead_time) o 'entrega' (cruda).
    - `prioridad_piso`: mínimo de la cola (default 1; 0 se reserva para el liberado).

    Casos: cliente-retira → el piso (máxima que la cola puede mostrar); fecha
    centinela/default (el cliente no mandó fecha) → el piso (urgente); resto →
    max(piso, días hasta el ancla). El número se recalcula en cada barrido, así que
    baja solo conforme se acerca la fecha.
    """
    piso = ctx.config.prioridad_piso
    if ctx.cliente_retira:
        return piso
    if ctx.config.ancla_fecha == ANCLA_ENTREGA:
        objetivo = regla_fecha.fecha_entrega(ctx.pedido)
    else:
        objetivo = regla_fecha.fecha_alistado_objetivo(ctx.pedido)
    if objetivo is None:
        return piso
    return max(piso, (objetivo - ctx.hoy).days)


_REGISTRO: dict[str, EstrategiaPrioridad] = {
    ESTRATEGIA_ESCALA_LINEAL: escala_lineal,
    ESTRATEGIA_DIAS_HASTA_SALIDA: dias_hasta_salida,
}


def resolver(nombre: str | None) -> EstrategiaPrioridad:
    """Devuelve la estrategia por nombre. Nombre desconocido/None → la de por defecto
    (`escala_lineal`), para degradar sin romper si una fila trae un valor inesperado."""
    return _REGISTRO.get(nombre or ESTRATEGIA_POR_DEFECTO, escala_lineal)
