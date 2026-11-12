# Módulo de Planificación — Guía para el usuario

Esta guía explica, en lenguaje de negocio, **qué hace nuestro módulo de
Planificación**: sus dos pantallas (**Pedidos en Bandeja** y **Planificación**),
de dónde saca los datos y qué deja escrito. No es documentación técnica: el
detalle de implementación está en `backend/planning/src/` y en
`aidlc/spaces/default/memory/project.md` (sección `## Decided`).

> **Para quién es:** planificadores, jefes de tráfico, analistas de operación y
> cualquiera que necesite entender cómo un pedido pasa de "disponible" a "con
> viaje asignado".

> **Importante — qué NO somos:** Planificación **no es el OMS**. El OMS es otro
> módulo que **prioriza** los pedidos (les calcula el número de prioridad). En
> desarrollo solo montamos nuestras pantallas dentro de su sidebar y sus URLs
> (`/oms/bandeja`, `/oms/planificacion`), pero el código, los datos y las reglas
> de Planificación son **nuestros**. Planificación **no prioriza**: arma viajes.

---

## 1. Qué hace el módulo, en una frase

> Planificación **lee los pedidos disponibles** que vienen del almacén (eFlow),
> los **agrupa en viajes** por cliente, día y zona, y a cada pedido le **anota su
> número de viaje** y su **fecha de salida**. No crea el pedido ni lo prioriza.

```
      eFlow (WMS)              Pedidos en Bandeja          Planificación
   (solo lectura)             (esta guía, pantalla 1)     (esta guía, pantalla 2)
┌────────────────────┐   ┌───────────────────────────┐   ┌──────────────────────┐
│ pedidos DISP/DISP  │──▶│ se guardan en Aurora       │──▶│ se agrupan en viajes │
│ (disponibles, sin  │   │ (orders) y se muestran     │   │ y se les anota el    │
│  viaje)            │   │ TODOS en la bandeja        │   │ número de viaje      │
└────────────────────┘   └───────────────────────────┘   └──────────────────────┘
```

**Qué NO hace Planificación (límites de alcance):**

- No **prioriza** los pedidos — ese número de prioridad lo pone el **OMS**.
- No **escribe en eFlow real**. eFlow es **solo lectura**. Lo que anotamos
  (el número de viaje) se escribe en un **espejo de eFlow en Aurora**
  (`sim_expedicionescabecera`), nunca en la base de producción del almacén.
- No hace picking ni ruteo físico de entrega — eso es del WMS.

---

## 2. Pantalla 1 — Pedidos en Bandeja

La **Bandeja** es la lista de trabajo: **todos** los pedidos que están
**disponibles para planificar**.

> Un pedido entra a la Bandeja cuando en eFlow está **DISP/DISP**
> (estado = disponible **y** situación = disponible), **sin fecha de cierre** y
> **sin número de viaje** todavía. Es decir: disponible y sin planificar.

### De dónde salen los datos

1. El pedido **nace en eFlow** (el WMS del almacén). eFlow es la fuente real y
   para nosotros es **solo lectura**.
2. Un proceso de **ingesta** copia los pedidos DISP/DISP de eFlow a la base
   propia de Planificación en Aurora (la tabla `orders`), y además deja una
   copia en el **espejo** `sim_expedicionescabecera`.
3. La Bandeja **lee de `orders`** (no de eFlow directo) y muestra **todos** los
   DISP/DISP, sin filtrar por fecha.

> **Clave:** la Bandeja trae **TODOS** los pedidos disponibles. No recorta por
> fecha ni por ventana. El que recorta por ventana es el Planificador
> (pantalla 2). Así el planificador ve el panorama completo y elige qué
> planificar.

### Qué se ve y qué se filtra

- Por cada pedido: cliente destino, zona de entrega, peso, volumen, monto,
  cantidad de ítems, observaciones y fechas.
- Filtros disponibles en la vista: **Sucursal** y **Zona**. (Se quitaron los
  filtros de *Estado* y *Situación*: como la Bandeja ya es, por definición, solo
  DISP/DISP, filtrar por eso no aportaba nada.)
- La Bandeja **no muestra prioridad ni score**: eso es del OMS, no nuestro.

---

## 3. Pantalla 2 — El Planificador

El **Planificador** toma los pedidos disponibles de la Bandeja y los **arma en
viajes**.

### La ventana de planificación

El planificador **no planifica todo lo que hay en la Bandeja de golpe**. Solo
trabaja los pedidos cuya **fecha de entrega** cae dentro de una ventana corta:

> **Los próximos 3 días a partir de mañana.** Si hoy es lunes, planifica
> **martes, miércoles y jueves**. Hoy no se planifica (ya va en curso), y lo
> que cae después de la ventana no se muestra hasta que el día avance.

Esto evita planificar con demasiada anticipación: cada día que pasa, la ventana
se corre y aparecen los días nuevos.

### Qué hace con cada pedido

Para cada **(cliente, día)** dentro de la ventana, el planificador:

1. **Agrupa** los pedidos en **viajes**, por dirección/zona de entrega.
2. A cada viaje le pone un **número de viaje** y le asigna sus **paradas**
   (cada parada es un pedido con su orden de visita, ciudad, zona y coordenadas).
