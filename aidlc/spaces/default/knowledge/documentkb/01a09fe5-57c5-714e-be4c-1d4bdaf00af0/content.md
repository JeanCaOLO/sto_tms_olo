# Reunión con Calzadilla — cruce de tablas para determinar qué pedidos priorizar

**Fecha:** `[verificar — ~2026-09-14]`
**Participantes:** **Calzadilla** (dueño de los datos / BD; explica el cruce), **Eduardo** (OMS, el usuario), **Jesús** (Planificación, referenciado). Reunión sobre **fuente de datos y réplicas** del nuevo TMS (funciones que hoy tiene Trade + torre de control).
**Fuente:** transcripción automática, resumida. Términos corregidos: **Carcam** (no carcán), **Journey Orders** (no Jorn/Jordan Horders), **PEND/PEN** (valor centinela), **EFLOW/OLO**.

> **Para qué sirve este documento:** deja **definido y autoritativo** (según Calzadilla) **cómo cruzar las tablas** del WMS/EFLOW para saber **qué pedidos entran a la cola de priorización** y cómo distinguir su estado de procesamiento.

---

## 1. Los 3 escenarios de un pedido
Calzadilla distingue **tres estados** de un pedido según en qué tablas aparece:

1. **NO procesado** — no se ha empezado a empaquetar; **NO existe** en `almacén_movimiento_carcam` **ni** en `Journey_Orders`. → **Estos son los que hay que PRIORIZAR.**
2. **En proceso (no cerrado)** — ya se empezó a empaquetar/cargar; **SÍ existe** en `carcam`, pero **sin los campos de cierre** (número de viaje = `PEND`, sin `ID confirmación`/guía). Puede tener viaje en `Journey_Orders`, pero el pedido **no está cerrado**.
3. **Cerrado / completado** — tiene **`fecha_de_cierre` con valor**, **`ID confirmación` (número de guía)** y un **`número de viaje` distinto de `PEND`**. Ya se cargó todo lo que se iba a cargar. → **NO se les hace seguimiento de prioridad.**

## 2. Campos clave en `almacén_movimiento_carcam`
- **`número de viaje`** (al inicio de la tabla): vale **`PEND`** mientras el pedido **no** está cerrado; toma un número real (viaje del WMS) al cerrarse.
- **`fecha_de_cierre`** — ✅ **ACTUALIZACIÓN (Eduardo, revisando `expediciones_cabecera`):** en la CABECERA, **`fecha_de_cierre IS NULL` identifica limpiamente los pedidos abiertos** — que son justamente los que tienen **estado y situación = `DISP`** (los que nos interesan para priorizar). Es un campo **fiable y útil** para el filtro. *(El caveat de Calzadilla sobre fecha_de_cierre poco fiable era sobre `almacén_movimiento_carcam`, no sobre la cabecera.)*
- **`ID confirmación` = `NUMEROVIAJEWMH`**: si tiene valor, el pedido **ya tiene viaje asignado** (WMH); vacío = sin viaje. (Antes lo llamé "número de guía"; el campo real en la cabecera es `NUMEROVIAJEWMH`.)
- **`ID usuario`**: el operario (por pistola de código) que cargó esa línea. Se puede unir a la **tabla de usuarios** para ver el nombre → quién está cargando qué pedido (y quién no está trabajando).
- **`fecha de inicio`**: cuándo empezó a procesarse.
- **Granularidad:** cada registro = un `número de pedido` + el `artículo` que se está cargando + `ID usuario`. Hay **varios registros por pedido**.

**Semántica del cierre:** un pedido se "cierra" cuando ya cargaron todo lo que pueden de sus artículos; ahí se genera guía + número de viaje (WMS) + fecha de cierre. En la práctica **cierran cuando el camión ya no admite más**: cierran todos los pedidos cargados en ese camión y les generan la guía. Un pedido con registros en carcam pero **sin `ID confirmación`** = empaquetado y montado en el camión, **pero el camión no ha salido** (sigue en el almacén).

## 3. EL CRUCE para la priorización (lo esencial)
> Regla de oro de Calzadilla: para **poner prioridades**, basta cruzar **`expedición_cabecera`** con **`almacén_movimiento_carcam`**.

- **`expedición_cabecera`** → **todos** los pedidos existentes.
- **Anti-join con `almacén_movimiento_carcam`** (por pedido): los pedidos de cabecera que **NO aparecen** en carcam = **NO han sido procesados** → **son los candidatos a priorizar**.
- Los que **sí** aparecen en carcam ya están (al menos) en proceso → **no** entran a la cola de priorización.
- **`Journey_Orders` NO es necesaria para la prioridad.** Solo sirve para **ver a qué viaje** está asignado un pedido (vista opcional); no distingue "en proceso" de "completado".

