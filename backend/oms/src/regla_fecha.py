"""ReglaFecha — regla T-1 de urgencia por fecha de despacho (esqueleto).

Contrato de la regla (US7/US8):
- Entrada: un PedidoCandidato (con fecha_expedicion_planificada) + ConfiguracionReglas
  (duracion_ruta_dias por scope) + la fecha de "hoy" (inyectada, para que la regla
  sea pura y testeable — no llama al reloj).
- Salida: ResultadoRegla con `puntos` proporcionales a la urgencia. Un pedido cuya
  fecha de alistado objetivo (entrega − duración de ruta) ya pasó o es hoy es el más
  urgente; cuanto más lejos la fecha, menos puntos.
- Errores: no lanza; usa fallback por valor centinela/default.

Decisiones ancladas:
- T-1: listo = entrega − 1 día, AJUSTADA por duración de ruta por scope (DECIDED).
- `FECHAEXPEDICIONPLANIFICADA` es datetime NOT NULL (DDL real) → el fallback (US8)
  NO se dispara por NULL sino por VALOR CENTINELA/DEFAULT (caso Cofersa, que llena
  la fecha por default porque el cliente no la manda).
- El OMS NO modifica la fecha: solo la LEE como criterio.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from models import ConfiguracionReglas, PedidoCandidato, ResultadoRegla

REGLA = "fecha_t1"

# Valor centinela: fecha "por default" que usan clientes que no mandan la fecha de
# entrega real (p.ej. Cofersa). Si la fecha planificada coincide con el centinela,
# no es una fecha real de entrega → se aplica el fallback (tratar como urgente para
# que un humano lo revise, en vez de hundirlo en la cola).
# ponytail: centinela único hardcodeado; techo conocido: cada compañía podría tener
# su propio default. Upgrade path: lista de centinelas por scope en ConfiguracionReglas.
FECHA_CENTINELA = date(1900, 1, 1)

PUNTOS_URGENTE = 100.0   # fecha objetivo ya vencida o es hoy
PUNTOS_FALLBACK = 90.0   # fecha es centinela/default: tratar como casi-urgente
PUNTOS_POR_DIA = 10.0    # cada día de margen resta urgencia


def evaluar(pedido: PedidoCandidato, config: ConfiguracionReglas, hoy: date) -> ResultadoRegla:
    """Evalúa la urgencia por fecha de un pedido. Pura: `hoy` se inyecta."""
    planificada = _solo_fecha(pedido.fecha_expedicion_planificada)

    if planificada == FECHA_CENTINELA:
        return ResultadoRegla(
            regla=REGLA,
            puntos=PUNTOS_FALLBACK,
            detalle=f"Fecha centinela/default ({FECHA_CENTINELA.isoformat()}): fallback, se trata como urgente.",
        )

    # Fecha objetivo de alistado = entrega − duración de ruta (T-1 ajustado por scope).
    objetivo = planificada - timedelta(days=max(1, config.duracion_ruta_dias))
    dias_margen = (objetivo - hoy).days

    if dias_margen <= 0:
        puntos = PUNTOS_URGENTE
        detalle = f"Alistado objetivo {objetivo.isoformat()} <= hoy {hoy.isoformat()}: urgente."
    else:
        puntos = max(0.0, PUNTOS_URGENTE - dias_margen * PUNTOS_POR_DIA)
        detalle = f"{dias_margen} día(s) de margen hasta alistado objetivo {objetivo.isoformat()}."

    return ResultadoRegla(regla=REGLA, puntos=puntos, detalle=detalle)


def _solo_fecha(valor: datetime | date) -> date:
    return valor.date() if isinstance(valor, datetime) else valor
