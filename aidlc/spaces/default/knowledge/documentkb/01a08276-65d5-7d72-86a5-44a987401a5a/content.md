# Reunión funcional OMS con Antonio — reglas de priorización, fechas, observaciones, viaje e inventario

**Fecha:** 2026-09-08
**Participantes:** **Antonio** (funcional / experto del WMS y torre de control; a quien se le cortaba con frecuencia el micrófono), **Eduardo** (OMS, el usuario), **Ana María** (lidera y toma notas).
**Fuente:** transcripción automática, resumida y estructurada. Reunión **funcional bastante completa** sobre el OMS. Por los cortes de audio de Antonio, **algunas partes se infirieron**; lo inferido y los nombres de campo/código se marcan `[verificar]`.

> **Objetivo de la sesión:** recorrer el flujo actual del WMH y **definir qué reglas automatizar primero** para una **entrega parcial**, con el criterio de "lo más manual / lo que más trabajo genera / lo más complejo". Se avanza por etapas: se automatiza un grupo de reglas, se entrega, y se sigue con otro grupo.

> **Terminología:** **EPRAC** (no IPRAC/IPRA), **EFLOW** (no iflow) = WMS de almacén, **WMH** = torre de control (a reemplazar), **TMS** = módulo de transporte/planificación (viajes, rutas, guía), **OMS** = este módulo (priorización). **AFV** (no "AFB") y **ERP** = de dónde viaja la ruta del pedido.

---

## 1. Las 5 macro-reglas identificadas
En la sesión se identificaron **cinco macro-reglas** (sin fijar aún el orden de desarrollo): **(1) cálculo de fecha, (2) análisis de observaciones, (3) cliente retira, (4) asignación de viaje/bajada, (5) inventario/capacidad.** Detalle de cada una abajo.

### Regla 1 — Cálculo de fecha (T-1)
- Regla base: **fecha de listo = fecha de entrega − 1 día** (T-1). Si la ruta dura varios días (ej. Venezuela → Bolívar ~2 días), se resta lo que dure la ruta. En Costa Rica casi siempre es 1 día.
- **PROBLEMA CONFIRMADO EN VIVO:** la **fecha de entrega NO está llegando de Cofersa en productivo**. Hoy llegan pedidos con fecha de creación = hoy y "fecha planificada" = hoy también → el campo se llena **por default con la fecha de creación**. **EPA sí la manda bien** (pero EPA no entra en este flujo de priorización).
- **Fechas que maneja el WMS/EFLOW (6 campos):**
  - **Fecha de creación** — cuando el WMS/EFLOW recibió (interfazó) el pedido; puede ser posterior al pedido del vendedor (p. ej. Cofersa libera sus checks de crédito/cobro el día 9 → se crea el 9). **No cambia.**
  - **Fecha de generación** ("fecha más próxima") — la última vez que se generó la expedición; **cambia** cada vez que se regenera (queda log de histórico en EPRAC). *Ej.: genero hoy 8 líneas de 10, quedan 2 pendientes por inventario; mañana la regenero → la fecha pasa a mañana.*
  - **Fecha de cierre** — cuando se cerró (automático: sin inventario / forzado / 100% completado; o manual). **No cambia.**
  - **`fecha`**, **`fecha de expedición planificada`**, **`fecha de despacho planificada`** — los tres campos "planificados".
- **La que importa:** el cliente **debe enviar la fecha de ENTREGA en `fecha de expedición planificada`**. Esa es la que el OMS usa para **calcular** la prioridad y la fecha de listo. Es la fecha en que el cliente espera la mercadería (**el OMS NO la modifica** — es un compromiso con el cliente).
- **Horas de corte:** un pedido de una ruta que sale todos los días, si entra **antes del corte** (CR: 3 p.m. GAM/rural, 5 p.m. GAM), se lista para el día siguiente; si entra **después del corte**, rueda al **siguiente evento** de esa ruta (mañana, o 2-3 días después según la ruta). El motor de pedidos de Cofersa ya asigna la fecha según la hora del agente. **Hoy no existe** esa regla de cortes en el sistema; hay que crearla (`fechas y cortes del día`). Eliminar el corte manual (filtrar por milisegundos) es de lo primero a resolver.
- **Fallback:** si Cofersa **no** provee la fecha de entrega → aplicar la **Regla 2 (reglas de ruta):** "la ruta 1 se entrega tal día, la ruta 2 tal día…" (reglas de negocio por ruta). La **duración de la ruta** la define el equipo de transporte (Ricardo en CR; equipo de Venezuela).
- **`fecha de planificación de despacho`** (= entrega − 1): hoy **no viaja**; el **OMS/TMS debería ser el dueño** de esa fecha, no el WMS. Ponerla en el campo del WMS es opcional y sencillo, pero la info la debe manejar el TMS.

