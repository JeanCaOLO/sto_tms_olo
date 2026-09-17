# Evaluación de las historias de usuario — Módulo OMS

> Autoevaluación de calidad del story map (INVEST, cobertura, testabilidad,
> alineación con lo firme) antes del gate. Complementa a `stories.md`.

## Cobertura de requerimientos

Los 14 FR del `requirements.md` v2 tienen al menos una historia que los cubre
(ver `traceability.json` → `fr_coverage`). 34 historias en 9 épicas.

| FR | Historias | Estado |
|---|---|---|
| FR1 (lectura de cola) | US1 | Cubierto |
| FR2 (T-1) | US7, US8, US9 | Cubierto |
| FR3 (prioridad numérica + score + umbral) | US10, US11, US11b | Cubierto |
| FR4 (override) | US6, US14, US15 | Cubierto |
| FR5 (motor catálogo) | US16, US17, US18 | Cubierto |
| FR6 (5 macro-reglas) | US12, US13, US16 | Cubierto (Regla 4/5 documentadas como futuro) |
| FR7 (IA observaciones) | US12, US13 | Cubierto |
| FR8 (escritura EFLOW) | US9 | Cubierto |
| FR9 (Simulador-configurador) | US19–US24 | Cubierto |
| FR10 (Cola) | US1–US6 | Cubierto |
| FR11 (Panel/Auditoría) | US25, US26, US27 | Cubierto |
| FR12 (Calendario) | US28, US29 | Cubierto |
| FR13 (multi-compañía) | US3, US4, US30, US31 | Cubierto |
| FR14 (seguridad) | US15, US32, US33 | Cubierto |

## Alineación con los invariantes firmes

Verificado que las historias del motor (E2) y del flujo respetan los invariantes
de `project.md`:

- **No escribe fechas**: explícito en US7 (criterio de invariante) y en la
  narrativa de US9.
- **Transición DISP → GENERADA**: explícito en US9.
- **Prioridad numérica invertida con score ponderado**: explícito en US10.
- **Escritura solo a nivel WMS/EFLOW** (no WMH, no intermedias): invariante en
  US9.
- **Cálculo 100 % automático; override = única intervención humana**: E4
  (US14/US15); ninguna historia introduce un paso de aprobación de lote.
- **Simulador**: "una aplicada por compañía" (US22) y "hora de corte del modo
  mixto" (US23) explícitos.
- **Multi-compañía sin perfil-silo**: US3 (alternar compañía en la misma vista).

## INVEST (resumen)

- **Independientes**: las historias son mayormente independientes; las
  dependencias reales (p. ej. US9 requiere US7) se anotan sin encadenar de forma
  artificial.
- **Negociables / Valiosas**: cada una entrega valor a un actor identificado.
- **Estimables**: alcance acotado por historia.
- **Small**: una historia por comportamiento verificable.
- **Testables**: todas en Given/When/Then con criterio de pase/fallo.

## Etiquetas de entrega

- **1ª entrega** (Regla 1 fecha + Regla 3 cliente retira/IA con su clasificación
  US12, Cola, override, auditoría básica, corte por umbral de inyección US11b):
  US1, US2, US6, US7, US9, US10, US11b, US12, US13, US14, US15, US27, US33.
- **Siguiente** (Motor catálogo, Simulador-configurador, multi-compañía, panel):
  US3, US4, US5, US8, US11, US16–US26, US28, US30–US32.
- **Futuro**: US29 (alta de calendario en UI); Regla 4 (viaje/bajada) y Regla 5
  (inventario) se documentan en `requirements.md` pero no generan historias de
  construcción en este ciclo.

## Riesgos / dependencias abiertas

Las historias de 1ª entrega dependen de resolver OQ-2 (réplica `EFLOW_OLO`, hoy
inexistente) y OQ-3 (Cofersa no envía la fecha de entrega → fallback por ruta).
Se listan como dependencias, no como historias (ver `stories.md` → Dependencias
y supuestos). No bloquean la aprobación del story map, pero sí condicionan el
arranque de construcción.

## Veredicto de autoevaluación

El story map cubre los 14 FR, respeta los invariantes firmes, usa Given/When/Then
testable y marca la frontera de entrega. Listo para revisión y gate.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/user-stories/stories.md`
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/user-stories/traceability.json`
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md`
- `aidlc/spaces/default/memory/project.md` (`## Decided`, `## Corrections`).

## Assumptions & Open Questions

Las Open Questions OQ-1..OQ-7 del `requirements.md` se tratan como dependencias
del story map, no como historias. Ver `stories.md` → Dependencias y supuestos.
