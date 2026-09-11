# Mapeo al design system — Módulo OMS

> Mapea cada componente de las maquetas del OMS a los componentes REALES ya
> existentes en el repositorio (`src/components/base/*`, `src/components/feature/*`),
> según `PLAN_MODULO_OMS.md` §4 y la ingeniería inversa (`code-structure.md`).
> Regla rectora (NFR10, C4): el OMS **no introduce ningún kit de UI nuevo** ni
> colores fuera de la paleta slate/teal + los 5 estados de badge. Todo componente
> que no exista se construye como **wrapper en `shared/`** sobre estas bases.

## Tokens de diseño (heredados, sin cambios)

| Token | Valor en el repo | Uso en el OMS |
|---|---|---|
| Color primario | `teal-600` (hover `teal-700`) | botones primarios, ítem activo del sidebar, focus ring |
| Fondo de app | `slate-50` | fondo de todas las pantallas OMS |
| Sidebar | `slate-900`, texto blanco/`slate-300` | grupo "OMS" en el sidebar |
| Tarjeta | `bg-white border-slate-200 rounded-lg shadow-sm p-6` | Card de todas las secciones |
| Título | `text-2xl font-bold text-slate-900` | título de cada pantalla |
| Subtítulo | `text-sm text-slate-600` | descripciones |
| Encabezado de tabla | `text-sm font-semibold text-slate-700` | thead de las tablas OMS |
| Badges (5 estados) | `default`=slate · `success`=emerald · `warning`=amber · `danger`=red · `info`=teal | `priority_tier`, estado de reglas, severidad de alertas |
| Iconografía | Remix Icon (`ri-*`), global en `index.html` | iconos del OMS |
| Focus ring inputs | `ring-2 ring-teal-500` | inputs/selects del OMS |

## Mapeo componente-maqueta → componente real

| Componente de la maqueta | Base del design system | ¿Nuevo? | Ubicación propuesta |
|---|---|---|---|
| Chrome (sidebar + header) | layout de `App.tsx` + `Sidebar.tsx` + `Header.tsx` | reutiliza | grupo "OMS" ya en `Sidebar.tsx` |
| CountrySelector | `Select` (`Input.tsx`/`Select.tsx`) | wrapper fino | `src/pages/oms/components/` |
| KpiStatCard | `StatCard` (de `dashboard/page.tsx`) | reutiliza + umbral | wrapper `shared/` con badge de estado |
| PriorityBadge | `Badge` (5 estados) | wrapper de mapeo tier→color | `src/pages/oms/components/PriorityBadge.tsx` |
| DataTable | patrón de tabla de `pedidos/page.tsx` / `dashboard/page.tsx` | wrapper con paginación/orden | `shared/` |
| QueueSidePanel | `Card` + layout | nuevo (patrón UITOP) | `src/pages/oms/components/QueueSidePanel.tsx` |
| OverrideModal | modal (a construir sobre `Card`+`Button`) | nuevo | `shared/` (no existe modal en el repo hoy) |
| RuleBuilder / RuleBuilderRow | `Input`+`Select`+`Button` | nuevo | `src/pages/oms/components/RuleBuilderRow.tsx` |
| SimulationCompare | dos `DataTable` en split | nuevo (composición) | `src/pages/oms/simulador/` |
| Botones de acción | `Button` (`primary/secondary/danger/success/ghost`) | reutiliza | — |
| Formularios (rutas, reglas) | `Input`, `Select` | reutiliza | — |

## Badges — mapeo semántico del OMS

| Concepto OMS | Estado de badge | Color |
|---|---|---|
| priority_tier crítico | `danger` | red |
| priority_tier alto | `warning` | amber |
| priority_tier medio | `info` | teal |
| priority_tier bajo | `default` | slate |
| Regla activa | `success` | emerald |
| Regla inactiva | `default` | slate |
| Alerta crítica (Panel) | `danger` | red |
| Alerta de atención (Panel) | `warning` | amber |

> El mapeo de tiers es ilustrativo hasta cerrar OQ-1 (nº de niveles); si el
> negocio homologa más de 4 niveles, se define una escala adicional sin salir de
> la paleta de 5 estados (p. ej. combinando badge + intensidad textual).

## Componentes nuevos → propuesta de vuelta al design system

Según `PLAN_MODULO_OMS.md` §4 y `Estandares_Desarrollo_AWS_Intelix.md` §11, todo
componente nuevo se construye como wrapper en `shared/` y se documenta para
proponerlo al design system común (evita construir dos veces; p. ej. el
RuleBuilder es reutilizable por el tarifario de Liquidación):

- **Modal** (base de OverrideModal y confirmaciones): hoy no existe en el repo;
  es el candidato más claro a promover al design system.
- **DataTable** con orden/paginación/estados: hoy cada página implementa su
  tabla a mano; unificarla beneficia a todo el TMS.
- **RuleBuilder**: compartible con Liquidación.

## Restricciones de estructura (del estándar §11)

- Límites de línea: *atoms* 120 / *sections* 200 / *pages* 250.
- Patrón objetivo `Page → use<Modulo>Controller → <modulo>Api → axiosApiGateway`;
  el OMS es nuevo, así que se construye ya alineado (a validar con Jean Carlo,
  `PLAN_MODULO_OMS.md` §6.1), en vez de heredar el patrón plano actual.
- Un solo `load()` + `AbortController` por pantalla, con estados
  `loading/error/empty` explícitos.

## Sources

- `PLAN_MODULO_OMS.md` §4 (tabla de tokens y regla de reutilización), §6.1
  (estructura de carpetas y límites de línea).
- `aidlc/spaces/default/codekb/sto_tms_olo/code-structure.md` — componentes base
  reales (`Card/Button/Badge/Input/Select/StatCard`), patrón de tabla, sidebar.
- `aidlc/spaces/default/codekb/sto_tms_olo/architecture.md` — design system y
  patrones de composición existentes.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/refined-mockups/interaction-spec.md`
  — componentes que este mapeo aterriza en el repo.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md`
  — NFR10 (consistencia de UI) y C4 (design system obligatorio).

## Assumptions & Open Questions

- No existe un componente Modal en el repo hoy; se asume que se construye como
  wrapper `shared/` y se promueve al design system (decisión de Construcción).
- La migración al patrón `views/<modulo>/{api,routes,pages,hooks,components}`
  para el OMS queda a validar con Jean Carlo (`PLAN_MODULO_OMS.md` §6.1); no se
  decide en esta etapa.