### Regla 2 — Análisis de observaciones
- El pedido trae comentarios del **vendedor** en el campo **`observaciones`** (en `expedición_cabecera` de EFLOW). **No hay estándar de formato.**
- Puede contener: **dirección/lugar de entrega** ("enviar a la oficina", "lagar Desamparados/Coronado/Alajuela", sucursal), **fecha solicitada** ("entregar mañana"), **urgencia/prioridad** ("enviar urgente"), **quién recibe**, **cita** (Walmart, El Rey, Coyol → fecha y hora de cita), **encomienda**, **cliente retira**, "no va por esta ruta, va por esta otra", etc.
- **Dolor:** llegan **~450-500 pedidos/día**; nadie puede leer/interpretar todos los comentarios manualmente. Si un operador nuevo/suplente no lee el comentario, el pedido se **misrutea o se atrasa** (ejemplo real: pedido de ruta 16 Corralillo con "entregar mañana" que llegó tarde por crédito/cobro → se atrasó 2 días).
- **Problema de direccionamiento EPA vs. Cofersa:**
  - **EPA:** el pedido llega como compañía EPA (códigos 01-06) **direccionado a un cliente/tienda** (002 = Curridabat, 003 = Escazú…) → **identificable**.
  - **Cofersa:** el pedido llega como compañía Cofersa (0109) con cliente cuya **dirección fiscal es única** (p. ej. una ferretería con razón social en San José pero sucursales en 7 provincias) → **todos los pedidos salen a San José**; no se puede identificar el destino real desde la dirección. La ruta viaja del **ERP/AFV**.
- Regla **compleja** (interpretar texto libre). Antonio: requiere que Mayoreo **estandarice** sus observaciones. **Se anota, pero NO necesariamente se automatiza primero.** El **cliente retira** es un **subconjunto** de esta regla.

### Regla 3 — Cliente retira (subconjunto de observaciones)
- El comentario suele decir **"retira"** (estándar acordado, pero no forzado — puede decir "24 horas" u otra cosa).
- **Hoy:** se abre **un viaje por semana** (o cada 48 h) que agrupa todos los pedidos "cliente retira" (para no llenar de viajes individuales; hay ~5-8/día). Lo abre **torre de control**; lo cierra **despacho**. El número de viaje es **"pura memoria"** (recuerdan que el viaje 8822 es cliente retira; nada lo etiqueta). Máximo **48 h**: si el cliente no llega, la mercadería **vuelve al inventario** (como una **devolución/ajuste**, porque el pedido ya se cerró y facturó).
- **Problema:** Cofersa **no manda identificador** de cliente retira (mismo problema de direccionamiento) → hoy solo se detecta por la **observación**.
- **Ideal:** el vendedor de Cofersa selecciona "cliente retira" → dirección predeterminada de OLO → **ruta 0** (o la ruta que se defina) → se planifica todo para la ruta 0, sin depender de observaciones.
- **Acción de la regla:** identificar el cliente retira por observación → **asignarle la prioridad más alta** y un **cliente/viaje "dummy"** (genérico) para segregarlo. Limitación: hoy el pedido trae su ruta real en la cabecera (no modificable); el "artificio" de agruparlo en un viaje lo hace hoy la torre de control. **Se debe acordar con el TMS** que genere un **viaje exclusivo de cliente retira** por día, y una **nomenclatura** que lo identifique (¿el código de viaje puede llevar una "R" en vez de ser numérico? → consultar con **Andrey** a nivel técnico, también por el tema de la banda).

