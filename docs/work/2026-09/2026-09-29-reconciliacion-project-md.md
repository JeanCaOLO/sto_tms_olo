# Reconciliación de `project.md`: `main` vs backup

**Fecha:** 2026-09-29
**Objetivo:** producir un `project.md` **unificado** que no pierda nada de ninguna de las dos
ramas, para que Kiro lo persista vía el ritual §13. Compara la memoria de AI-DLC entre
`origin/main` (base nueva) y `backup/dev-pre-wmh-2026-09-29` (nuestro `dev`).

**Cómo leer:** las secciones `## Testing Posture`, `## Code Style`, `## Way of Working`,
`## Walking Skeleton`, `## Deployment`, `## Tech Stack` son **idénticas** en ambas ramas — no
se listan. Solo difieren `## Decided` y `## Corrections`, que se detallan abajo.

Leyenda de acción: **MANTENER** (queda tal cual) · **AÑADIR** (traer a la rama unificada) ·
**REVISAR** (decisión humana antes de fijar) · **SUPERSEDE** (nueva decisión reemplaza a una vieja).

---

## Parte A — `## Decided`

### A.1 — Idénticas en ambas ramas (MANTENER, sin cambios)

Las 21 decisiones desde `El cálculo de prioridad del OMS es 100% automático` (2026-08-28)
hasta `BD física: logistica_olo con esquemas OMS y TMS` (2026-09-15) son **iguales** en `main`
y en el backup. Se conservan sin tocar.

> Incluye: cálculo 100% automático · prioridades numéricas · calendario dueño del TMS ·
> stack oficial Intelix · una sola BD (compañía/país como columnas) · núcleo compartido del
> TMS · arquitectura de repos (monorepo back + front aparte) · alcance "termina en alistado" ·
> mecánica (no escribe fechas, cambia estado/situación) · fuente de datos WMS/EFLOW + cruce ·
> prioridad atada a fecha (T-1) · 5 macro-reglas · vista Motor de Reglas (catálogo) ·
> facturación por compañía · alcance actual (lee/escribe a nivel WMS) · score ponderado ·
> IA para observaciones (Bedrock) · una Lambda por compañía · Capa X · roles de pantallas ·
> asignación de viaje (Planificación) · Calendario de Rutas (consulta) · Simulador=configurador.

### A.2 — Solo en `main` (AÑADIR a la unificada)

| # | Decisión | Acción |
|---|---|---|
| D-JC1 | **Mandato de Jean Carlo (2026-09-16, oficial 2026-09-21):** Cofersa/EPA como clientes reales; Transportistas con cuenta/Softland/contrato+vencimiento; Conductores con catálogo de tipos de licencia; **5 tipos de tarifa** (km, unidad, fija, volumen, tendering); **modelo de costo/km** en 3 valores (operativo/km, facturable/km ajustado por km vacíos, venta/km = facturable ÷ (1−margen)) con costo/km = fijo+variable+diésel+utilidad por vehículo; **Planificación automática** con prioridad a flota propia + fecha de entrega; **ruteo dinámico multi-fuente**. Borrador `sql/05_catalogos_tarifario_borrador.sql`. | **AÑADIR** (mandato oficial) |
| D-JC2 | **`DECIDED (ABIERTO)`** — mecánica fina aún sin definir: qué es "unificar" Clientes y Puntos de Entrega; mecánica de tendering; base del % de ocupación; origen del % de margen; si el contrato del transportista usa `contracts` existente; si "prioridad por fecha de entrega" = Regla T-1 del OMS o distinta. Construir sobre la interpretación más segura y ajustar; **no re-preguntar el mandato**, solo estos detalles. | **AÑADIR** |

### A.3 — Solo en el backup (AÑADIR a la unificada)

Ninguna. Todas las decisiones del backup están también en `main`.

---

## Parte B — `## Corrections` (learnings)

### B.1 — Idénticas (MANTENER)

Los learnings desde `2026-08-28` hasta los tres de `code-generation` (`2026-09-01`) son iguales
en ambas ramas.

### B.2 — Diferencias

