# OMS — Especificación detallada y corregida

> Documento de consolidación, generado a partir de `CONTEXTO_PROYECTO_TMS.md` §2.4,
> `PLAN_MODULO_OMS.md`, `kiro-oms-requirements.md`/`kiro-oms-design.md` y la Adenda
> de `2026-08-26-reunion-oms-roles.md`. Objetivo: una sola fuente de verdad
> **corregida** para el módulo más delicado del proyecto — hoy la corrección de la
> Adenda no se ha propagado al documento de requerimientos generado con Kiro, y ese
> documento sigue describiendo un flujo que ya no aplica.
>
> Dueño del módulo: **Eduardo**. Estado en AI-DLC: intent `260826-modulo-oms`,
> fase **Inception**, stage **domain-design en curso** (ver
> `aidlc/spaces/default/intents/260826-modulo-oms/aidlc-state.md`). Este documento
> es insumo para ese trabajo en curso, no lo reemplaza — no se tocó el estado de
> ese intent al generarlo.

---

## 0. Por qué este módulo es delicado

El OMS decide, sin intervención humana rutinaria, **cuándo se manda a alistar un
pedido**. Un error aquí no es cosmético: puede saturar el muelle de despacho
(alistó demasiado pronto) o hacer perder el viaje de una ruta (alistó demasiado
tarde). Y a diferencia de casi todo el resto del TMS, su regla de gobernanza
**cambió de dirección a mitad de camino**:

- Versión original (kickoff, `CONTEXTO_PROYECTO_TMS.md` §2.4 tal como quedó
  escrito entonces): "la operación revisa la propuesta del OMS y da el visto
  bueno antes de arrancar el alistamiento" — **aprobación humana obligatoria**.
- Versión corregida (Adenda del 26 ago 2026, ver §2 abajo): **NO existe ese paso
  de aprobación** — el cálculo es 100% automático, y un paso de aprobación ahí
  **contradice directamente el objetivo de automatización** que motivó crear el
  OMS en primer lugar.

El documento de requerimientos generado con Kiro (`kiro-oms-requirements.md`)
**todavía tiene la versión vieja**, con un requerimiento completo y detallado
(Requerimiento 4, 8 criterios de aceptación en formato EARS) describiendo un flujo
de aprobación por lotes que ya no debe construirse. Si alguien construye contra
ese documento sin leer la Adenda, construye el módulo mal. Esa es la razón
concreta de por qué este documento existe.

---

## 1. Qué es y qué no es

- **Qué es:** un motor que prioriza pedidos por reglas de negocio (no FIFO) y
  decide cuándo mandarlos a alistar — ni antes de lo necesario (satura el muelle)
  ni después (pierde la ruta).
- **Dónde vive:** **satélite**, no un módulo del TMS. Se posiciona **entre el
  WMS/Torre de Control y el lago de datos** — toma el pedido+viaje que genera el
  WMS y lo inserta en el lago de datos ya con `priority_score`/`priority_tier` y
  `ready_to_prep_date` calculados. El TMS **no depende de él** para funcionar: sin
  OMS, los pedidos siguen existiendo, solo que sin priorización inteligente.
- **Fuera de alcance** (no lo hace el OMS, aunque se relacione):
  - No decide a qué ruta pertenece un pedido (viene de la relación cliente↔ruta ya
    existente) — solo usa el día de salida ya conocido de esa ruta.
  - No asigna transportista/vehículo/conductor ni calcula secuencia de paradas —
    eso es **Planificación** (Jesús).
  - No genera la guía de despacho — la genera **EPRAC**.
  - No hace inventario/disponibilidad de bodega — el pedido llega "picking-ready".
  - No calcula tarifas — eso es **Liquidación** (Dylan), aunque el patrón de
    "motor de reglas configurable" es conceptualmente el mismo que pide
    Ignacio/Mayoreo para tarifas — vale comparar componentes de rule-builder para
    no construir dos veces lo mismo.

### 1.1 Diagrama de flujo

```
WMS / Torre de Control  (genera pedido + viaje)
          │
          ▼
    ┌────────────────┐
    │       OMS        │   satélite — NO es un módulo del TMS
    │  (priorización)   │   100% automático (ver §2) + override puntual
    └────────────────┘
          │  inserta el pedido en el lago de datos ya con prioridad
          ▼
      Lago de datos / TMS
          ├── Pedidos (catálogo/listado)
          ├── Planificación (secuencia de entrega) — Jesús
          └── Tracking (ejecución en campo) → Guías de Despacho (EPRAC) → Liquidación
```

---

## 2. Gobernanza: automatización total, sin gate de aprobación (CORREGIDO)

Confirmado en la Adenda del 26-ago-2026, **supera** cualquier texto previo (kickoff,
`PLAN_MODULO_OMS.md` versión anterior, `kiro-oms-requirements.md` Requerimiento 4):

