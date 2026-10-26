"""Cálculo de score ponderado del OMS — SUBMÓDULO PURO Y TESTEABLE.

Regla de Testing Posture del proyecto: la lógica de negocio (en especial el
cálculo de prioridad del OMS) se extrae a un módulo puro, sin I/O (sin DB, sin
red, sin reloj), para probarla sin montar nada. Este archivo NO importa pg,
ni EFLOW, ni Bedrock: recibe los resultados de las reglas ya calculados y la
configuración, y devuelve el score y la prioridad numérica.

Contrato:
- Entrada: resultados de reglas (ResultadoRegla) + ConfiguracionReglas (pesos).
- Salida: score ponderado (float) y prioridad numérica invertida (int).

Decisión de dominio: prioridad NUMÉRICA INVERTIDA — menor número = mayor
prioridad (match con el WMS). MÁS score = MÁS urgente = MENOR número de prioridad.
"""

from __future__ import annotations

from collections.abc import Iterable

from models import ConfiguracionReglas, ResultadoRegla

# Prioridad base cuando el score es 0 (sin urgencia). Numérica invertida: un
# número alto = baja prioridad. El score urgente la baja hacia 1.
# ponytail: mapa score→prioridad lineal y acotado; es el heurístico mínimo del
# esqueleto. Techo conocido: no modela empates ni cupos por día (las ~2
# prioridades/día del DECIDED). Upgrade path: ranking por corrida en MotorReglasOMS.
PRIORIDAD_BASE = 100
PRIORIDAD_MINIMA = 1


def score_ponderado(resultados: Iterable[ResultadoRegla], config: ConfiguracionReglas) -> float:
    """Suma ponderada de las contribuciones de cada regla.

    Entradas:
      - resultados: iterable de ResultadoRegla (una por regla ejecutada).
      - config: ConfiguracionReglas con `pesos` (nombre_regla → peso).
    Salida:
      - float >= 0. Una regla sin peso configurado pesa 0 (no rompe: se ignora su
        aporte, no es un error — el esqueleto degrada en vez de fallar).
    Errores: ninguno; función total sobre entradas bien formadas.
    """
    total = 0.0
    for r in resultados:
        peso = config.pesos.get(r.regla, 0.0)
        total += peso * r.puntos
    return total


def score_a_prioridad(score: float, *, cliente_retira: bool, config: ConfiguracionReglas) -> int:
    """Convierte un score ponderado en prioridad numérica invertida (menor = más urgente).

    La escala es POR COMPAÑÍA (`config.escala_prioridad`): Cofersa = 5 → prioridades
    en 1..5; otra compañía puede tener otra escala. El score (0..PRIORIDAD_BASE, con
    PRIORIDAD_BASE como urgencia máxima de referencia) se mapea linealmente e invertido
    a [1, escala]: score alto (urgente) → 1; score 0 → `escala`.

    Entradas:
      - score: puntaje ponderado (>= 0). Mayor score → menor número de prioridad.
      - cliente_retira: si True, cortocircuita a la prioridad máxima configurada
        (caso cliente-retira: prioridad más alta, US12/US13), acotada a la escala.
      - config: ConfiguracionReglas (usa prioridad_cliente_retira y escala_prioridad).
    Salida:
      - int en [PRIORIDAD_MINIMA, escala]. Nunca < 1.
    Errores: ninguno; se acota (clamp) para no salir del rango válido.

    Nota: con `escala_prioridad == PRIORIDAD_BASE` (default del esqueleto) se reduce
    al clásico ~(PRIORIDAD_BASE − score), por lo que el contrato previo se preserva.
    """
    escala = max(PRIORIDAD_MINIMA, config.escala_prioridad)
    if cliente_retira:
        return max(PRIORIDAD_MINIMA, min(escala, config.prioridad_cliente_retira))
    # Mapa lineal invertido [0, PRIORIDAD_BASE] → [escala, 1]. int() trunca hacia
    # abajo para que más score nunca dé un número de prioridad mayor (menos urgente).
    paso = (escala - 1) / PRIORIDAD_BASE
    prioridad = escala - int(score * paso)
    return max(PRIORIDAD_MINIMA, min(escala, prioridad))
