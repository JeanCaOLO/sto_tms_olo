# 2026-09-16 — Simulador OMS: de vista previa a configurador (prototipo)

## What changed
Se reescribió la vista `/oms/simulador` (`src/pages/oms/simulador/page.tsx`) para
pasar de una "vista previa" puntual a un **configurador de simulaciones**. El
modelo final trata la simulación como una **configuración con nombre que se
guarda**: reglas incluidas, filtro de pedidos por situación (`DISP`/`GENERADA`) y
modo de aplicación (manual/automática/mixta con hora de corte solo en auto/mixta).
Puede haber varias guardadas por compañía pero **solo una activa** (la que se
ejecuta). La pantalla tiene: **catálogo** de simulaciones guardadas (activar /
editar / previsualizar), **modal** Nueva/Editar (nombre + reglas con "seleccionar
todas" + situación + modo + hora de corte condicional), **previsualización** como
tabla estilo Cola (todos los campos, score base vs. simulado) y un **historial de
ejecuciones** al final. Catálogo, preview e historial tienen **toggle
cards/tabla** responsive (solo mobile) y la preview **pagina** igual que la Cola.
Todo es **PROTOTIPO**: datos y persistencia mock (`localStorage` vía `omsApi`);
sin backend ni cálculo real de score.

## Why
El DECIDED del 2026-09-15 (`project.md` § Decided; fuente
`knowledge/documents/2026-09-15-reunion-simulador-oms-configurador-y-bd.md`)
redefinió el Simulador como módulo que define/persiste/programa/aplica la
simulación de priorización por compañía. La vista existente era el prototipo
viejo (Readdy) con niveles nombrados, en contra del DECIDED de prioridades
numéricas. En la revisión con el usuario se acotó el modelo: la "bitácora" no es
un log de corridas sino un **catálogo de configuraciones guardadas**; el nº de
simulaciones/día y el "horario/frecuencia" que se habían planteado sobraban y
contradecían el modo manual — el único parámetro temporal real es la **hora de
corte**, y solo aplica a automática/mixta. Objetivo: ver la **navegación** del
flujo, no construir el motor real.

## How
- Lógica pura de recálculo en `simulador/simulate.ts` (`runSimulation` →
  `SimulatedOrder`, config `RunConfig`), fuera del `.tsx`, conforme a la regla del
  proyecto de mantener la lógica del OMS probable sin React. El reparto de score
  es una heurística mock marcada con `ponytail:`; el cálculo real vive en el motor
  (Lambdas) y queda fuera de alcance.
- Entidades en `types.ts`: `Simulation` (config con nombre, `active`),
  `SimulationExecution` (historial), `ApplyMode` + `APPLY_MODE_LABEL`,
  `OrderSituation`/`SITUATION_OPTIONS`.
- `omsApi` con métodos mock sobre `localStorage`: `getSimulations` (siembra un
  ejemplo por compañía si está vacío), `saveSimulation` (upsert), `activateSimulation`
  (invariante: una activa por compañía), `getExecutions`/`logExecution`.
- Reutilización (regla ponytail, deleción sobre duplicación): toggle cards/tabla
  vía `useOmsView` + `components/ViewToggle` (los mismos de Cola/Auditoría);
  paginación extraída a `usePagination` (hook) + `components/Pagination`
  (barra), con el mismo marcado que tenía inline la Cola, ahora reusable.
- Self-check runnable en `simulador/simulate.check.ts` (asserts, sin framework):
  filtro por situación, orden por score simulado y boost cero sin reglas. Correr
  con `npx tsx src/pages/oms/simulador/simulate.check.ts`.
- Verificación: `pnpm type-check` sin errores nuevos en el subárbol `oms` (los 35
  errores restantes son preexistentes en otros módulos).

## Promoted knowledge
None — es un prototipo navegable, no comportamiento vigente. La fuente de verdad
del alcance del Simulador sigue siendo el DECIDED del 2026-09-15 en `project.md`.
La construcción real (motor de score, ejecución programada, persistencia en
`logistica_olo`) se hará en Construcción sobre el stack oficial (AWS/Lambdas).

## Follow-ups
- [ ] Migrar la Cola de Priorización a `usePagination` + `Pagination`
      compartidos (hoy conserva su barra inline y su paginación en
      `useColaController`; el componente ya está extraído).
- [ ] Sustituir la heurística mock de score por el cálculo real del motor de
      reglas (Lambdas) cuando exista.
- [ ] Persistencia real de simulaciones e historial (esquema `OMS` de
      `logistica_olo`), reemplazando `localStorage`.
- [ ] Ejecución automática/mixta real con hora de corte (hoy se captura pero no
      dispara corridas).
- [ ] Datos mock con situación `GENERADA` para ejercitar "re-simular sobre
      prioridades ya asignadas" (hoy todos los pedidos son `DISP`).