- **El cálculo de prioridad es 100% automático.** El motor de reglas decide sin
  intervención humana rutinaria. Motivo explícito del equipo: el OMS existe para
  *automatizar* lo que hoy hacen 3-4 personas de Torre de Control a mano — un gate
  de aprobación ahí reintroduce exactamente el cuello de botella que se quiere
  eliminar.
- **La única intervención humana permitida:** el rol **Responsable del OMS**
  puede alterar la prioridad de **un pedido puntual** en un caso extraordinario
  (ej. un pedido urgente que el cliente paga para romper el orden normal). No es
  una revisión rutinaria del cálculo, es una excepción.
- **"Jefe de Almacén" no aprueba ni bloquea nada.** Conserva visibilidad
  (reportería, acceso a planificación) pero no es un gate.

**Acción pendiente que se desprende de esto (todavía no ejecutada, marcarla en el
intent de OMS):** reescribir o eliminar el Requerimiento 4 completo de
`kiro-oms-requirements.md` (líneas 73-86 del documento a la fecha de este
análisis) y su reflejo en el diseño técnico (`kiro-oms-design.md`) antes de usar
esos documentos como base de `domain-design`/`contract-design`. Mientras esto no
se corrija, cualquier stage de AI-DLC que consuma esos documentos como fuente
puede heredar el requerimiento equivocado.

---

## 3. Los 4 roles (cerrados tras la reunión del 26-ago-2026)

| # | Rol | Responsabilidad | Notas |
|---|---|---|---|
| 1 | **Operador de Despacho** *(antes "Operador", renombrado por ambigüedad)* | Mantenimiento del calendario de rutas y días de despacho (submódulo 1) | No tiene nada que ver con la cola de priorización operativa — eso quedó en Responsable del OMS |
| 2 | **Administrador de Módulo** *(antes "Administrador del OMS")* | Configura las reglas del motor de priorización — superusuario **de este módulo**, no de todo el TMS | Nombrado así a propósito para que el mismo perfil sirva para otros módulos sin reconstruir permisos desde cero |
| 3 | **Jefe de Almacén** *(sin cambio de nombre)* | Visibilidad/reportería del módulo, acceso a planificación | **Sin paso de aprobación bloqueante** — ver §2. Posible traslape con Responsable del OMS, sigue **pendiente de resolver** |
| 4 | **Responsable del OMS** *(sin cambio de nombre)* | Monitorea el motor automatizado (alertas, conflictos con alistamiento/WMS, pedidos sin configuración, errores irresolubles); consolida en una sola persona lo que hoy hacen varias de Torre de Control; **interviene solo en casos extraordinarios** (override puntual de un pedido) | Es el rol más cercano al "operador humano" del sistema, pero no aprueba nada de rutina |

**Niveles de acceso propuestos** (de `kiro-oms-requirements.md`, sigue vigente):
visualización (solo lectura de Cola y Panel) · operación (override manual +
consulta de auditoría) · administración (CRUD de reglas/perfiles/calendario +
todo lo anterior).

---

## 4. Las reglas de negocio (arrancan simples, iterativas)

1. **Regla 1 — fecha de despacho + día de salida de la ruta** *(la primera a
   construir)*. Cada ruta tiene día(s) fijos de salida. La regla decide **cuándo
   mandar a alistar** un pedido: no antes de lo necesario (saturaría el muelle) ni
   después (perdería la ruta). Ejemplo real: un pedido para Caracas (sale jueves)
   que entra el lunes NO se alistra de inmediato — se alista un día antes de que
   salga la ruta. Un pedido para Valencia (sale martes) que entra ese mismo lunes
   sí se alista primero, aunque llegó después, porque su ruta sale antes.
2. **Regla 2 — prioridad por línea** *(futura, después de la Regla 1)*. Un pedido
   tiene varias líneas/ítems; puede haber líneas más prioritarias que otras
   dentro del mismo pedido.
3. **Override manual** — no es una "regla 3" formal, es el mecanismo de excepción
   del rol Responsable del OMS (§2/§3), validado en la reunión de trabajo.

**Sin resolver todavía (no asumir un número):** cuántos niveles de prioridad
maneja el motor. Hoy conviven por separado: WMS con prioridades propias, EPA y
Cofersa con 2 niveles, Mayoreo con proceso 100% manual (hasta ~8 niveles
informales). Pendiente homologar con **Antonio/"Toño"** — no construir un
esquema fijo de niveles hasta tener esa respuesta.

**Desempate entre reglas cuando compiten** (¿gana la de mayor peso? ¿se suman
puntajes? ¿gana la más restrictiva?) — **abierto**, ver `PLAN_MODULO_OMS.md` §7.1.

---

## 5. Los 6 submódulos

