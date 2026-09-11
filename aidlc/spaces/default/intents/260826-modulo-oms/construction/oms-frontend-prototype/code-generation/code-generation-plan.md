# Plan de generación de código — Prototipo funcional OMS (frontend)

> Corrida aislada (`--single`) de code-generation. Unit sintético
> `oms-frontend-prototype`. NO hubo units-generation / domain-design /
> functional-design / nfr-design / infrastructure-design: por indicación
> explícita del usuario, se procede SOLO con el frontend, tomando como fuente
> `requirements.md` (FR1–FR10), `mockups.md` y `design-system-mapping.md`.

## Alcance

Prototipo visual **navegable** de la UI del OMS dentro de la app existente
`sto_tms_olo`, con **datos MOCK** (sin backend, sin Supabase, sin Lambdas). Es
un mockup funcional, no la implementación productiva: la capa de datos real
(lago/Supabase), la seguridad RLS y la infraestructura quedan fuera y se
construirán en las etapas de diseño/construcción que se saltaron.

## Decisiones de diseño técnico

- **Consistencia con la app**: se reutilizan exclusivamente los componentes base
  del repo (`Card`, `Button`, `Badge`, `Input`, `Select`, `StatCard`), la paleta
  teal-600 + slate, los 5 estados de badge e íconos Remix (`ri-*`). Ningún kit
  de UI nuevo (NFR10 / C4 de requirements.md; regla de proyecto en `project.md`).
- **Patrón §11** (`Estandares_Desarrollo_AWS_Intelix.md`): cada pantalla se
  estructura `Page → use<Pantalla>Controller → omsApi` (capa mock). Un solo
  `load()` por pantalla con estados `loading/error/empty` explícitos y limpieza
  (`cancelled`) al desmontar.
- **Capa mock**: `omsApi` simula latencia asíncrona; en Construcción real se
  reemplaza por la capa de datos, sin tocar los controllers/pages.
- **Tipado**: `useState`/`useEffect` importados explícitamente en los
  controllers `.ts` y en las pages que los usan a nivel superior (el
  `unplugin-auto-import` cubre el runtime, pero los archivos nuevos requerían el
  import explícito para que `tsc --noEmit` los resuelva en este entorno).

## Estructura creada (`src/pages/oms/`)

```
src/pages/oms/
  types.ts                      # tipos del dominio OMS (mock)
  mockData.ts                   # datos mock; calendario real Cofersa CR (34 zonas)
  api/omsApi.ts                 # capa API mock (async)
  components/
    CountrySelector.tsx         # selector de país (FR9)
    PriorityBadge.tsx           # tier -> variante de Badge (no solo color)
    OmsPageHeader.tsx           # header consistente con Dashboard
  panel/{page.tsx,usePanelController.ts}            # FR4
  cola/{page.tsx,useColaController.ts,OverrideModal.tsx}  # FR2/FR3
  reglas/{page.tsx,useReglasController.ts}          # FR5
  simulador/page.tsx                                # FR6
  rutas-despacho/{page.tsx,useRutasController.ts}   # FR1 (cuadrícula semanal)
  auditoria/page.tsx                                # FR7
```

Cableado: 6 rutas `/oms/*` en `src/router/config.tsx` (+ redirect `/oms` →
`/oms/panel`) y grupo colapsable "OMS" en `src/components/feature/Sidebar.tsx`.

## Verificación realizada

- `pnpm run build` (Vite + SWC): **OK** (~10 s; chunk `mockData` presente).
- `pnpm run type-check` (`tsc --noEmit`): **sin errores en `src/pages/oms`**
  (los errores restantes son PRE-EXISTENTES en `reportes`, `rutas`,
  `transportistas`, `vehiculos`, ajenos a esta corrida).
- `eslint src/pages/oms`: **exit 0**.

## Fuera de alcance (explícito)

- Capa de datos real, Supabase, Lambdas, lago de datos.
- Seguridad/RLS, autenticación real (el CountrySelector es local, no del token).
- Persistencia: el override manual y los toggles de regla viven solo en estado
  de sesión (mock).
- Tests automatizados (ver `unit-test-instructions.md`: no hay runner en el repo).

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md`
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/refined-mockups/mockups.md`
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/refined-mockups/design-system-mapping.md`
- `Rutas cofersa - costa rica.csv` (calendario real de 34 zonas, Costa Rica)
- `Estandares_Desarrollo_AWS_Intelix.md` §11 (patrón Page→Controller→Api, límites de línea)
- `aidlc/spaces/default/memory/project.md` (regla de reutilización del design system)

## Assumptions & Open Questions

- El prototipo asume los mismos supuestos que `requirements.md` (niveles de
  prioridad ilustrativos hasta OQ-1; tablas del lago pendientes con datos).
- Al no existir units-generation ni diseño de dominio, no hay contrato de datos
  formal; los tipos de `types.ts` son una aproximación de trabajo para el mock,
  a reconciliar con Domain Design cuando se ejecute.