### Regla 4 — Asignación de viaje / bajada (⚠️ define el ALCANCE)
- **Todo pedido debe tener un VIAJE asignado** para que la torre de control lo procese. **Un viaje = un camión** (una unidad de transporte). Un viaje **puede contener varias rutas** (una ferretería con fiscal en Heredia [ruta 5] y sucursal en San José [ruta 3] → ambas en el mismo viaje 123). "El viaje es lo primero que hay que crear; el viaje es el que manda: define hacia dónde, cuándo, el orden y los stops."
- **Hoy:** la torre de control crea los viajes **manualmente** (crear viaje con el primer pedido → añadir los siguientes). Numeración **secuencial**, sin código fijo ruta↔viaje. ~**16-17 viajes/día** (uno por ruta + cliente retira). Tras el corte, un pedido nuevo crea el **viaje 18** con **menor prioridad** (se va otro día).
- **🔑 DECISIÓN DE ALCANCE:** **la creación del viaje NO es del OMS; es del TMS/Planificación** (el TMS administra viaje, ruta, orden y guía de despacho). **El OMS termina en "alistado"** (deja el pedido listo para picking). El OMS **consume** el viaje ya asignado por el TMS y se encarga de la **priorización, inventario y capacidad**.
- Del viaje, el OMS **solo necesita** la **fecha planificada de despacho** y que el pedido corresponda a ese viaje/ruta.
- **Bajadas / muelles de despacho:** la "**bajada**" = carril de la **banda transportadora**; "**muelle de despacho**" = puerta. En **Venezuela no hay banda**, solo muelle. Se asocian a un **viaje**. Regla: **todo lo del mismo viaje va a la misma bajada/puerta**; que la caja pase o no por la banda es independiente (la banda lee la caja, identifica el viaje y la desvía). Se puede asignar por **capacidad** o **fijo** (ruta X → bajada Y). El OMS asigna la bajada; el TMS solo abre el viaje (viaje + ruta), sin saber de bajadas ni prioridades.

### Regla 5 — Inventario / capacidad ("carta al niño Jesús" → futuro)
- Ideal: el OMS **valida viabilidad de inventario antes de liberar**; maneja **reservas, pendientes, reenvío automático de líneas y prioriza reposiciones** — todo el control del centro de distribución.
- **NO es prioridad por línea** (sigue siendo por cabecera), sino **por capacidad e inventario** (blanco/negro: se libera o no; se prioriza la reposición).
- **Problema de reposición:** EPRAC solo conoce mín/máx, no la **demanda pendiente real**. Ej.: 70 pendientes pero el sistema solo repone hasta el máx (50) → genera **3 reposiciones el mismo día**. El OMS debería ver los 70 pendientes y **liberar de una la reposición extra**.
- **Callbacks al ERP:** el OMS debería generar comunicaciones a EPRAC: si piden 1000 y hay 900 → callback por 100; si no hay cómo suplir → **no inyectar al WMS**. Así el WMS solo ve pedidos **reales/atendibles** (no infla el conteo de pendientes con lo que no tiene inventario).
- **Complejo → etapa futura.**

---

## 2. Modelo de prioridad
- **Prioridad NUMÉRICA e INVERTIDA (EPRAC):** **menor número = mayor prioridad** (0 = máxima urgencia; se atiende primero). El cliente maneja números consecutivos 1..N. **Cuando desaparezca el WMH, el cliente debe entregar una TABLA DE PRIORIDADES** (insumo pendiente).
- **Postura de Antonio:** la prioridad va **ligada 100% a cuándo se debe despachar** (la fecha). **Idealmente solo 2 prioridades por día:** lo que se lista hoy para mañana + cliente retira. Manejar más prioridades es lo que causa el **picking improductivo** (dos pedidos de la misma ruta, mismo día, con prioridades 2 y 20 → se pasa dos veces por el mismo artículo). Si hay **capacidad ociosa**, se pueden adelantar pedidos de días siguientes (prioridad 2, 3…).
- **Debate score vs. filtro:** el mockup calcula la prioridad como un **score ponderado** (cada regla suma peso). Antonio dice que la prioridad debería ser **solo la fecha**. Consenso tentativo: **mantener el score**, pero el **mayor peso = cliente retira**, luego la **fecha**. Sigue abierta la pregunta: ¿las reglas deben cumplirse **todas** (sería un **filtro**, no un motor) o **cada una suma peso**? → confirmar con el cliente.
- **Umbral de inyección:** el cliente debe definir **a partir de qué prioridad** el OMS inyecta (p. ej. preparar solo prioridad 0,1,2,3; números mayores esperan).
- **Override manual:** el motor calcula automático, pero un **rol autorizado** puede **cambiar la prioridad** (camión accidentado, EPA urgente, impulsar un camión con poca carga). Confirmado.

