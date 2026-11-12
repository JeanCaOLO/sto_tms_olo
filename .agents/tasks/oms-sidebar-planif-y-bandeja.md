# Tarea (kiro cli): mover Planificación al sidebar del OMS + nueva vista "Pedidos en Bandeja"

**Rama:** `planificacion-2`. **Verifica:** Claude (Chus revisa).
**Origen:** reunión 2026-10-26 (ver Notion). Solo frontend; el dato de la bandeja
depende de un endpoint (ver §4, marcado como dependencia).

## 1. Sidebar — `src/components/feature/sidebar-nav-items.ts`

`OMS_GROUP.children` debe quedar EXACTAMENTE en este orden:

1. `Panel OMS` — `/oms/panel` (sin cambios)
2. **`Pedidos en Bandeja`** — `/oms/bandeja` — i18nKey `menu.omsBandeja`, icon `ri-inbox-line`, permKey `oms.cola` (reusar; no inventar permiso nuevo salvo que exista) — **NUEVO**
3. `Cola de Priorización` — `/oms/cola` (mismo item actual; cambia solo la etiqueta i18n, ver §3)
4. **`Planificación`** — `/oms/planificacion` — i18nKey `menu.planificacion`, icon `ri-map-pin-add-line`, permKey `planificacion` — **MOVIDO aquí** (entre Cola de Priorización y Motor de Reglas)
5. `Motor de Reglas` — `/oms/reglas`
6. `Simulador` — `/oms/simulador`
7. `Auditoría` — `/oms/auditoria`

Y **quitar** el item `Planificación` de nivel superior que hoy cuelga de la sección
`Ejecución Operativa` (línea del `path: '/planificacion'`). La sección queda con
Guías, Tracking, Devoluciones.

> Posición de "Pedidos en Bandeja": propuesta antes de la Cola (el flujo es
> bandeja → planificación → cola). Si Chus la quiere en otro punto, es 1 línea.

## 2. Rutas — `src/router/config.tsx`  (esto cambia las URLs)

- `Planificación`: cambiar `path: '/planificacion'` → `path: '/oms/planificacion'`
  (mismo `<PlanificacionPage />`).
- Añadir **redirección** del viejo path para no romper enlaces guardados, siguiendo
  el patrón ya usado en este archivo (`/tarifas/flota-propia` → Navigate):
  `{ path: '/planificacion', element: <Navigate to="/oms/planificacion" replace /> }`.
- Añadir ruta nueva: `{ path: '/oms/bandeja', element: <OmsBandejaPage /> }` con su
  `const OmsBandejaPage = lazy(() => import('../pages/oms/bandeja/page'));`.

## 3. i18n del menú — `src/i18n/local/es/menu.ts` y `src/i18n/local/en/menu.ts`

- `menu.omsCola`: `'Pedidos'` → **`'Cola de Priorización'`** (en EN: `'Prioritization Queue'`).
- Añadir `menu.omsBandeja`: `'Pedidos en Bandeja'` (EN: `'Inbox Orders'` o el que use el equipo).

## 4. Nueva vista "Pedidos en Bandeja" — `src/pages/oms/bandeja/`

Copiar la vista de la Cola (`src/pages/oms/cola/page.tsx` + `useColaController.ts` +
los modales si aplican) a `src/pages/oms/bandeja/` y:

**Quitar estas 4 columnas** del `columns` (son las que pidió Chus, verbatim):
- `tier`  → **Prioridad**
- `score` → **Score**
- `status` → **Estado**
- `situation` → **Situación**

Coherencia con la reunión (aplicar también, mismo espíritu):
- Quitar el filtro de **Prioridad** (`tier`) y el de **Estado OMS** (en bandeja nada
  está priorizado/liberado). Estado/Situación siempre son DISP; se pueden dejar de
  mostrar como columna (ya quitadas) pero el filtro de Situación puede quedar.
- Título de la pantalla: "Pedidos en Bandeja". `emptyMessage`/`exportFileName`
  propios (`bandeja`).

**Dato (DEPENDENCIA, confirmar con Eduardo/Chus):** la bandeja = **todos los pedidos
`estado=DISP` y `situacion=DISP`** (la cola cruda de eFlow), SIN el filtro de los
próximos 3 días y SIN exigir `planning_run_id`. La Cola de Priorización sigue con su
fuente actual (priorizados). Si no hay endpoint que devuelva "todos los DISP/DISP",
hace falta uno nuevo (o un parámetro en `omsApi`), distinto de `getQueue`. NO reusar
la query de la cola tal cual.

## 5. Verificación (lo que Claude comprobará)

- `npm run build` / typecheck pasan.
- Sidebar: Planificación aparece dentro de OMS entre Cola de Priorización y Motor de
  Reglas; ya no está en Ejecución Operativa. "Pedidos en Bandeja" visible en OMS.
- `/oms/planificacion` carga el planificador; `/planificacion` redirige a ella.
- `/oms/bandeja` carga la vista nueva sin las 4 columnas (Prioridad, Score, Estado,
  Situación).
- `/oms/cola` sigue funcionando y su etiqueta en el menú dice "Cola de Priorización".
- El e2e `e2e/oms-handoff.spec.ts` sigue verde (su `goto('/oms/cola')` no cambió).

## Fuera de alcance de esta tarea (no tocar)
- La lógica de ventana de 3 días en el backend de Planificación (es otra tarea).
- El Panel OMS (métricas bandeja/priorizados/liberados) — otra tarea.