| # | Submódulo | Qué hace | Fase |
|---|---|---|---|
| 1 | **Mantenimiento de Rutas y Días de Despacho** | CRUD ruta ↔ día(s) de salida ↔ excepciones puntuales por cliente. Hoy es una tabla estática mantenida a mano en el lago de datos — el OMS pasa a ser su dueño. Es la base de la que depende la Regla 1: sin esto, la regla 1 no tiene de dónde leer el día de salida | **MVP — primero que todo** |
| 2 | **Panel OMS** (dashboard) | Salud del motor: pedidos pendientes por nivel, SLA en riesgo, % re-priorizado manual vs. automático, antigüedad sin atender | MVP |
| 3 | **Cola de Priorización** | Vista operativa: pedidos `pending` ordenados por `priority_score`, filtros, y el **override manual** (fijar arriba / mantener en espera / forzar prioridad con motivo obligatorio) | MVP |
| 4 | **Motor de Reglas** | CRUD del árbol de reglas (`si condición → nivel/peso`). Regla 1 primero, Regla 2 después, perfiles reutilizables por cliente más adelante | MVP (regla 1) → Fase 2 (regla 2 + perfiles) |
| 5 | **Simulador de Reglas** | "Qué pasaría si" — previsualizar cómo reordenaría la cola un cambio de regla, sin aplicarlo | Fase 2 |
| 6 | **Auditoría de Priorización** | Historial de cada cambio (automático o por override), con motivo/usuario/timestamp — insumo de Reportería y de RLS (Andrey) | Fase 2 |

Ya existe un prototipo navegable de 5 de 6 (falta el submódulo 1) en
`src/pages/oms/`, 100% con datos mock (`src/pages/oms/mockData.ts`) — sin
conexión a base de datos real todavía, intencional.

---

## 6. Esquema de datos propuesto (PostgreSQL, base transaccional nueva — no el lago)

- `route_dispatch_schedule` *(nueva, submódulo 1)* — `route_id`, día(s) de salida
  o fecha puntual de excepción, notas. Reemplaza la tabla estática del lago.
- `order_priority_rules` — condición, peso/nivel, activa/inactiva, perfil.
- `order_priority_profiles` — agrupación reutilizable de reglas (país/cliente).
- `order_priority_scores` — `order_id`, `priority_tier`, `priority_score`,
  `computed_at`, `ready_to_prep_date`, `overridden_by` (nullable),
  `override_reason` (nullable).
- `order_priority_audit_log` — `order_id`, `actor`, `change_type`
  (automático/manual), `previous_tier`, `new_tier`, `reason`, `created_at`.

*Nota: estos nombres/columnas son la propuesta de `PLAN_MODULO_OMS.md` §6.2, no
están creados todavía en `tms_olo` — cuando se validen con Eduardo, se crean vía
PR, igual que el resto del esquema (ver el patrón ya usado en esta migración:
`server/tms-schema.mjs`, `server/tms-relations.mjs`).*

---

## 7. Preguntas abiertas que siguen sin resolver

(Traídas de `PLAN_MODULO_OMS.md` §7 — no repetir trabajo que ya está hecho, pero
tampoco asumir que están cerradas.)

- Catálogo completo de criterios que puede usar una regla (perecedero, capacidad
  de CD, antigüedad del pedido, etc.) más allá de fecha+ruta.
- Criterio de desempate cuando compiten varias reglas sobre el mismo pedido.
- Cuántos niveles de prioridad hacen falta en la práctica (pendiente con Toño).
- Frecuencia de cambio de las reglas — decide si el Simulador sube a MVP.
- Por pedido individual o por lote (confirmado para Regla 1: individual contra
  el calendario de su ruta; sin confirmar para reglas futuras).
- Volumen esperado de pedidos pendientes simultáneos (afecta si Cola de
  Priorización necesita paginación/virtualización desde el día uno).
- Recalculo en tiempo real vs. corridas programadas; existencia de una hora de
  corte diaria.
- Si Devoluciones/logística inversa entra al mismo motor del OMS o tiene su
  propio proceso (Devoluciones hoy no tiene dueño ni proceso mapeado).
- Contrato exacto de salida hacia Planificación (¿campo en `orders`, o
  tabla/endpoint intermedio?).
- Si la prioridad debe ser visible para el chofer en la app de Tracking, o es
  100% interna.
- KPI de negocio para medir si el OMS "funciona" (define qué mostrar primero en
  el Panel OMS).

---

## 8. Relación con el trabajo en curso (AI-DLC)

El intent `260826-modulo-oms` está en Inception, stage `domain-design`, con
`reverse-engineering`, `requirements-analysis` y `refined-mockups` ya marcados
completos (ver `aidlc-state.md`). El propio estado del intent **ya advierte** de
la corrección de este documento (la nota que aparece en `aidlc-state.md` sobre el
Requerimiento 4 es prácticamente idéntica a la de este documento) — es decir, la
corrección **ya es conocida por quien avanzó ese stage**; este documento la deja
además como referencia consolidada y autocontenida fuera del estado interno del
workflow, para que cualquiera del equipo (no solo quien opera AI-DLC) la pueda
leer sin tener que entrar a `aidlc-state.md`.

**No se avanzó ni se tocó el estado de ese intent al generar este documento.**
