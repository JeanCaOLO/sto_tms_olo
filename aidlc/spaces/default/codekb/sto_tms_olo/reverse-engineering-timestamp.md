# Marca temporal de ingeniería inversa — sto_tms_olo

> Registra cuándo se ejecutó la ingeniería inversa y qué cubrió realmente el
> escaneo. El bloque `## Scope of Analysis` del final es leído por
> `codekb-scope-diff` en la próxima re-ejecución para decidir si un intent
> futuro debe ser advertido antes de sobrescribir este conocimiento.

## Ejecución

- **Fecha de la ingeniería inversa**: 2026-08-27
- **Intent activo**: `260826-modulo-oms`
- **Repositorio analizado**: `sto_tms_olo` (repo único; la fila de
  `intents.json` no registra un arreglo `repos`).
- **Commit HEAD en el momento del escaneo**: `28d6991`
  (`28d6991e2c4c4e0b8c60e1f09eb54f71d5503e09`).
- **Árbol de trabajo**: con cambios sin confirmar (los artefactos de AI-DLC
  bajo `aidlc/` y `.kiro/specs/` estaban sin versionar en el momento del
  escaneo).
- **Topología de la etapa**: `pipeline` — el desarrollador escaneó (enlace 1) y
  el arquitecto sintetizó y escribió los 9 artefactos (enlace 2, final).

## Artefactos producidos

Los 9 artefactos del codekb viven en
`aidlc/spaces/default/codekb/sto_tms_olo/`:

1. `business-overview.md`
2. `architecture.md`
3. `code-structure.md`
4. `api-documentation.md`
5. `component-inventory.md`
6. `technology-stack.md`
7. `dependencies.md`
8. `code-quality-assessment.md`
9. `reverse-engineering-timestamp.md` (este fichero)

## Naturaleza del escaneo

El escaneo fue **parcial (`kind: partial`)**: se analizó en profundidad el
núcleo de la aplicación (composición, plataforma, router, capa Supabase, hooks,
i18n) y todos los módulos de página adyacentes al OMS (pedidos, planificación,
tracking, guías, devoluciones, liquidaciones, contratos, reportes, clientes,
dashboard, seed), mientras que los módulos de catálogo y las páginas de soporte
(tiendas, países, rutas, vehículos, conductores, transportistas, configuración,
login) se inventariaron solo en superficie. Esta profundidad se eligió para
servir a las etapas siguientes (Requirements Analysis y Domain Design) del
módulo OMS sin gastar presupuesto en áreas fuera de su alcance inmediato.

## Scope of Analysis

```yaml
scope_version: 1
kind: partial
intent: 260826-modulo-oms
fingerprint: 6d27d6aa8ed4155a5ce1ebbf24b8b878111b6ac6
analyzed:
  paths:
    - src/
    - src/components/
    - src/components/base/
    - src/components/feature/
    - src/hooks/
    - src/lib/
    - src/lib/supabase.ts
    - src/router/
    - src/i18n/
    - src/pages/dashboard/
    - src/pages/pedidos/
    - src/pages/oms/
    - src/pages/planificacion/
    - src/pages/tracking/
    - src/pages/guias/
    - src/pages/devoluciones/
    - src/pages/liquidaciones/
    - src/pages/contratos/
    - src/pages/reportes/
    - src/pages/clientes/
    - src/pages/seed/
    - eslint.config.ts
    - eslint-rules/
    - vite.config.ts
    - package.json
    - tsconfig.app.json
    - index.html
    - CONTEXTO_PROYECTO_TMS.md
    - PLAN_MODULO_OMS.md
  components:
    - app-bootstrap
    - app-layout
    - router
    - supabase-client
    - auth-context
    - i18n
    - design-system-base
    - sidebar-nav
    - app-header
    - stat-card
    - csv-import
    - dashboard
    - pedidos
    - oms-prototype
    - planificacion
    - tracking
    - guias
    - devoluciones
    - liquidaciones
    - contratos
    - reportes
    - clientes
    - seed
    - not-found
    - home-dead-code
    - eslint-rule-route-element-jsx
shallow:
  paths:
    - src/pages/tiendas/
    - src/pages/paises/
    - src/pages/rutas/
    - src/pages/vehiculos/
    - src/pages/conductores/
    - src/pages/transportistas/
    - src/pages/configuracion/
    - src/pages/login/
```
