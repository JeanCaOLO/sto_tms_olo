"""MotorReglasOMS — orquesta la corrida de priorización del OMS (esqueleto).

Contrato (US10/US11b — orquestación + score):
- Entrada: lista de PedidoCandidato + una función que resuelve ConfiguracionReglas
  por scope + la fecha de "hoy" (inyectada: el orquestador no llama al reloj) + un
  clasificador de observaciones (inyectado: stub en tests, Bedrock en vivo).
- Salida: lista de RegistroPrioridad (uno por pedido) con prioridad numérica.
- Errores: una regla que degrada devuelve ResultadoRegla neutra; el motor no se
  cae por un pedido — lo prioriza con lo que tenga.

Flujo por pedido:
  1. Resuelve la ConfiguracionReglas aplicable por scope (CUSTOMER→…→GLOBAL).
  2. Ejecuta las reglas (ReglaFecha, AnalizadorObservaciones).
  3. Calcula el score ponderado (submódulo puro `score`).
  4. Aplica el efecto cliente-retira (prioridad máxima) y convierte a prioridad.

Multi-compañía por SCOPE (C3-SUPERSEDE): la especificidad por compañía vive en la
config resuelta por scope, no en una Lambda por compañía.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date

import analizador_observaciones as obs
import regla_fecha
import score as score_mod
from analizador_observaciones import Clasificador, clasificador_stub
from models import ConfiguracionReglas, PedidoCandidato, RegistroPrioridad, ResultadoRegla

# Una función que, dado el scope de un pedido, devuelve la config aplicable.
ResolverConfig = Callable[[PedidoCandidato], ConfiguracionReglas]


def priorizar(
    pedidos: list[PedidoCandidato],
    resolver_config: ResolverConfig,
    *,
    hoy: date,
    clasificador: Clasificador = clasificador_stub,
) -> list[RegistroPrioridad]:
    """Prioriza una cola de pedidos. Pura respecto al reloj (`hoy` inyectado)."""
    return [_priorizar_uno(p, resolver_config(p), hoy, clasificador) for p in pedidos]


def _priorizar_uno(
    pedido: PedidoCandidato,
    config: ConfiguracionReglas,
    hoy: date,
    clasificador: Clasificador,
) -> RegistroPrioridad:
    resultados: tuple[ResultadoRegla, ...] = (
        regla_fecha.evaluar(pedido, config, hoy),
        obs.evaluar(pedido, clasificador),
    )
    cliente_retira = any(r.cliente_retira for r in resultados)
    score = score_mod.score_ponderado(resultados, config)
    prioridad = score_mod.score_a_prioridad(score, cliente_retira=cliente_retira, config=config)
    return RegistroPrioridad(
        pk=pedido.pk,
        prioridad=prioridad,
        score=score,
        cliente_retira=cliente_retira,
        resultados=resultados,
    )


# --- Config por defecto del esqueleto (en vivo saldrá de CatalogoReglas) ------

def config_por_defecto(_pedido: PedidoCandidato) -> ConfiguracionReglas:
    """ResolverConfig trivial del esqueleto: misma config para todo scope.

    TODO(CatalogoReglas): resolver pesos/parámetros por scope real
    (CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL) desde la config editable por compañía.
    """
    return ConfiguracionReglas(
        pesos={regla_fecha.REGLA: 1.0, obs.REGLA: 1.0},
        duracion_ruta_dias=1,
        prioridad_cliente_retira=1,
        escribir_prioridad_al_wms=False,  # TODO(negocio): confirmar destino de PRIORIDAD
    )
