# Evaluación de las historias de usuario — Módulo OMS

> Autoevaluación de calidad del story map (INVEST, cobertura, testabilidad,
> alineación con lo firme) antes del gate. Complementa a `stories.md`.
> **Re-corrida por el pivote WMH (2026-09-30)**: E8/US28–US29 (FR12) retirada;
> multi-compañía por scope; D6 dos escrituras.

## Cobertura de requerimientos

Los FR activos del `requirements.md` v3 tienen al menos una historia que los
cubre (ver `traceability.json` → `fr_coverage`). 32 historias activas en 8
épicas (E8 retirada). FR12 retirado por D5.

| FR | Historias | Estado |
|---|---|---|
| FR1 (lectura de cola) | US1 | Cubierto |
| FR2 (T-1) | US7, US8, US9 | Cubierto |
| FR3 (prioridad numérica + score + umbral) | US10, US11, US11b | Cubierto |
| FR4 (override) | US6, US14, US15 | Cubierto |
| FR5 (motor catálogo) | US16, US17, US18 | Cubierto |
| FR6 (5 macro-reglas) | US12, US13, US16 | Cubierto (Regla 4/5 como futuro) |
| FR7 (IA observaciones) | US12, US13 | Cubierto |
| FR8 (dos escrituras: tabla OMS + situación WMS) | US9 | Cubierto |
| FR9 (Simulador-configurador) | US19–US24 | Cubierto |
| FR10 (Cola) | US1–US6 | Cubierto |
| FR11 (Panel/Auditoría) | US25, US26, US27 | Cubierto |
| ~~FR12 (Calendario)~~ | ~~US28, US29~~ | **RETIRADO por D5** |
| FR13 (multi-compañía por scope) | US3, US4, US30, US31 | Cubierto |
| FR14 (seguridad) | US15, US32, US33 | Cubierto |

## Alineación con los invariantes firmes

Verificado que las historias del motor (E2) y del flujo respetan los invariantes
de `project.md` (`## Decided`):

- **No escribe fechas**: explícito en US7 (criterio de invariante) y US9.
- **Dos escrituras (D6)**: US9 — escritura 1 en la **tabla propia del OMS**
  (handoff, atómica, nunca `GENERADA` sin prioridad) + escritura 2 de `situación`
  en el WMS (disparo de picking). Planificación lee de la tabla del OMS.
- **Prioridad numérica invertida con score ponderado**: explícito en US10.
- **No toca el WMH**: criterio negativo en US9.
- **Cálculo 100 % automático; override = única intervención humana**: E4
  (US14/US15); ninguna historia introduce aprobación de lote.
- **Simulador**: "una aplicada por compañía" (US22) y "hora de corte del modo
  mixto" (US23) explícitos.
- **Multi-compañía por SCOPE** (C3-SUPERSEDE): US30 (aislamiento por scope
  país→almacén→cliente, fail-closed, "EPA nunca ve Cofersa") y US31 (reglas con
  scope en Lambdas compartidas, no una Lambda por compañía).

## INVEST (resumen)

- **Independientes**: mayormente; las dependencias reales (US9 requiere US7) se
  anotan sin encadenar artificialmente.
- **Negociables / Valiosas**: cada una entrega valor a un actor identificado.
- **Estimables / Small**: alcance acotado, una historia por comportamiento.
- **Testables**: todas en Given/When/Then con criterio de pase/fallo (incluidos
  criterios negativos: override sin motivo, EPA↔Cofersa, no escribe fechas).

## Etiquetas de entrega

- **1ª entrega** (Regla 1 fecha T-1 + Regla 2/3 cliente retira/observaciones IA,
  Cola, dos escrituras, override, auditoría, corte por umbral): US1, US2, US6,
  US7, US9, US10, US11b, US12, US13, US14, US15, US27, US33.
- **Siguiente** (Motor catálogo, Simulador-configurador, multi-scope, panel):
  US3, US4, US5, US8, US11, US16–US26, US30–US32.
- **Futuro**: Regla 4 (viaje/bajada) y Regla 5 (inventario) — documentadas, sin
  historias de construcción en este ciclo.

> **Secuencia de construcción (decisión de negocio, a aplicar en domain-design)**:
> priorizar la **rebanada delgada de las 2 reglas de 1ª entrega** (T-1 US7/US9/
> US10 + cliente retira/observaciones US12/US13) antes que el resto, para empezar
> a construir sobre lo estable mientras C2 (motor de reglas) y OQ-8 (gap
> peso/volumen) se resuelven en paralelo.

## Riesgos / dependencias abiertas

Las historias de 1ª entrega dependen de OQ-2 (réplica `EFLOW_OLO`, hoy
inexistente/mock), OQ-3 (Cofersa no envía la fecha → fallback por ruta) y OQ-8
(gap peso/volumen del handoff, `capacity_known:false`). Se listan como
dependencias, no como historias. C2 (dónde vive el motor de reglas: portar AST
TS→Python vs. motor nuevo) se resuelve en domain-design.

## Veredicto de autoevaluación

El story map cubre los FR activos (FR12 retirado por D5), respeta los invariantes
firmes (incluida la doble escritura D6 y el scope C3-SUPERSEDE), usa
Given/When/Then testable y marca la frontera de entrega y la rebanada de 1ª
entrega. Listo para revisión y gate.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/user-stories/stories.md`
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/user-stories/traceability.json`
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md` (v3)
- `aidlc/spaces/default/memory/project.md` (`## Decided` D1–D6, C3-SUPERSEDE; `## Corrections`).

## Assumptions & Open Questions

Las Open Questions OQ-1..OQ-8 del `requirements.md` v3 se tratan como
dependencias del story map, no como historias. La épica **E8/US28–US29
(Calendario de rutas) queda RETIRADA** por D5. Ver `stories.md` → Dependencias y
Fuera de alcance.
