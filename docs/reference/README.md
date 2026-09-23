# Reference — Contexto de negocio y técnico

Documentos de referencia de larga vida: contexto del proyecto, planes de módulo, análisis del sistema y datos base. No son historias ni requerimientos (esos van en `../stories/` y `../requirements/`); son el material que un dev lee para entender el dominio antes de construir.

| Documento | Qué es |
|-----------|--------|
| [`contexto-proyecto-tms.md`](contexto-proyecto-tms.md) | **Contexto de negocio del proyecto** (kickoff): módulos, equipo, reglas de negocio, diferencias CR/VE. El resto de documentos de esta carpeta lo citan como base. |
| [`analisis-sistema-tms.md`](analisis-sistema-tms.md) | **Fuente de verdad del estado actual del sistema** (2026-09-21): arquitectura real (Express + AWS Aurora, `supabase.ts` como shim), mapa de módulos por ruta, alcance de integración WMS/EFLOW y ERP/EPRAC, roturas de flujo conocidas. |
| [`plan-modulo-oms.md`](plan-modulo-oms.md) | Plan de construcción del módulo OMS (priorización de pedidos, no FIFO). Fase Levantamiento + Discovery. Dueño: Eduardo. |
| [`agentes-ia-kiro.md`](agentes-ia-kiro.md) | Cómo se montan los "agentes" propuestos en las reuniones usando features reales de Kiro (Steering, Skills, Hooks, Specs, MCP). |
| [`estructura-costos-transporte.md`](estructura-costos-transporte.md) | Estudio de costeo de última milla (Costa Rica): costos fijos, 40 componentes variables, depreciación. Versión legible; la ejecutable es [`../../sql/04_costeo_base_costa_rica.sql`](../../sql/04_costeo_base_costa_rica.sql). |

> **Citas históricas:** algunos documentos citan `CONTEXTO_PROYECTO_TMS.md` (el nombre viejo en la
> raíz). El archivo ahora vive aquí como [`contexto-proyecto-tms.md`](contexto-proyecto-tms.md).
