# Marca temporal de ingeniería inversa — sto_tms_olo

> Registra cuándo se ejecutó la ingeniería inversa y qué cubrió realmente el
> escaneo. El bloque `## Scope of Analysis` del final es leído por
> `codekb-scope-diff` en la próxima re-ejecución para decidir si un intent
> futuro debe ser advertido antes de sobrescribir este conocimiento.

## Ejecución (re-corrida por el pivote WMH)

- **Fecha de la ingeniería inversa**: 2026-09-30 (re-corrida; la anterior fue el
  2026-08-27 sobre el prototipo React+Supabase, hoy superado).
- **Motivo**: pivote de alcance (OMS + Planificación reemplazan el WMH) + base
  nueva ya integrada (backend Python/Lambdas/SAM). El codekb previo estaba
  anclado al prototipo y quedó obsoleto.
- **Intent activo**: `260826-modulo-oms`
- **Repositorio analizado**: `sto_tms_olo` (repo único).
- **Commit HEAD en el momento del escaneo**: `766c224`
  (`766c224cfba955014de4303d038e65a5280a9406`).
- **Árbol de trabajo**: con cambios sin confirmar (artefactos de AI-DLC bajo
  `aidlc/` en curso durante el escaneo).
- **Topología de la etapa**: `pipeline` — developer-agent escaneó (enlace 1) y el
  conductor sintetizó y escribió los 9 artefactos (enlace 2), con apoyo de
  context-gatherer para el escaneo profundo del backend.

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

Escaneo **parcial (`kind: partial`)** enfocado en lo relevante para el OMS y
Planificación tras el pivote: el backend real (Python/Lambdas/SAM) en
profundidad —cada `app.py` de módulo, templates SAM, Layer `tms_common`,
scopes/permisos, planning— y el frontend en los ejes que tocan al OMS
(`src/pages/oms/`, `src/pages/planificacion/`, `src/lib/tarifas/`, shim
`src/lib/supabase.ts`). Verificó las decisiones C1 (backend Python/SAM), C3
(multi-tenancy por scope, no Lambda por compañía) y C2 (no hay motor de reglas en
backend; el motor vive en TS de frontend). El `server/` Express legacy no se
analizó en detalle (declarado referencia de contrato).

## Scope of Analysis

```yaml
scope_version: 2
kind: partial
intent: 260826-modulo-oms
fingerprint: 766c224cfba955014de4303d038e65a5280a9406
analyzed:
  paths:
    - backend/
    - backend/common-services/
    - backend/common-services/layers/tms_common/tms_common/
    - backend/auth/src/
    - backend/data/src/
    - backend/context/src/
    - backend/eflow/src/
    - backend/admin/src/
    - backend/planning/src/
    - backend/local/
    - backend/tests/
    - backend/README.md
    - backend/pytest.ini
    - backend/requirements-dev.txt
    - src/lib/supabase.ts
    - src/lib/tarifas/
    - src/pages/oms/
    - src/pages/oms/engine/
    - src/pages/planificacion/
    - package.json
    - docs/decisions/0002-backend-lambdas-python-sam.md
    - docs/arquitectura-tms-oms/02-to-be.md
    - docs/wmh-actual/
  components:
    - common-services
    - auth
    - data
    - context
    - eflow
    - admin
    - planning
    - tms_common-layer
    - oms-frontend
    - planificacion-frontend
    - motor-tarifas
    - supabase-client-shim
    - priority-engine
shallow:
  paths:
    - server/
    - sql/
    - src/pages/reglas-tarifa/
    - src/pages/liquidaciones/
    - src/pages/configuracion/
    - src/pages/clientes/
    - src/pages/conductores/
    - src/pages/transportistas/
    - src/pages/vehiculos/
    - src/pages/contratos/
    - src/components/
```