## 3. Flujo de estados (qué cambia el OMS y qué NO)
- El pedido llega **estado=disponible / situación=disponible** (`DIS`/`DIS`) al WMS.
- El OMS aplica las reglas y cambia a **estado=disponible / situación=GENERADA** → eso pone las líneas del pedido en el flujo de alisto (disponibles para preparar). Cuando alguien las toma en el **handheld** → **preparando/preparado**.
- **El OMS SOLO cambia `estatus` (disponible) + `situación` (generada). NO cambia ninguna fecha:** la `fecha de expedición planificada` (fecha del cliente) **queda igual**; la `fecha de generación` de EPRAC cambia sola al generar. Esto permite que el cliente (Cofersa) siga **facturando** con su fecha.
- **Alcance de estatus:** en el flujo actual (sin cambios de EPRAC/EFLOW), todos los pedidos quedan en `DIS`/`DIS`; lo que el OMS puede hacer es **activar** (cambiar situación a generada) o no — que es lo que hoy hace la torre de control manualmente.

## 4. Facturación / guía / despacho (reglas del TMS, por compañía)
- **Un pedido no se puede despachar sin estar facturado.** Se factura al llegar a cierto estatus (**estado check / situación preparado** `[verificar]`).
- Cadena: el **WMS despacha** (saca de inventario, pone estatus **despachado**) → el **TMS genera la guía** (necesita el estatus de despachado; no genera guía si no se despachó; no se despacha si no está facturado).
- **Viaje ↔ guía de despacho = 1:1** (un viaje genera una guía). Un **pedido puede ir en dos viajes** (ej. 20 inodoros, 10+10 en dos camiones → dos guías, misma factura y fecha). El **alisto de ese caso: se manda a listar todo** (se tiene que ir el mismo día, sin discriminar por ruta/viaje/tamaño).
- **Estas reglas son POR COMPAÑÍA:** Cofersa/mayoreo → sí factura; **EPA y terceros → no facturan** (es un traspaso; solo cumplir estatus 100% o forzar el cierre).

## 5. Dos reglas elegidas para la PRIMERA entrega
Se decidió **arrancar con dos**:
1. **Generación automática por FECHA:** el OMS tiene todos los pedidos; lee la fecha; si cumple la regla → **inyecta** (cambia a `disponible`/`situación generada`); si no cumple → no inyecta (no cambia la situación) hasta que corresponda. **No cambia fechas.** La situación queda **generada con la prioridad del día** (solo se generan los que deben prepararse hoy/mañana).
2. **Cliente retira / análisis de observaciones (primer subconjunto):** identificar por patrón el "cliente retira" en observaciones → asignarle la **prioridad más alta** y el viaje/cliente dummy. Se amplía un poco el scope a "análisis de observaciones", con cliente retira como primera parte (porque sí o sí lleva prioridad distinta; el resto solo se apega a la regla del viaje/fecha).

## 6. Dashboards / indicadores (a nivel de VIAJE)
- Antonio quiere ver la operación **por viaje**, no por detalle de pedido: "este viaje tiene N paradas, está listo al 90%, despachado al 80%, va atrasado / dentro de capacidad, va lleno al 80% (con volumetría)". Similar a la torre de control pero **menos rígido**. Los indicadores/dashboards finales se definen con los tomadores de decisión.
- **La unidad de trabajo es el VIAJE:** 16 viajes ≈ 400 pedidos; se pica **una vez por artículo** para todo el viaje (oleada), no 18 veces. La banda transportadora ya hace la **distribución** de lo picado en una sola pasada.

## 7. Frecuencia del motor de reglas
- Debe correr **mínimo una vez al día** (primera hora de la mañana) para **revisitar/actualizar prioridades**, y en las **horas de corte**. Las prioridades casi no varían; lo que varía es por **capacidad** (lo que no se alcanzó hoy sube a prioridad 1 mañana). Hay que **revisitar diariamente** aunque el pedido ya no esté en `DIS`/`DIS`. Se puede regenerar en cualquier estatus salvo cuando el pedido ya está al 100%.

