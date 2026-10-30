# Prioridad de Cofersa: esquema "días hasta la salida" + estrategia por compañía

**Fecha:** 2026-10-29
**Rama:** `oms`
**Fuente:** reuniones de prioridad Cofersa (planteamiento 2026-10-27, confirmación
2026-10-28/29, transcripciones compartidas por Eduardo).

## Contexto

En el acta, el gerente general planteó que la prioridad de **Cofersa** pasa de "2
prioridades" a una escala tipo `0, 1, 2 … n`, con **0 como máxima**. Tras dos
reuniones de aclaración quedó definido el modelo concreto (abajo). EPA no cambia.

## Modelo CONFIRMADO (Cofersa)

- **El número de prioridad = cuántos días faltan para la salida/alistado del pedido.**
  Horizonte de ~3 días: lo que sale mañana = prioridad **1**, pasado = **2**, etc.
- **El 0 NUNCA aparece en la cola de priorización.** `0` = el pedido **ya liberado /
  en proceso** (situación generada); es lo que se envía al WMS al liberar. Mientras el
  pedido está en la cola, su número es **≥ 1**.
- **El número rueda a diario:** se recalcula en cada barrido, así que baja solo conforme
  se acerca la fecha (lo que hoy es 2, mañana es 1; al liberarse, 0).
- **Escala chica**, no `0..100`. Los números grandes del WMS (p. ej. "700") son cómo el
  WMS pinta todo el universo (incluidos los pedidos parqueados a semanas, que viven en la
  **Bandeja**, > 3 días, y que el OMS todavía no numera). No es nuestra escala.
- **EPA sin cambio:** `priorizar=false`, trae su prioridad de EFLOW/EPRAC; el OMS no la
  recalcula, solo libera por fecha. **Valores = 1 y 2** (un pedido sale con 1 o con 2; nunca
  cambian). Confirmado por Eduardo (2026-10-30, OQ-EPA-VAL CERRADA) y por la fuente 2026-09-01
  ("EPA y Cofersa manejan 2 prioridades (1 y 2)"). **EPA nunca usa 0.**
- **OJO — error en ADR-009 a corregir:** ADR-009 afirma "EPRAC parte en guion-0 (falla ⇒
  prioridad 0) y guion-1 (regular ⇒ prioridad 1)". Eso es **incorrecto**: el concepto
  "guion-0/guion-1" no aparece en ninguna transcripción indexada y contradice los valores
  reales (1 y 2). Corregir ADR-009 y cualquier FR/historia/traceability que haya quedado
  afirmando EPA = 0/1 → EPA = **1 y 2**.
- **Nota aparte (sí válida):** "0 = liberado" es convención de la estrategia `dias_hasta_salida`
  de Cofersa (piso de cola = 1), **NO un invariante global** de `orders.priority`. Como EPA usa
  1/2 (nunca 0), no hay roce entre el "0 = liberado" de Cofersa y los valores de EPA.

## Pendientes (NO resueltos; no bloquean la primera salida)

- **A — cómo pesan las OTRAS reglas dentro del día (APARCADA por decisión de negocio).**
  Para la **primera salida solo se maneja la regla de tiempo + cliente-retira**, así que
  no hace falta definir todavía cómo observaciones u otras reglas futuras reordenan dentro
  de un mismo día. Cuando entre, se evoluciona la estrategia `dias_hasta_salida` (aislada).
- **B — las demás compañías de mayoreo.** Antonio presume que numeran igual que Cofersa,
  pero falta confirmarlo con el almacén (Dylan / José). **Resuelto por diseño** con la
  estrategia por scope (abajo): agregar una compañía no obliga a cambiar lógica.
- **C — ancla fina del día.** Se asumió que "salida" = la **fecha de alistado objetivo**
  (entrega − `lead_time_days`) que ya usa `regla_fecha`. El off-by-one exacto respecto a la
  ventana de liberación (ADR-013, `dispatch_date − dias_prep_picking`) queda por afinar.

## Diseño aplicado: estrategia de prioridad por scope

El **número** de prioridad se calculaba en un único punto fijo (`score.score_a_prioridad`).
Se convirtió en una **costura elegible por config**: cada compañía trae en su fila de
`oms_rule_configs` el nombre de su estrategia.

