# 2026-09-15 — OMS: re-corrida de Requirements Analysis para alinear requirements.md con las decisiones firmes

Corrida del stage `requirements-analysis` (AI-DLC, intent `260826-modulo-oms`)
que **reescribe por completo** `requirements.md`, tratando el artefacto previo
(generado con Kiro) como base a corregir, no a repetir.

## What changed

Se reescribió `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md`
alineándolo a las ~20 decisiones firmes acumuladas en `project.md` (`## Decided`)
y a tres reuniones ya indexadas en el DocumentKB (funcional con Antonio
2026-09-08, datos/cruce con Calzadilla 2026-09-14, diseño de solución
2026-09-14), más dos decisiones nuevas capturadas hoy. Se respondieron las 5
preguntas de clarificación (Q1–Q5 = A) con dos precisiones (prioridad = score
ponderado desde la 1ª entrega; Regla 4 de viaje/bajada incluida como macro-regla
fuera de la 1ª entrega, con nota de que el viaje lo crea/asigna Planificación/TMS
y el OMS solo lo consume y termina en "alistado"). La revisión advisory quedó
en READY; el gate de aprobación queda pendiente del §13.

Dos decisiones nuevas incorporadas hoy (reunión 2026-09-15, indexada):
- **Simulador = configurador de simulaciones** (no una vista previa puntual):
  entidad persistida (bitácora), modal previo para elegir reglas activas +
  filtro de conjunto de pedidos por situación, aplicación manual/automática/
  mixta con hora de corte, una simulación aplicada por compañía.
- **BD física**: la base de datos se llama `logistica_olo` con dos esquemas,
  `OMS` y `TMS` (esquema por módulo; la multi-compañía sigue siendo `compañía`
  y `país` como columnas).

## Why

`requirements.md` (generado previamente con Kiro) contenía puntos ya superados:
sobre todo un paso de aprobación humana de la propuesta de priorización (no
existe — el cálculo es 100% automático, Adenda 2026-08-26), prioridades por
niveles nombrados en vez de numéricas, un modelo de "lago de datos" que ya no
aplica, y NFR cuantitativos inventados sobre ese modelo. El acumulado de
decisiones firmes (posicionamiento WMS/EFLOW, prioridad numérica invertida
atada a T-1 sin escribir fechas, 5 macro-reglas con 2 en la 1ª entrega, motor =
catálogo semi-configurable, multi-compañía Lambda-por-compañía, fuente
`expedición_cabecera`) hacía necesaria una reescritura, no un parche.

## How

- Stage AI-DLC `requirements-analysis` corrido vía Kiro sobre el intent
  `260826-modulo-oms` (fase Inception). Artefactos bajo
  `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/`
  (`requirements.md`, `requirements-analysis-questions.md`, `memory.md`).
- Fuentes firmes: `aidlc/spaces/default/memory/project.md` (`## Decided`,
  `## Corrections`) y DocumentKB del space `default`
  (`aidlc/spaces/default/knowledge/documents/`), incluidas las notas de reunión
  del 2026-09-08 y 2026-09-14.
- Reunión del 2026-09-15 estructurada e indexada como
  `knowledge/documents/2026-09-15-reunion-simulador-oms-configurador-y-bd.md`
  (DocumentKB id `01a0a65b-9f8c-7b10-a430-99e3c2eb1909`); sus decisiones firmes
  añadidas a `project.md` → `## Decided`.

## Promoted knowledge

- `aidlc/spaces/default/memory/project.md` — dos DECIDED nuevos (Simulador =
  configurador; BD `logistica_olo` con esquemas `OMS`/`TMS`).
- `aidlc/spaces/default/knowledge/documents/2026-09-15-reunion-simulador-oms-configurador-y-bd.md`
  (nuevo, indexado en el DocumentKB) — acta de la reunión del 2026-09-15.
- La verdad viva de requerimientos sigue siendo el propio `requirements.md` del
  intent; esta entrada es solo la traza narrativa de la re-corrida.

## Follow-ups

- [ ] Responder al §13 (aprendizajes) y abrir el gate de aprobación de
      Requirements Analysis; luego seguir con `/aidlc --stage user-stories`.
- [ ] OQ abiertas a cerrar: enfoque de BD aún no oficial (cerrar con
      arquitectura/Calzadilla), réplica de `EFLOW_OLO` por solicitar (Alfredo),
      Cofersa no envía fecha de entrega, tabla de prioridades del cliente, score
      vs. filtro estricto, umbral de inyección, duración de rutas/horas de corte.
- [ ] Sin mecanismo de datos de estimación/métricas en el repo pese a
      `metrics: true` en `crew.json` — no hay archivo donde registrarlos; no se
      inventó ninguno.
