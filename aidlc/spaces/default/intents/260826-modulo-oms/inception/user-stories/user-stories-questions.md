# User Stories — Preguntas de clarificación (Módulo OMS)

> Las historias se derivan del `requirements.md` v2 (14 FR) y de las decisiones
> firmes de `project.md`. El alcance funcional ya está cerrado; estas preguntas
> solo fijan la **granularidad y el alcance** del mapa de historias. Todas tienen
> valor por defecto; puedes decir "acepta los valores por defecto".

---

## Q1. Granularidad y cobertura del story map

- A. **(por defecto)** Una épica por área funcional (Cola, Motor de Reglas,
  Simulador, Panel/Auditoría, Calendario, Multi-compañía/seguridad, Motor de
  priorización/reglas de negocio) y una historia por comportamiento verificable,
  cubriendo **los 14 FR**. Cada historia traza a su(s) FR.
- B. Solo historias de la **primera entrega** (fecha + cliente retira/
  observaciones + lo mínimo de Cola/Motor para operarlas); el resto como épicas
  sin desglosar.
- X. Other (please specify)

[Answer]: A
## Q2. Historias del motor automático (actor no-humano)

Gran parte del OMS es automática (el motor lee, calcula y escribe sin humano).

- A. **(por defecto)** Modelar esas capacidades como historias con actor
  **"Sistema/Motor OMS"** (p. ej. "Como Motor OMS, calculo la prioridad por T-1
  …"), con criterios Given/When/Then verificables — es lo que exige la fase.
- B. Redactarlas solo como reglas de negocio, sin forma de historia.
- X. Other (please specify)

[Answer]: A
## Q3. Marcado de entrega (primera entrega vs. futuro)

- A. **(por defecto)** Cada historia lleva una etiqueta de entrega: **1ª
  entrega** (Regla 1 fecha + Regla 3 cliente retira/observaciones IA, Cola,
  override, auditoría básica), **siguiente** (Motor catálogo completo,
  Simulador-configurador, multi-compañía), o **futuro** (Regla 4 viaje/bajada,
  Regla 5 inventario). Refleja FR6.
- B. Sin etiquetas de entrega; todas al mismo nivel.
- X. Other (please specify)

[Answer]: A
## Q4. Simulador (configurador) como épica propia

- A. **(por defecto)** Épica propia para el Simulador-configurador con historias
  para: modal previo (reglas activas + filtro de situación), resultado como
  tabla-Cola, entidad Simulación persistida (bitácora), aplicación
  manual/automática/mixta con hora de corte, y configuración por compañía.
- B. Una sola historia de "simular" sin desglosar la configuración.
- X. Other (please specify)

[Answer]: A
## Q5. Persona técnica para las Open Questions

Hay 7 Open Questions que dependen de datos/arquitectura (réplica, BD, fecha de
Cofersa, tabla de prioridades…).

- A. **(por defecto)** No inventar historias sobre lo indefinido: las OQ se
  listan como **dependencias/supuestos** del story map (no como historias), para
  no comprometer comportamiento no decidido.
- B. Crear historias placeholder para las OQ.
- X. Other (please specify)

[Answer]: A

---

## Consolidated Summary Confirmation

Decisiones para el story map del OMS (Q1–Q5 = A) + precisiones:

- **Q1 = A** — épicas por área funcional (Cola, Motor de Reglas,
  Simulador-configurador, Panel/Auditoría, Calendario, Multi-compañía/seguridad,
  Motor de priorización) con una historia por comportamiento verificable,
  cubriendo los 14 FR; cada historia traza a su(s) FR.
- **Q2 = A** — las capacidades automáticas se modelan como historias con actor
  **"Sistema/Motor OMS"**. Sus criterios de aceptación (Given/When/Then)
  reflejan los **invariantes firmes**: el OMS **no escribe fechas**; transición
  **DISP → GENERADA**; **prioridad numérica invertida con score ponderado**.
- **Q3 = A** — cada historia lleva etiqueta de entrega: **1ª entrega** (Regla 1
  fecha + Regla 3 cliente retira/observaciones IA, Cola, override, auditoría
  básica), **siguiente** (Motor catálogo completo, Simulador-configurador,
  multi-compañía) o **futuro** (Regla 4 viaje/bajada, Regla 5 inventario).
- **Q4 = A** — épica propia del Simulador-configurador con historias para: modal
  previo (reglas activas + filtro de situación), resultado como tabla-Cola,
  entidad Simulación persistida (bitácora), aplicación manual/automática/mixta y
  configuración por compañía. Incluye explícitamente la restricción **"una
  simulación aplicada por compañía"** y la **hora de corte del modo mixto** (si
  nadie interviene antes, se aplica sola).
- **Q5 = A** — las 7 Open Questions se listan como dependencias/supuestos del
  story map, no como historias.

Artefactos a producir: `stories.md`, `personas.md`,
`user-stories-assessment.md`, `traceability.json` (IDs `US`, trazando a los FR).

Does this all look correct before I generate the user-stories artifacts?

- Looks correct
- Request changes

Re-corrida 2026-09-30 (pivote WMH) — resumen confirmado: E8/US28-US29 (Calendario
de rutas) RETIRADA por D5; US9 reescrita con el flujo de dos escrituras D6 (tabla
propia del OMS = handoff + situación en WMS = disparo picking, con orden, fallo
parcial idempotente e idempotencia de corrida); US30/US31 multi-compañía por scope
CUSTOMER-WAREHOUSE-COUNTRY-GLOBAL (no Lambda por compañía); US3 reconciliada a
"acotar scope"; US12 clasificación IA con stub; US30 matriz de scope completa. Mob
round 1 integrado (design/developer/quality). C2 RESUELTO: motor de reglas del OMS
propio/nuevo en Lambda (no portar AST, no motor compartido, no tocar Liquidaciones).
Sensores: required-sections PASS, upstream-coverage PASS; traceability = falso
positivo advisory conocido. (La confirmación de la corrida original 2026-09-16 fue
"Looks correct".)

[Answer]: Looks correct