| # | Learning | `main` | backup | Acción |
|---|---|---|---|---|
| L1 | "ALWAYS fechar las entradas de `docs/work/` con la fecha REAL…" | fecha **2026-09-15** | fecha **2026-09-16** | **REVISAR** (cosmético — fijar la fecha real correcta; da igual cuál, pero una sola) |
| L2 | "Al re-correr una etapa por drift, consultar PRIMERO `project.md`…" | fecha **2026-09-15** | fecha **2026-09-16** | **REVISAR** (cosmético, igual que L1) |
| L3 | "Al emitir `ARTIFACT_UPDATED` a mano vía `aidlc-write-audit-log.ts` (mayúscula en la letra de unidad)…" (2026-09-16) | ❌ **ausente** | ✅ presente | **AÑADIR** (learning operativo válido del harness ACP; recuperar del backup) |
| L4 | "NEVER tratar las notas de catálogos/tarifario/planificación de Jean Carlo como borrador en pausa: son mandato oficial desde 2026-09-21" | ✅ presente | ❌ ausente | **AÑADIR** (coherente con D-JC1/D-JC2) |

> Resultado esperado en la rama unificada: **L1–L4 todos presentes** (L3 recuperado del backup,
> L4 traído de `main`), con las fechas de L1/L2 fijadas a la real.

---

## Parte C — Artefactos de intent (fuera de `project.md`, pero parte del merge)

| Artefacto | `main` | backup | Acción |
|---|---|---|---|
| OMS `requirements.md` | ✅ idéntico | ✅ | **MANTENER** |
| OMS `stories.md` | ⚠️ recortado ~80 líneas | ✅ completo | **AÑADIR** (recuperar la versión completa del backup y luego reconciliar con el `02-to-be`) |
| OMS `domain-design/` | ❌ ausente | ✅ completo | **AÑADIR + REVISAR** (recuperar del backup; reconciliar con el motor de reglas compartido del `02-to-be`) |
| OMS `units-generation/` | ❌ ausente | ✅ | **AÑADIR + REVISAR** (recuperar; revalidar contra el backend definitivo) |
| Planificación `260825-route-planning-reqs` | ✅ idéntico | ✅ | **MANTENER** |

---

## Parte D — Contradicciones de diseño que la unificación debe resolver

Estas no son diferencias de texto entre ramas, sino choques entre **nuestras decisiones** y la
**arquitectura nueva** (`docs/arquitectura-tms-oms/`). Requieren decisión humana y, si cambian
algo firme, un `DECIDED` nuevo que lo **SUPERSEDE** vía §13.

| # | Nuestra decisión (vigente en `project.md`) | Lo que hay en la base nueva | Acción |
|---|---|---|---|
| C1 — Backend | `DECIDED` 2026-09-03/04: **Python + Lambdas + SAM** + `common-services` | ✅ **COINCIDE.** Verificado contra el código: `backend/` está en **Python + Lambdas + SAM** (módulos por función + `common-services`), migrado desde el Express legacy de `server/`. También es su `ADR-002`. | **MANTENER** (no hay contradicción — corrección del 2026-09-29; el "Express" del `02-to-be` no se siguió) |
| C2 — Motor de reglas | domain-design (backup): `CalculadorScore` propio del OMS | El `02-to-be` propone **un motor compartido** OMS+TMS generalizando `src/lib/tarifas/` (AST versionado). Aún **no hay** módulo de reglas en `backend/`. Reforzado por D-JC1. | **REVISAR** al reconciliar domain-design |
| C3 — Multi-compañía | `DECIDED` 2026-09-14: **una Lambda por compañía** | El código actual organiza los Lambdas **por función** (no por compañía) y filtra por `scope` país→almacén→cliente. | **REVISAR → SUPERSEDE** (definir: ¿Lambda por compañía o reglas con scope en Lambdas compartidas?) |

---

## Parte E — Plan de aplicación (para Kiro, vía §13)

1. Partir del `project.md` de **`main`** (ya trae D-JC1, D-JC2, L4).
2. **Recuperar del backup** el learning L3 (`ARTIFACT_UPDATED`).
3. Fijar las fechas de L1/L2 a la real (unificar 09-15/09-16).
4. Añadir las decisiones del pivote de reemplazo del WMH (D1–D4 de
   `2026-09-29-pivote-reemplazo-wmh.md`).
5. C1 (backend) **queda confirmado como coincidencia** (Python/Lambdas/SAM). Registrar **C2–C3**
   como decisiones pendientes (o `SUPERSEDE` cuando el equipo resuelva), nunca en silencio.
6. A nivel de artefactos: recuperar `stories.md` completo, `domain-design/` y
   `units-generation/` del backup, y reconciliarlos con `02-to-be` al re-correr los stages.

> Recordatorio de gobernanza: `project.md` se modifica **solo** por el ritual §13 de Kiro
> (evento de auditoría + dedupe + chequeo de conflictos), nunca a mano. Este documento es el
> insumo, no el reemplazo del ritual.
