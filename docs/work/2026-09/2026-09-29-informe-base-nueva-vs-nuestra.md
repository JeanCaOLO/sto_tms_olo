# Informe: base nueva del equipo (GitHub → `main`) vs. nuestro trabajo (`dev`/backup)

**Fecha:** 2026-09-29
**Para:** reunión de reestructuración (OMS + Planificación · reemplazo del WMH)
**Autor:** Eduardo Medina (equipo de desarrollo de aplicaciones)
**Ramas comparadas:** `origin/main` (base nueva, ya con el merge de GitHub del compañero) vs. `backup/dev-pre-wmh-2026-09-29` (snapshot de nuestro `dev`).

---

## 1. En una frase

La base nueva **conservó** nuestros requerimientos e historias del OMS y **no tocó** Planificación,
**agregó** contexto y arquitectura valiosos (y 2 decisiones oficiales nuevas), pero **NO trae**
nuestro diseño de dominio ni las units del OMS. Por eso `main` y nuestro backup **divergieron**:
ninguno es superset del otro y hay que unificarlos de forma consciente.

## 2. Qué NO se tocó (seguimos teniendo lo nuestro)

| Artefacto | Estado en `main` |
|---|---|
| **OMS — `requirements.md`** | ✅ **Idéntico** al nuestro. No lo modificaron. |
| **OMS — `stories.md`** | ✅ **Es el nuestro** (mismo story map E1–E9, US1–US33). Recortado ~80 líneas (un apéndice), sustancialmente igual. |
| **Planificación — intent `260825-route-planning-reqs`** | ✅ **Idéntico** en ambas ramas. Conservaron nuestro `requirements.md` + `technical-design.md`. No generaron requerimientos AI-DLC nuevos para Planificación. |
| **Requerimientos previos (base de negocio)** | ✅ Nuestras decisiones vivían en `project.md` y **las usaron como insumo** de su análisis de arquitectura. |

## 3. Qué sí es NUEVO (contexto y diseño que aportó la base)

| Aporte nuevo (solo en `main`) | Qué es |
|---|---|
| **`docs/reference/contexto-proyecto-tms.md`** | Contexto general del proyecto (módulos, equipo, quién hace qué, código OC26007). Se marca a sí mismo como *"parcialmente desactualizado en lógica de negocio"* y remite a los planes de módulo, `docs/decisions/` y `project.md` como verdad viva. |
| **`docs/reference/`** (resto) | `plan-modulo-oms.md`, `analisis-sistema-tms.md`, `aws-inventario-tms.md`, `estructura-costos-transporte.md`, `agentes-ia-kiro.md`. |
| **`docs/arquitectura-tms-oms/`** | Paquete completo: `01-as-is`, `02-to-be`, `03-modelo-datos-erd`, `04-matriz-migracion`, `05-roadmap` (16 fases), `06-adr/` (**9 ADRs**), `implementation/`. Anclado en el código real, no en suposiciones. |
| **`project.md` — 2 `DECIDED` nuevos** | **Mandato de Jean Carlo (2026-09-16, confirmado oficial 2026-09-21):** 5 tipos de tarifa; modelo de costo/km (fijo+variable+diésel+utilidad por vehículo); Planificación automática con prioridad a flota propia + fecha de entrega; ruteo dinámico multi-fuente. |
| **Código y despliegue** | Backend **Python + Lambdas + SAM** en `backend/` (módulos `auth`/`data`/`context`/`eflow`/`admin`/`planning` + `common-services` = API Gateway/Secrets/Layer/IAM compartidos), **migrado desde el Express legacy de `server/`**. Aurora PostgreSQL, multi-país, RBAC por rol, i18n ES/EN, bitácora de auditoría, puntos de entrega (Cofersa 1576 + EPA), **desplegado al sandbox de AWS**. |
| **Metodología `docs/`** | Marco de gobernanza propio (roles `SYS`/`DA`/`FA`/`PROD`/`QA`, `briefs→stories→requirements→decisions→work`) + guía de coordinación **Kiro ↔ Claude Code**. Paralelo al `aidlc/`. |

