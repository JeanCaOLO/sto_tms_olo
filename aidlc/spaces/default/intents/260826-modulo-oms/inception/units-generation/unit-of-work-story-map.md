# Mapa historias → unidades — Módulo OMS (rebanada delgada)

> Intent: `260826-modulo-oms`. Etapa: Units Generation (re-corrida acotada,
> 2026-10-01). Mapea las historias de la rebanada de 1ª entrega a las 2 unidades.

## Mapa de historias de la rebanada

| Historia | Unit | Directory | Nota |
|---|---|---|---|
| US1 (ver/leer la cola) | U1 | u1-motor-reglas-oms | ColaCandidatos (lectura EFLOW) |
| US7 (T-1) | U1 | u1-motor-reglas-oms | ReglaFecha |
| US8 (horas de corte / fallback ruta) | U1 | u1-motor-reglas-oms | ReglaFecha |
| US9 (dos escrituras: handoff + situación WMS) | U1 (+ U2) | u1-motor-reglas-oms | HandoffPedidosOMS escribe la tabla de U2 |
| US10 (score / prioridad numérica) | U1 | u1-motor-reglas-oms | MotorReglasOMS (submódulo score) |
| US11b (umbral de inyección) | U1 | u1-motor-reglas-oms | MotorReglasOMS |
| US12 (observaciones IA) | U1 | u1-motor-reglas-oms | AnalizadorObservaciones |
| US13 (cliente retira) | U1 | u1-motor-reglas-oms | AnalizadorObservaciones + efecto en MotorReglasOMS |

La tabla propia del OMS (esquema de **U2**) es el destino de la escritura 1 de US9
y la superficie que lee Planificación.

## Historias transversales / cross-cutting

- **US9** cruza U1 (lógica de las dos escrituras) y U2 (esquema de la tabla
  destino de la escritura 1). Se implementa en U1 consumiendo el contrato de U2.

## Orden dentro de cada unidad

- **U1**: esqueleto del motor primero (orquestación + puntos de extensión de
  reglas + adaptadores cola/handoff como interfaces), luego ReglaFecha (T-1),
  luego AnalizadorObservaciones (cliente retira), luego el umbral. US9 (handoff)
  se cablea cuando U2 existe.
- **U2**: migración del esquema `PedidosOMS` (una pasada).

## Verificación de cobertura

- Toda historia de la rebanada (US1, US7, US8, US9, US10, US11b, US12, US13) está
  asignada a U1 (US9 además a U2). Ninguna queda sin unidad.
- Toda unidad tiene historias: U1 (las 8 de la rebanada), U2 (US9 — soporte de
  datos del handoff).
- Historias **diferidas** (US2–US6, US11, US14–US27, US30–US33) y **retiradas**
  (US28–US29, E8/D5) no se asignan en esta corrida acotada — surgirán sus units al
  ampliar el alcance.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work.md`.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/user-stories/stories.md` (rebanada).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/components.md`.

## Assumptions & Open Questions

- Solo se mapean las historias de la rebanada de 1ª entrega (alcance acotado). Las
  diferidas se mapearán en corridas posteriores de Units Generation.