3. Calcula la **fecha de salida** del viaje (ver abajo, "fecha de despacho").
4. **No toca** los días que ya tienen viajes despachados o cancelados.

Si un pedido se cae del plan al replanificar, el planificador **le borra** el
número de viaje y la fecha de salida (vuelve a quedar disponible).

### La regla T-1 dinámica (fecha de salida)

La **fecha de salida** (o fecha de despacho) de un viaje **no es fija**: se
calcula hacia atrás desde la entrega, según cuánto tarda llegar a la zona.

> **Salida = fecha de entrega − días de viaje de la zona.**

- Gran Área Metropolitana: sale **1 día antes** (T-1).
- La Fortuna: **2 días antes** (T-2).
- Guanacaste: **3 días antes** (T-3).

Esa fecha de salida es importante porque es la que el **OMS** usa después para
decidir **cuándo libera** el pedido al WMS (un día antes de la salida). Es decir:
Planificación calcula la fecha, el OMS la consume.

---

## 4. Qué deja escrito el Planificador

Cuando el planificador arma los viajes, escribe en dos sitios:

| Dónde | Qué escribe | Para qué |
|-------|-------------|----------|
| **`sim_expedicionescabecera`** (espejo de eFlow en Aurora) | El **número de viaje** (`NUMEROVIAJEWMH`). | Es el handoff hacia el WMS: así eFlow "ve" que el pedido ya tiene viaje. Se escribe en el **espejo**, nunca en el eFlow real. |
| **`orders`** (tabla propia) | Número de viaje, días de anticipación, **fecha de salida** y el identificador de la corrida de planificación. | Queda denormalizado en el pedido para que el OMS y las vistas lo lean rápido. |

### Dónde viven los viajes y las paradas

El plan se guarda en tres tablas, de lo general a lo específico:

```
route_plans   (cabecera del plan: organización, país, almacén, cliente, fecha)
   └── plan_trips   (cada viaje: número de viaje, vehículo, zona)
          └── plan_stops   (cada parada: pedido, orden de visita, ciudad,
                            zona, coordenadas, peso, volumen, cliente retira)
```

> **Las paradas de la planificación se guardan en la tabla `plan_stops`.**
> Cada fila es un pedido dentro de un viaje, con su orden de visita.

---

## 5. Las fechas del pedido (tabla `orders`)

Es fácil confundirlas, así que valen la aclaración:

| Fecha | Qué es | Quién la pone |
|-------|--------|---------------|
| **`order_date`** | Fecha del pedido en eFlow. | eFlow (la copiamos). |
| **`delivery_date`** | Fecha de **entrega** que pide el cliente. | eFlow (**no la modificamos**). |
| **`planned_dispatch_at`** | Fecha/hora planificada de despacho que trae eFlow. | eFlow (la copiamos). |
| **`dispatch_date`** | Fecha de **salida** del viaje = `delivery_date` − días de viaje de la zona. | **Planificación la calcula** (regla T-1). |

La que **gobierna la liberación del OMS** es `dispatch_date`: el OMS libera el
pedido al WMS un día antes de esa fecha.

---

## 6. Resumen del recorrido de un pedido

```
1. El pedido nace en eFlow como DISP/DISP (disponible, sin viaje).
2. La ingesta lo copia a Aurora (orders + espejo sim_expedicionescabecera).
3. Aparece en Pedidos en Bandeja (se ven TODOS los disponibles).
4. El Planificador toma los que caen en su ventana (próximos 3 días):
   · los agrupa en viajes por cliente/día/zona  ──► plan_trips + plan_stops
   · calcula la fecha de salida (T-1 por zona)   ──► dispatch_date
   · anota el número de viaje                     ──► sim_expedicionescabecera + orders
5. El OMS prioriza y, un día antes de la salida, libera el pedido al WMS.
6. El WMS alista. Fin del alcance de Planificación.
```

---

## Pendientes y supuestos

Lo que **todavía no está cerrado** (marcado como tal, sin inventar):

- **Horizonte de la ventana (3 días):** hoy es una constante fija; se dejó
  pensado para hacerlo **configurable por compañía** si se pide.
- **Días de viaje por zona (T-1/T-2/T-3):** dependen de un **maestro de zonas**
  (cerca/lejos → días de preparación); mientras ese maestro no esté completo, se
  usan valores por defecto.
- **"Cliente retira":** hoy se detecta por patrón de texto en las observaciones;
  la clasificación con IA es un paso futuro (y, además, esa prioridad la aplica
  el OMS, no nosotros).

---

### Fuentes

- Backend de Planificación: `backend/planning/src/` — en especial
  `app.py` (endpoint de la Bandeja), `replan.py` (la ventana), `ingest_orders.py`
  (ingesta de eFlow → `orders`) y `plan_builder.py` (arma y persiste el plan).
- Pantallas (frontend): `src/pages/oms/bandeja/` (Pedidos en Bandeja) y
  `src/pages/oms/planificacion/` (Planificador).
- Decisiones de negocio: `aidlc/spaces/default/memory/project.md` (sección
  `## Decided`), incluido **ADR-013** (desacople priorización↔liberación, que
  define cómo el OMS usa nuestra `dispatch_date`).