- **Nivel 1 (solo datos):** una compañía que numere igual que otra → una fila de config,
  **cero código**. Para ello, `dias_hasta_salida` está **parametrizada**: lee `ancla_fecha`
  ('alistado' = entrega − lead_time, default; o 'entrega' cruda) y `prioridad_piso`
  (mínimo de la cola; 0 se reserva para el liberado, default 1). Otra compañía de mayoreo
  que numere igual con otros números/ancla/piso es solo config.
- **Nivel 2 (código aislado):** una que numere con una **fórmula distinta** → se registra
  **una** función en `estrategias_prioridad.py` y su fila la apunta. El barrido, la
  escritura al WMS, el panel y el resolver de scope **no cambian**.

Para evitar el "olor a hardcoded", los **nombres** de estrategia y de ancla viven en
`models.py` como constantes (fuente única); el registro, la config y los defaults los
importan de ahí. El `CHECK` de la migración es el único espejo inevitable del lado SQL.

Mantiene el DECIDED "el Motor de Reglas NO es un constructor dinámico": la lógica vive en
código; la config solo elige cuál y con qué parámetros.

### Cambios

**Backend (`backend/oms/src/`):**
- `estrategias_prioridad.py` (NUEVO): registro `{nombre: función pura}` con
  `escala_lineal` (default, = comportamiento previo) y `dias_hasta_salida` (Cofersa,
  parametrizada por `ancla_fecha`/`prioridad_piso`). `ContextoPrioridad` agrupa las
  entradas; `resolver(nombre)` cae a la default si el nombre es desconocido/None.
- `regla_fecha.py`: `fecha_entrega(pedido)` y `fecha_alistado_objetivo(pedido)` como
  **fuente única** de la aritmética de fecha; `evaluar` y la estrategia las comparten.
  Comportamiento de `evaluar` intacto.
- `models.py`: constantes de nombres/anclas (fuente única: `ESTRATEGIA_*`, `ANCLA_*`,
  `PRIORIDAD_PISO_DEFECTO`) + campos `estrategia`, `ancla_fecha`, `prioridad_piso` en
  `ConfiguracionReglas` (defaults retrocompatibles).
- `motor_reglas.py`: `_priorizar_uno` arma el `ContextoPrioridad` y llama a la estrategia
  resuelta por `config.estrategia` en vez del cálculo fijo.
- `reglas_config.py`: lee `estrategia`, `ancla_fecha` y `prioridad_piso` de la fila
  (distingue `prioridad_piso=0` de ausente; no lo coacciona a 1).

**SQL:**
- `sql/55_oms_rule_configs_estrategia_prioridad.sql`: columnas `estrategia` (default
  `escala_lineal`), `ancla_fecha` (default `alistado`) y `prioridad_piso` (default 1),
  todas retrocompatibles, con sus `check`; apunta la fila CUSTOMER de **Cofersa** a
  `dias_hasta_salida` (idempotente, por código de compañía). Con ROLLBACK.

**Tests (`backend/tests/test_oms.py`):** numeración por días (1/2/3), clamp al piso
(nunca 0 en la cola por default), cliente-retira = piso, centinela → urgente,
`escala_lineal` preserva el score, fallback del registro, end-to-end por config, helpers
de fecha, ancla 'entrega' vs 'alistado', piso configurable (permite 0) e integración
BD→config→motor (`pg.query` espiado). **59 pasan** (suite OMS completa).

### Qué queda igual

- `escala_prioridad` NO se borra: la usa `escala_lineal` (GLOBAL y quien no fije otra).
- La pasada de liberación (ADR-013) no se tocó. El "0 = liberado" end-to-end (que la
  liberación **escriba** prioridad 0 al WMS) queda como **follow-up**: hoy la estrategia
  solo garantiza que la cola nunca muestre 0.

## Nota de memoria (ritual de learnings, NO editar a mano)

Esto **supera** el DECIDED del 2026-09-02 ("EPA y Cofersa usan 2 prioridades"; piso en 1)
para el caso Cofersa (ahora `0..n`, piso de cola 1, 0 = liberado). Registrarlo por el
ritual de learnings de AI-DLC cuando se cierre; **no** se editó `project.md` a mano.

## Estado

- Código + migración + tests **aplicados en la rama `oms`**. Sin commit, sin push, sin
  deploy (commits del usuario; deploy de Intelix).
- Aplicar `sql/55` cuando se despliegue el backend del OMS.