## 8. Implicaciones para la FUENTE DE DATOS
- La idea "leer del WMS" se complica: **el viaje se asigna en el TMS**, así que el OMS toma los datos **cuando el pedido ya tiene viaje asignado** (desde el TMS). Antonio describe el flujo ideal: **pedido → TMS (asigna viaje) → OMS (prioridad/inventario/capacidad) → WMS (inyecta completo/parcial/no inyecta)**; el WMS nunca debería ver un pedido que no pasó por TMS+OMS.
- **Decisión de alcance pendiente (la grande):** ¿el proyecto **automatiza el flujo actual** (el OMS hace los "clicks" que hoy hace el humano, leyendo `DIS`/`DIS` del WMS) **o rediseña el flujo completo** (pedido → TMS → OMS → WMS)? — *"El proyecto quiere automatizar lo que está hoy o quiere hacer un rediseño."*

## 9. Regla futura (agrupación)
- Agrupar **pedidos con el mismo artículo y misma ruta de entrega** para picar una sola vez (oleada). Pero eso ya lo resuelve el **WMS** (arma su orden lógico y la banda distribuye); el OMS ve el "macro pedido". **Evaluar a futuro.**

## Preguntas abiertas / pendientes
1. **Fecha de entrega de Cofersa:** asegurar que Cofersa **envíe la fecha de entrega** en `fecha de expedición planificada` (hoy la llena por default con la creación). Sin eso, la Regla 1 usa el fallback por ruta.
2. **Score o filtro** + **tabla de prioridades** (números 1..N) + **umbral de inyección** → cliente/Antonio.
3. **Nomenclatura del viaje de cliente retira** (¿código con "R"? ¿afecta la banda?) → **Andrey** (técnico).
4. **Cómo intervendrá el TMS** para generar el viaje de cliente retira y marcar la ruta 0 → definir con el equipo del TMS.
5. **Duración de rutas y horas de corte** → equipo de transporte (Ricardo CR / Venezuela); crear la regla de cortes en el sistema.
6. **Alcance:** ¿automatizar el flujo actual o rediseñarlo (pedido→TMS→OMS→WMS)? → decisión de proyecto.
7. **Indicadores/dashboards** que querrán ver (a nivel de viaje) → tomadores de decisión.
8. **Reglas de facturación/despacho por compañía** → anotarlas para el TMS.

## Extractos verbatim clave (reconstruidos)
- **Fecha que importa:** *"La que le vamos a calcular es la fecha de expedición planificada… lo que vamos a recibir de Cofersa es la fecha de entrega. Si la fecha dice que se entrega mañana 9, lo tengo que listar hoy 8."*
- **Cofersa no manda la fecha:** *"Definitivamente no está llegando; hoy me llegan pedidos con fecha de creación de hoy y fecha planificada de hoy mismo… se llena por default con la misma fecha del pedido."*
- **Observaciones sin estándar:** *"A mí me llegan 450, 500 pedidos diarios; nadie puede leer o analizar 500 pedidos nada más adivinando qué quiso decir el vendedor en los comentarios."*
- **El viaje manda / alcance:** *"El viaje es lo primero que hay que crear… pero el que crea el viaje es el TMS. El scope del OMS es dejarlo hasta alistado."*
- **Prioridad = fecha:** *"La prioridad va ligada 100% a cuándo se tiene que despachar. Idealmente solo debería manejar dos prioridades en el día: lo que se va mañana y cliente retira."*
- **Flujo ideal:** *"Yo no debería tener nada en mi WMS que no haya pasado antes por TMS y por OMS… el OMS analiza prioridades, inventario y capacidad, y ahí se inyecta al WMS completo, parcial o ni siquiera se inyecta."*
- **Solo cambia estatus/situación:** *"Nosotros solo pondríamos el estatus disponible y la situación generada; la fecha planificada de expedición queda igual porque es la que el cliente está esperando."*

## Terminología corregida (de la transcripción)
| En la transcripción | Corregido |
|---|---|
| Iprack / IPRA | **EPRAC** (prioridad invertida: menor número = mayor prioridad) |
| iflo / islo / iflu / iflow | **EFLOW** (WMS de almacén) |
| WMH | **torre de control** (a reemplazar) |
| du MS / doble MS / UMS | **WMS** |
| AFB | **AFV** |
| Hangheld / ángel | **handheld** (dispositivo de picking) |
| bajada | carril de la **banda transportadora** |
| DIS / generada / preparado | disponible / situación generada / preparado `[verificar códigos]` |
| carta al niño Jesús | modismo = lista de deseos (lo ideal, a futuro) |
| Jones / Jurgen | equipo de transporte de Venezuela `[verificar]` |