En una frase: **cola de priorización = `expedición_cabecera` − (los que están en `carcam`)**.

## 4. Completitud y "cuánto falta" (opcional)
- Para saber cuántos artículos faltan de un pedido en proceso: **`GROUP BY` de los artículos cargados en `carcam`** comparado con lo pedido en **`expedición_detalle`**.
- ⚠️ Caveat: a veces **no mandan todo** (piden 200, envían 100 porque es lo que hay), así que ni comparando se sabe con certeza que un pedido esté "completo".

## 5. Capacidad / cola (contexto de negocio)
- Hay un **límite de procesamiento simultáneo**: p. ej. **máximo ~80 personas → ~80 pedidos a la vez**. Aunque se asignen prioridades, los demás **esperan en cola**. Útil mostrar "se están procesando N pedidos".

## 6. Vistas adicionales (si el cliente las quiere)
- **En proceso, no cerrados**: los que están en carcam sin `ID confirmación` (con nota de capacidad/cola).
- **Asignación a viaje**: uniendo `Journey_Orders` → qué pedidos están en qué viaje.
- **Quién carga qué**: uniendo `ID usuario` con la tabla de usuarios (y quién está ocioso).
- **Artículos faltantes** por pedido (§4).
- Estas son **ventanas adicionales**; la que interesa para el OMS es la de **prioridad** (§3).

## Impacto en lo que ya teníamos
- **Criterio de filtrado (consolidado):** la cola de priorización se puede resolver directamente en **`expedición_cabecera`**: pedidos con **`fecha_de_cierre IS NULL`** y **estado/situación = `DISP`** (y sin `NUMEROVIAJEWMH` = sin viaje asignado). Equivale al anti-join con `carcam` (los no procesados). `NUMEROVIAJEWMH` con valor = viaje asignado (WMH).
- Confirma que **`Journey_Orders` es opcional** (solo para ver viaje asignado), no para decidir la prioridad.

## Pendientes
- **Réplica de EFLOW OLO:** sigue pendiente de crear (ver documentos previos); confirmar con Rafael/Alfredo las tablas: `expedición_cabecera`, `almacén_movimiento_carcam`, `expedición_detalle` (para faltantes), `Journey_Orders` (opcional) y `usuarios`.
- Confirmar si **quien carga en carcam** es el mismo que **cierra/hace la carga camión** (para la vista de "pedidos pendientes de cerrar por persona").

## Extractos verbatim clave (reconstruidos)
- **El cruce para prioridad:** *"Para poner prioridades, lo que tienes que comparar es simplemente expedición cabecera y conseguir los pedidos que NO están en almacén movimiento Carcam. A esos empiézales a hacer tratamiento de prioridad."*
- **Los 3 escenarios:** *"Si no existe en ninguna de las dos tablas [carcam / Journey Orders], el pedido no ha empezado a ser procesado… cuando empiezan a empaquetar, aparece en carcam pero con número de viaje en PEND y sin ID de confirmación… ya cuando tiene fecha de cierre, número de guía y número de viaje distinto de PEND, el pedido está listo."*
- **ID confirmación fiable (no la fecha de cierre):** *"Ves que tiene campo de cierre, pero si te bajas al ID de confirmación, ese pedido todavía no se le ha hecho la guía… el campo de cierre no es dependiente de ese caso."*
- **Journey Orders opcional:** *"Journey Orders no te limita a si está siendo procesado o si ya fue culminado… para prioridad no te afectaría; solo sirve para saber cuáles ya tienen viaje asignado."*
- **Capacidad:** *"Máximo tenemos 80 personas, máximo 80 pedidos al mismo tiempo; aunque pongas las prioridades que pongas, tienen que esperar como una cola."*

## Terminología corregida (de la transcripción)
| En la transcripción | Corregido |
|---|---|
| carcán / Carcán | **`almacén_movimiento_carcam`** |
| Jorn Orders / Jordan Horders / Journal Horders | **`Journey_Orders`** |
| pen / pend / p E n d | **`PEND`** (centinela de "no cerrado") |
| ID confirmación / ki / gui | **`NUMEROVIAJEWMH`** (viaje asignado en WMH; antes descrito como "guía") |
| iflo / oro | **EFLOW / OLO** |
| group buy | **`GROUP BY`** |
| pistola de código | lector/escáner de código de barras |