## 4. Qué se PERDERÍA si adoptáramos `main` tal cual (solo está en el backup)

| Artefacto | Estado en `main` |
|---|---|
| **OMS — `domain-design/`** (`components.md`, `decisions.md`, preguntas, traceability) | ❌ **No existe en `main`.** Solo en el backup. |
| **OMS — `units-generation/`** | ❌ **No existe en `main`.** Solo en el backup. |
| **OMS — sección recortada de `stories.md`** | ⚠️ ~80 líneas menos en `main`. |
| **1 learning de `project.md`** (hook `ARTIFACT_UPDATED`) | ⚠️ Reemplazado en `main`; se conserva en el backup. |

> **Por eso el backup fue clave.** Nuestro diseño de dominio y las units del OMS no viajan
> con la base nueva.

## 5. El punto de fondo: `project.md` divergió (ninguna rama es superset)

- **`main` tiene y el backup no:** los 2 `DECIDED` del mandato de Jean Carlo, `docs/reference/`,
  `docs/arquitectura-tms-oms/`, el código nuevo y el despliegue.
- **El backup tiene y `main` no:** nuestro **domain-design + units-generation** completos,
  el `stories.md` completo y 1 learning.

**Implicación:** no se elige una rama y se descarta la otra — se pierde trabajo en cualquier
sentido. Se requiere un **merge consciente** (ver el *documento de reconciliación*:
`2026-09-29-reconciliacion-project-md.md`).

## 6. Puntos a resolver en la reunión

> **Backend — YA ALINEADO (verificado contra el código, no es contradicción):** la base nueva
> **migró el backend a Python + Lambdas + SAM** (`backend/`, módulos por función +
> `common-services`), desplegado al sandbox AWS. Coincide con nuestro `DECIDED` (2026-09-03/04)
> y con su `ADR-002`. El Express de `server/` quedó como **legacy** (solo referencia del
> contrato HTTP). *Corrección 2026-09-29: una versión previa de este informe decía "Express";
> se tomó del `02-to-be.md`, que proponía monolito sobre Express — pero eso NO se siguió, se
> migró a Python/SAM.*

Quedan **2 puntos de diseño** a reconciliar (cruzan lo nuestro con el mandato de Jean Carlo):

1. **Motor de reglas:** el `02-to-be` propone **un solo motor compartido** OMS+TMS generalizando
   `src/lib/tarifas/` (frontend); nuestro domain-design planteaba un `CalculadorScore` propio del
   OMS. Aún no hay módulo de reglas en `backend/`, así que es una decisión abierta. (El mandato de
   Jean Carlo refuerza el motor de tarifas/costo compartido.)
2. **Multi-compañía:** nuestro `DECIDED` (2026-09-14) decía **una Lambda por compañía**; el código
   actual organiza los Lambdas **por función** (no por compañía) y filtra por `scope`
   país→almacén→cliente. Definir si el motor del OMS será una Lambda por compañía o **reglas con
   scope** en Lambdas compartidas.

## 7. Aparte — seguridad (urgente, independiente del rediseño)

Su propio análisis reporta que **`.env` con credenciales reales de AWS está en el historial
de git**. Acción: **rotar esas credenciales y sacarlas del historial** antes de producción.

## 8. Recomendación de decisión para la reunión

1. **Unificar `project.md`** con un merge consciente (documento de reconciliación adjunto).
2. **Recuperar del backup** el domain-design y units del OMS, y reconciliarlos con el `02-to-be`.
3. **Zanjar los 2 puntos de diseño** del §6 (motor de reglas; una Lambda por compañía vs reglas con scope). El backend ya está alineado (Python/Lambdas/SAM).
4. **Definir la gobernanza única:** ¿convergemos al marco `docs/` + Kiro, o reingresamos a AI-DLC?
5. **Rotar credenciales** del `.env` (§7).

---

_Fuente de los datos: comparación git `origin/main` vs `backup/dev-pre-wmh-2026-09-29` (2026-09-29).
El detalle entrada-por-entrada de `project.md` está en `2026-09-29-reconciliacion-project-md.md`._
