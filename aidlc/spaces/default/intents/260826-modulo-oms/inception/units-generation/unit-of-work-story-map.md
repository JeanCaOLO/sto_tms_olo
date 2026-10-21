# Mapa historias → unidades — Módulo OMS (rebanada delgada)

> Intent: `260826-modulo-oms`. Etapa: Units Generation (re-corrida v4, 2026-10-16,
> inversión del flujo). Mapea las historias de la rebanada de 1ª entrega a las 2
> unidades (U1 motor, U2 backorder). Nomenclatura EFLOW/EPRAC.

## Mapa de historias de la rebanada

| Historia | Unit | Directory | Nota |
|---|---|---|---|
| US0 (activación por Planificación) | U1 | u1-motor-reglas-oms | LambdaActivacion (entrada async) |
| US1 (ver/leer la cola) | U1 | u1-motor-reglas-oms | ColaCandidatos (lee `public.orders`) |
| US7 (fecha generalizada T−duración) | U1 | u1-motor-reglas-oms | ReglaFecha |
| US8 (duración de Planificación / horas de corte) | U1 | u1-motor-reglas-oms | ReglaFecha |
| US9 (UPDATE orders + escritura EFLOW real) | U1 | u1-motor-reglas-oms | HandoffPedidosOMS (sin número de viaje) |
| US10 (score / prioridad numérica) | U1 | u1-motor-reglas-oms | MotorReglasOMS (submódulo score) |
| US11b (umbral de inyección) | U1 | u1-motor-reglas-oms | MotorReglasOMS |
| US-EPA (prioridad pre-asignada por EPRAC) | U1 | u1-motor-reglas-oms | ReglaEPA (cortocircuita score) |
| US13 (cliente retira por zona) | U1 | u1-motor-reglas-oms | ReglaClienteRetiraZona |
| US-BO (backorder/inventario) | U2 | u2-backorder-inventario-oms | BackorderInventario (loop desacoplado) |

`US9` escribe en `public.orders` (ya existe) + EFLOW real; **no** hay unit de
esquema (la tabla `oms.pedidos` fue descartada).

## Historias fuera de esta corrida

- **US12** (observaciones IA/Bedrock): **DIFERIDA a futuro** (D11) — cliente-retira
  es zona (US13), no observaciones. No se asigna a ninguna unit en esta rebanada.
- Historias **diferidas** (US2–US6, US11, US14–US27 incl. US15b/US24b, US30–US33) y
  **retiradas** (US28–US29, E8/D5) no se asignan aquí — surgirán sus units al
  ampliar el alcance.

## Orden dentro de cada unidad

- **U1**: esqueleto del motor primero (LambdaActivacion + orquestación +
  adaptadores cola/handoff como interfaces), ReglaFecha (T−duración), ReglaEPA
  (cortocircuito), ReglaClienteRetiraZona, el umbral, y el handoff (US9: UPDATE
  orders + EFLOW).
- **U2**: esqueleto del loop de backorder (lectura de acciones omitidas → chequeo
  inventario → re-generar vía el handoff de U1); diseño fino tras cerrar
  OQ-BO1/BO2/BO3.

## Verificación de cobertura

- Historias de la rebanada en U1: US0, US1, US7, US8, US9, US10, US11b, US-EPA,
  US13. En U2: US-BO. Ninguna de la rebanada queda sin unidad.
- Toda unidad tiene historias: U1 (9), U2 (US-BO).
- US12 fuera (diferida); diferidas/retiradas no se asignan en esta corrida acotada.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work.md`.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/user-stories/stories.md` (v4, rebanada).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/components.md` (v4).

## Assumptions & Open Questions

- Solo se mapean las historias de la rebanada de 1ª entrega (alcance acotado). Las
  diferidas se mapearán en corridas posteriores de Units Generation.
