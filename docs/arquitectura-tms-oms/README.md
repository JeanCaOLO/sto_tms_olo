# Arquitectura TMS + OMS OLO — Resumen Ejecutivo

> Fecha: 2026-09-21. Producido a partir de análisis directo del repositorio
> (código, esquema real en AWS Aurora, tests, documentación de negocio en
> `aidlc/spaces/default/memory/project.md` y `CONTEXTO_PROYECTO_TMS.md`), no
> de suposiciones. Cuando algo en el prompt maestro difiere de lo que el
> código realmente hace, se marca **EXPECTED / CURRENT / GAP / RECOMMENDATION**
> en el documento correspondiente en vez de asumir.
>
> **Ningún código de aplicación fue modificado para producir estos
> documentos.** Es la entrega solicitada antes de tocar código: hallazgos,
> arquitectura actual, arquitectura propuesta, modelo de datos, estrategia de
> migración, roadmap, riesgos y decisiones que necesitan aprobación humana.

## Índice de documentos

| # | Documento | Contenido |
|---|---|---|
| 1 | [`01-as-is.md`](./01-as-is.md) | Arquitectura actual, análisis de dominio, problemas del modelo actual |
| 2 | [`02-to-be.md`](./02-to-be.md) | Arquitectura objetivo: jerarquía País→Almacén→Cliente→Cliente Final, OMS/TMS, motor de reglas → optimización → IA, integraciones, multi-país, auditoría |
| 3 | [`03-modelo-datos-erd.md`](./03-modelo-datos-erd.md) | ERD propuesto, tabla por tabla |
| 4 | [`04-matriz-migracion.md`](./04-matriz-migracion.md) | Matriz CURRENT → TARGET, estrategia de migración |
| 5 | [`05-roadmap.md`](./05-roadmap.md) | Roadmap por fases |
| 6 | [`06-adr/`](./06-adr/) | Architecture Decision Records (9 ADRs) |

## 1. Executive Summary

El sistema actual es una SPA React + backend Express propio + PostgreSQL en AWS
Aurora, con un módulo OMS **construido pero no conectado** (100% datos mock) y
un módulo TMS **parcialmente construido y parcialmente conectado** (catálogos y
operación básica sí persisten en Aurora; el motor de tarifas/costeo de
Liquidaciones ya tiene un diseño sofisticado — AST de reglas versionado, con
trazabilidad y snapshot inmutable — pero corre en memoria sobre datos locales,
no sobre las tablas reales; la integración de solo-lectura con EFLOW QA existe
pero solo alimenta Planificación y no tiene credenciales en este entorno).

**El hallazgo más importante para el rediseño**: el repositorio ya contiene,
en `src/lib/tarifas/` (módulo Liquidaciones/Tarifas), un motor de reglas con
exactamente las propiedades que el prompt maestro pide para el motor de reglas
del OMS — reglas versionadas, condiciones tipadas, trazabilidad línea por
línea (`TraceLine`), snapshots inmutables (`Proforma`), y separación explícita
entre costo y tarifa. **No hay que inventar un motor de reglas desde cero**:
hay que generalizar el patrón de ese kernel para que sirva tanto a las reglas
de tarifa/liquidación (TMS) como a las reglas de priorización de pedidos
(OMS), en vez de construir dos motores de reglas independientes.

El segundo hallazgo importante: **el modelo de datos actual no tiene jerarquía
País → Almacén → Cliente → Cliente Final**. Existe `organization_id` como
único límite de tenant, `country_id` como atributo suelto en varias tablas, y
ningún concepto de "almacén/operación" ni de "cliente final" distinto del
`customer` que ya representa a Cofersa/EPA. La sección 4 del prompt maestro
pide exactamente esta jerarquía — es un cambio de modelo real, no cosmético,
y se detalla con opciones concretas en `02-to-be.md` §2 y `03-modelo-datos-erd.md`.

## 2. Problemas y riesgos más importantes (ver detalle en cada documento)

1. El OMS es 100% mock — cualquier "motor de reglas" visible hoy en la UI es
   una simulación sobre `oms/mockData.ts`, no un sistema que decide sobre
   datos reales.
2. No hay integración real con EFLOW de producción (solo QA, solo lectura,
   solo para Planificación, sin credenciales en este entorno) ni con EPRAC
   (cero código de integración).
3. La tabla `zones` no existe pero el frontend la referencia (bug reproducible
   ya documentado en `ANALISIS_SISTEMA_TMS.md`).
4. No existe jerarquía País → Almacén → Cliente → Cliente Final en el modelo
   de datos; "Puntos de Entrega" (`stores`) mezcla conceptos de almacén de
   origen y punto de entrega de destino en una sola tabla.
5. El motor de costeo real (`src/lib/tarifas/`) no está conectado a las
   tablas `rates`/`carriers`/`settlements` de Aurora — vive en datos locales
   en memoria del navegador.
6. No hay motor de reglas para el OMS ni concepto de scope de regla
   (GLOBAL/COUNTRY/WAREHOUSE/CUSTOMER) — las "reglas" del OMS hoy son texto
   descriptivo en `mockData.ts`, no ejecutan lógica real.
7. No hay abstracción de proveedor de mapas, WMS o ERP — cualquier integración
   futura se acoplaría directamente si se construye igual que hoy.
8. `.env` (fuera del alcance de este análisis de arquitectura, ya reportado
   por separado) contiene credenciales reales de AWS y está en el historial
   de git — riesgo de seguridad independiente de este rediseño, pero
   relevante para la sección de Seguridad del TO-BE.

## 3. Cómo leer estos documentos

- `01-as-is.md` y `02-to-be.md` son los documentos centrales — decisiones de
  negocio a confirmar están marcadas `❓ DECISIÓN REQUERIDA` en línea, además
  de resumirse todas juntas en `02-to-be.md` §11.
- `03-modelo-datos-erd.md` es la referencia tabla por tabla — se usa junto con
  `04-matriz-migracion.md` para planear cada migración.
- `05-roadmap.md` secuencia el trabajo; cada fase referencia los ADRs que la
  sustentan.
- Los ADRs en `06-adr/` son el registro de las decisiones estructurales — se
  amplían/corrigen a medida que el equipo confirme o cambie algo.

**No se ha tocado código de aplicación ni se han hecho migraciones.** El
siguiente paso, una vez revisada esta propuesta, es aprobar (o ajustar) el
roadmap de `05-roadmap.md` y empezar por la Fase 0 ahí descrita.
