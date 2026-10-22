# Evaluación de las historias de usuario — Módulo OMS

> Autoevaluación de calidad del story map (INVEST, cobertura, testabilidad,
> alineación con lo firme) antes del gate. Complementa a `stories.md`.
> **Re-corrida v4 (2026-10-16): inversión del flujo OMS↔Planificación.**
> Nomenclatura EFLOW/EPRAC. Cambios D7–D13 absorbidos.

## Cobertura de requerimientos

Los FR activos del `requirements.md` **v4** tienen al menos una historia que los
cubre (ver `traceability.json` → `fr_coverage`). FR12 retirado por D5; FR7
(observaciones IA) diferido a futuro por D11.

| FR | Historias | Estado |
|---|---|---|
| FR0 (activación por Planificación, lambda async) | US0 | Cubierto |
| FR1 (lectura de cola desde public.orders) | US1 | Cubierto |
| FR2 (fecha generalizada T−duración) | US7, US8, US9 | Cubierto |
| FR3 (prioridad numérica + score + umbral) | US10, US11, US11b | Cubierto |
| FR4 (override + cambio sin anular) | US6, US14, US15, US15b | Cubierto |
| FR5 (motor catálogo) | US16, US17, US18 | Cubierto |
| FR6 (macro-reglas; cliente retira = zona) | US13, US16 | Cubierto |
| FR6b (EPA pre-asignada por EPRAC) | US-EPA | Cubierto |
| FR6c (backorder / inventario) | US-BO | Cubierto (esqueleto + OQ) |
| FR7 (IA observaciones) | US12 | **DIFERIDO a futuro (D11)** |
| FR8 (dos escrituras: UPDATE orders + EFLOW real) | US9 | Cubierto |
| FR9 (Simulador-configurador; FR9.0 acceso Developer) | US19–US24, US24b | Cubierto |
| FR10 (Cola) | US1–US6 | Cubierto |
| FR11 (Panel/Auditoría) | US25, US26, US27 | Cubierto |
| ~~FR12 (Calendario)~~ | ~~US28, US29~~ | **RETIRADO por D5** |
| FR13 (multi-compañía por scope) | US3, US4, US30, US31 | Cubierto |
| FR14 (seguridad; acceso Simulador = Developer) | US15, US24b, US32, US33 | Cubierto |

## Alineación con los invariantes firmes

Verificado que las historias del motor (E2) y del flujo respetan los invariantes
de `project.md` (`## Decided`) y los cambios D7–D13:

- **Flujo invertido (D7)**: US0 — Planificación activa al OMS (lambda async,
  `planning_run_id` + scope); US1 lee de `public.orders` (no de EFLOW).
- **No escribe fechas**: explícito en US7 y US9.
- **Dos escrituras (D7/D8)**: US9 — escritura 1 = UPDATE a `public.orders`
  (atómica, nunca `GENE` sin prioridad) + escritura 2 = **EFLOW real**
  (`TPEXSI='GENE'` + `PRIORIDAD`); **el OMS no escribe el número de viaje**.
- **EPA cortocircuita el score (D9)**: US-EPA — prioridad pre-asignada por EPRAC
  (guion-0=0, guion-1=1), sin T−duración ni score.
- **Regla fecha generalizada (D10)**: US7/US8 — `fecha_entrega − duración`, con la
  duración como insumo de Planificación.
- **Cliente retira = zona (D11)**: US13 por `delivery_zone`; US12 (observaciones
  IA) diferida a futuro.
- **Cambio sin anular (D12)**: US15b — reenviar registro; solo la fecha pasa por
  Planificación.
- **Backorder (D13)**: US-BO — loop desacoplado; esqueleto + open questions.
- **Prioridad numérica invertida con score ponderado**: explícito en US10.
- **Cálculo automático; override = única intervención humana manual**: E4.
- **Multi-compañía por SCOPE** (C3-SUPERSEDE): US30/US31.

## INVEST (resumen)

- **Independientes**: mayormente; las dependencias reales (US9 requiere US7) se
  anotan sin encadenar artificialmente.
- **Negociables / Valiosas**: cada una entrega valor a un actor identificado.
- **Estimables / Small**: alcance acotado, una historia por comportamiento.
- **Testables**: todas en Given/When/Then con criterio de pase/fallo (incluidos
  criterios negativos: override sin motivo, EPA↔Cofersa, no escribe fechas).

## Etiquetas de entrega

- **1ª entrega** (activación, Cola desde orders, regla fecha generalizada, EPA,
  cliente-retira por zona, dos escrituras invertidas, override + cambio sin anular,
  auditoría, corte por umbral): US0, US1, US2, US6, US7, US9, US10, US11b, US-EPA,
  US13, US14, US15, US15b, US27, US33.
- **Siguiente** (Motor catálogo, Simulador-configurador, multi-scope, panel,
  backorder): US3, US4, US5, US8, US11, US16–US26, US30–US32, US-BO.
- **Futuro**: US12 (observaciones IA/Bedrock, D11); Regla 4 (viaje/bajada) —
  documentadas, sin historias de construcción en este ciclo.

> **Secuencia de construcción (a aplicar en domain-design)**: priorizar la
> **rebanada delgada** de 1ª entrega (activación US0 + regla fecha US7/US9 +
> cliente-retira por zona US13 + EPA US-EPA) sobre `public.orders` y el flujo
> invertido. Backorder (US-BO) entra como esqueleto + open questions.

## Riesgos / dependencias abiertas

Las historias de 1ª entrega dependen de: **OQ (contrato de la lambda de
activación)** — scope + `planning_run_id` vs. llaves explícitas, a confirmar con
el dueño de Planificación; OQ-3 (Cofersa llena la fecha por default → fallback por
centinela); OQ-8 (gap peso/volumen, `capacity_known:false`). El backorder (US-BO)
depende de **OQ-BO1/BO2/BO3** (tabla/estado de acciones omitidas en EFLOW, fuente
de inventario, disparador del re-chequeo). Se listan como dependencias, no como
historias.

## Veredicto de autoevaluación

El story map cubre los FR activos (FR0 nuevo; FR12 retirado por D5; FR7 diferido
por D11), respeta los invariantes firmes y los cambios D7–D13 (flujo invertido,
escritura real a EFLOW, EPA cortocircuita, fecha generalizada, cliente-retira por
zona, cambio sin anular, backorder), usa Given/When/Then testable y marca la
frontera de entrega. Listo para revisión y gate.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/user-stories/stories.md`
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/user-stories/traceability.json`
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md` (**v4**)
- `aidlc/spaces/default/memory/project.md` (`## Decided`; `## Corrections`).

## Assumptions & Open Questions

Las Open Questions del `requirements.md` v4 (contrato de la lambda de activación,
OQ-BO1/BO2/BO3 del backorder, OQ-2/3/8) se tratan como dependencias del story map,
no como historias. **E8/US28–US29 (Calendario) RETIRADA** por D5; **US12
(observaciones IA) DIFERIDA a futuro** por D11. Ver `stories.md`.
