# Reuniones sobre el ORIGEN DE DATOS de los pedidos para el OMS (con Rafael Padrón)

**Fecha:** `[verificar — dos sesiones, ~2026-09-07]`
**Participantes:**
- **Eduardo** — Intelix, módulo OMS (el usuario).
- **Rafael Padrón ("Rafa")** — conoce dónde están las bases de datos, servidores y tablas; hizo el **TMS de Costa Rica** existente (referencia técnica principal). Comparte pantalla de las BD.
- **José** — Intelix; pide contexto del proyecto al inicio.
- Referenciados: **Jean** ("Jan"/"JN", desarrollador del cliente que propuso la plataforma), **Alfredo** (se reuniría con Jean para el proceso de extracción de data), **Windry** (cliente/EPRAC; iba a habilitar coordenadas), **Ana María** (pasó un Excel con el calendario de rutas), **Jesús** (Planificación — su parte queda **fuera de alcance** de este documento).

**Fuente:** transcripción automática de dos sesiones, resumida y estructurada. **Solo se recoge lo relativo al OMS**; lo de Planificación (transportistas, camiones, conductores para ruteo) se omite por estar fuera de alcance de este proyecto.

> ⚠️ **ADVERTENCIA CENTRAL: NO hay claridad del origen de datos.** Todo lo de abajo es **exploración/hipótesis**. **No existe aún una réplica** de las tablas que el OMS necesita para Costa Rica (producción). Queda por **definir qué tablas y de qué BD** se replican, **solicitar la réplica** y **confirmar campos con el cliente**. Nada de esto está cerrado.

> **Nota de terminología (transcripción corregida):** **EPRAC** (no IPRAC/IPRA), **Softland** (no Soslan/Sollan/Soflan — el ERP de facturación de los clientes), **Jean** (no Jan/JN), **WMS** = sistema de almacén, **WMH** = torre de control. Nombres de tablas/servidores marcados `[verificar]` porque provienen de lectura de pantalla.

---

## 1. De dónde saldrían los pedidos: el WMS y sus tablas
El OMS tomaría los pedidos del **WMS** (no de la tabla intermedia, que ya se descartó por insuficiente). Las tablas relevantes, según Rafael:

- **`expedición_cabecera`** — cabecera del pedido: información general, **campo `ruta`**, **campo `fecha_planificación_despacho`**, y un **campo de tipo de expedición** (`"TPE"`/tipo `[verificar]`, p. ej. picking rápido, chequeo/check). Guarda el pedido "puro", sin asignación a viaje.
- **`expedición_detalle`** — líneas/artículos del pedido: **unidades pedidas**, **unidades preparadas**, **unidades despachadas** (útiles para ver el progreso del pedido).
- **`almacén_movimiento_carcán`** `[verificar nombre — ¿"carga camión"/CARCAM?]` — registra cada artículo que se saca de almacén y se carga al camión (un registro por movimiento). Indica **qué pedidos ya han sido trabajados**, **cuáles se están cargando**, y **si un pedido está cerrado** (campo **`fecha_de_cierre`**). También guarda el **número de viaje WMS**, el **número de carga camión** y la **fecha de atención**.
- **`clientes` (WMS)** — datos del cliente; **recientemente** tiene campos **latitud/longitud** (falta confirmar que estén bien cargados/actualizados). No contiene la ruta.

**Cómo se conectan (clave primaria del WMS):** `expedición_cabecera` ↔ `expedición_detalle` ↔ `almacén_movimiento_carcán` se unen por **pedido + almacén + compañía + sucursal**.

## 2. Dos "subsistemas" y DOS números de viaje (WMS vs. WMH)
- El WMS tiene, en la práctica, **dos capas**:
  1. **WMS / almacén** (`almacén_movimiento_carcán`): maneja reducción de inventario, devoluciones, cierre y carga de los pedidos. Genera un **número de viaje WMS de forma AUTOMÁTICA** al cerrar el pedido → **casi siempre tiene valor**.
  2. **WMH / torre de control** (`Journey Orders` = cabecera viaje↔pedido, y `Journey Orders Transportation` = detalle con el chofer): solo maneja **a nivel de viaje**. Genera **otro número de viaje (WMH)**, pero **se carga MANUAL** → **puede no existir** para un pedido.
- **Problema Costa Rica vs. Venezuela:**
  - **Costa Rica:** **NO todas las compañías se cargan en torre de control** (solo una; el resto se procesa directo por WMS). EPA, por ejemplo, hace una carga automática/rápida (manda sus propios camiones) y no pasa por el procesamiento de camiones.
  - **Venezuela:** **todo se carga en torre de control** (las ~3 empresas ya están adaptadas). No tiene ese problema.
- **Lo que hizo Rafael en el TMS de Costa Rica (referencia):** un **híbrido**. Guarda dos campos — `número_viaje_WMS` y `número_viaje_WMH`. Al replicar/consumir: si el pedido existe en WMH, usa el **viaje WMH**; si no, usa el **viaje WMS**. Igual con los **choferes**: se buscan por **campos distintos** según el sistema (WMS por `Driver Code`; WMH por `Driver ID`) — **la clave primaria del chofer NO es la misma** en ambos.
- **Implicación para el OMS:** hay que **definir** si el OMS maneja **solo los pedidos cargados en torre de control** o **todos** (incluidos los que en CR van directo por WMS). Esa decisión determina **qué tablas/réplicas** se necesitan.

## 3. Campos clave para las reglas del OMS (y sus dudas)
- **`fecha_planificación_despacho` (en `expedición_cabecera`) — CRÍTICO.** La prioridad se calcula en función de esta fecha. **ACLARACIÓN (corrige la duda de Rafael):** el campo **SÍ se usa** — **hay registros con esa fecha cargada**, la manda el cliente al crear el pedido. Rafael había dudado en la sesión de si se usaba; se confirmó que sí. → Lo que queda por validar es la **cobertura** (¿la traen **todos** los pedidos o solo algunos?) y qué hace el OMS con los pedidos que **no** la traigan (fallback: fecha de carga camión / fecha de cierre / otra regla).
- **`ruta` (en `expedición_cabecera`).** En **Costa Rica es solo un número** (p. ej. 5, 4, 3, 2) que representa una ubicación que **los transportistas conocen de memoria**; **no hay tabla que mapee número → zona/nombre**. El valor viene de **Softland** y EPRAC solo lo traslada (no lo cataloga). En el TMS de CR, Rafael simplemente puso ese número y dejó que el cliente asumiera el destino.
- **Estatus / tipo:** hay estatus como **`PEN`** (pendiente) en `almacén_movimiento_carcán` = pedido **ya empezado pero no cerrado**. Si un pedido tiene un **número de viaje** (≠ PEN), ya está **cerrado**. El campo de **tipo de expedición** (`"TPE"`) tiene subtipos (picking rápido, chequeo/check…) cuyo significado **hay que confirmar con el cliente**.

## 4. Qué pedidos entran a la cola de priorización (filtrado)
- Usar **`almacén_movimiento_carcán`** para saber cuáles pedidos **ya fueron trabajados/cerrados** (campo `fecha_de_cierre`).
- **Decisión del cliente (pendiente):** ¿se siguen mostrando en la lista de prioridad los pedidos **`PEN`** (empezados pero no cerrados), o solo los que **faltan por trabajar**?
  - Si el cliente **no** quiere ver los ya empezados → excluir todo lo que esté en `almacén_movimiento_carcán`; quedarse con los que están en `expedición_cabecera`/`detalle` y **no** aparecen aún en carcán.
  - Si **sí** quiere verlos hasta el cierre → incluir los `PEN` e ignorar solo los cerrados.
- La intención lógica: la prioridad debe ser sobre **los pedidos que faltan por trabajar**.
- **Nivel pedido vs. viaje:** mientras la priorización sea **a nivel de PEDIDO** (primer sprint), se consulta el **WMS** (`expedición`). La pregunta de "torre de control sí/no" solo entra cuando se llegue a **nivel de VIAJE**.

## 5. Réplicas y servidores (estado actual)
- **Producción Costa Rica (OLO):** servidor **`10.17.2.420`** `[verificar IP]` → base **`IFLOW_OLO`** (producción) e **`IFLOW…`** `[verificar]`. **Estas dos son las que el OMS necesitaría.**
- **QA:** existe un `IFLOW_OLO` de QA (Rafael abrió QA por error; la buena es producción).
- **Softland productivo CR:** servidor **`…224.30`** `[verificar]`. **En Costa Rica NO existe un Softland unificado**: cada compañía tiene su **propio** sistema de facturación y le manda info al **EPRAC de OLO**. (En Venezuela **sí** hay un Softland con las 3 compañías → allá sí se puede consultar la ruta en Softland; en CR **no** hay acceso al Softland de los clientes.)
- **Réplicas existentes:** hay réplicas en uso de **Venezuela, Colombia y Costa Rica (Cofersa)** en una instancia llamada **`réplica`** en el mismo servidor. **PERO** Rafael **no encontró evidencia** de una réplica de las tablas de **`IFLOW_OLO` (CR producción)** que el OMS requiere.
- **Conclusión de infra:** **falta crear/solicitar la réplica** de `IFLOW_OLO` (CR). Si no, habría que **pegarle directo al transaccional** (no deseable). **Quién autoriza la solicitud de réplica no está claro** (¿el cliente? Rafael lo consultará con **Alfredo**). El OMS debe **especificar qué tablas y de qué BD** para poder pedirla.
- **Nota:** "Hiperpos" fue mencionado como "el único fiable para la info de OLO" `[verificar qué es]`.

## 6. Posicionamiento del OMS y visión de fondo (Jean)
- **¿El OMS reemplaza la torre de control?** En estas sesiones se reafirmó: **por ahora NO; trabajará a la par** (es un cambio muy grande). *(Consistente con la reunión de Antonio: reemplazo progresivo.)*
- **Opinión de Rafael:** convendría que el **nuevo sistema (OMS/TMS) FUERA la nueva torre de control**, ya que la torre de control "solo agarra los pedidos y les asigna un viaje".
- **Visión de Jean (JN):** que **este sistema depure/organice/corrija la data** (como hace el TMS de CR de Rafael) y que **el lago quede solo como contenedor de información YA depurada**. Es decir, la lógica de depuración vive en el OMS/TMS, no en el lago. **Alfredo** se reuniría con Jean para definir el proceso de extracción. **Nada de esto está cerrado.**

## 7. Recomendación técnica de Rafael para el OMS
> "Cuando vayas a buscar esta información, **conecta `expedición_cabecera` + `expedición_detalle` + `almacén_movimiento_carcán`** por **pedido + almacén + compañía + sucursal**."

- **`expedición_cabecera`** → la **ruta** (para las reglas) y la **fecha de planificación**.
- **`expedición_detalle`** → líneas y cantidades (progreso: pedidas vs. preparadas vs. despachadas).
- **`almacén_movimiento_carcán`** → qué está trabajado / cerrado (para decidir si el pedido entra o no a la cola).
- Para el **progreso del pedido**, Rafael recomienda **sumar** las cantidades de `almacén_movimiento_carcán` (más fiable en tiempo real) en vez de fiarse de `unidades_preparadas` de `expedición_detalle` (puede tener *delay* de actualización) — así lo hizo en el TMS de CR.

## Fuera de alcance (Planificación)
En la sesión también se habló de **choferes/conductores, transportistas (`transportation_company`), camiones (`transportation_unit`) y coordenadas de clientes** para el ruteo. Eso corresponde al **módulo de Planificación (Jesús)** y **no se aborda en este proyecto OMS**. Solo se retiene como referencia que la **georreferencia del cliente** (lat/long) apenas se está habilitando en la tabla `clientes` del WMS y **está sin confirmar**.

## Preguntas abiertas / pendientes (para el OMS)
1. **`fecha_planificación_despacho`:** **confirmado que SÍ se usa** (hay registros con la fecha). Pendiente: validar la **cobertura** (¿todos los pedidos la traen o solo algunos?) y definir el **fallback** para los que no la traigan.
2. **Alcance de pedidos:** ¿el OMS maneja **solo** lo que se carga en torre de control, o **todos** los pedidos (incluyendo los que en CR van directo por WMS)?
3. **Pedidos `PEN`:** ¿se muestran en la cola de prioridad hasta el cierre, o se excluyen una vez empezados?
4. **Réplica:** definir **qué tablas y de qué BD** (`IFLOW_OLO` producción CR) → **solicitarla** (quién autoriza: consultar con Alfredo/cliente). Hoy **no existe** esa réplica.
5. **Tipos/estatus de expedición** (`"TPE"`, check, picking rápido): confirmar significados con el cliente.
6. **Mapa ruta → zona:** en CR la ruta es solo un número sin catálogo; ¿de dónde sale el nombre/zona? (Softland del cliente, sin acceso en CR.)
7. **Calendario de rutas:** no hay tabla; hoy vive en **Softland** (que en CR no es accesible) y en el **Excel manual** de Ana. → refuerza que el TMS/OMS debería ser el **maestro** de ese calendario.

## Extractos verbatim clave (reconstruidos)
- **No hay réplica aún:** *"No tengo evidencia de que haya réplica de eso [IFLOW_OLO producción CR]… habría que replicarlo, porque si no le tendrían que pegar directo al transaccional. ¿Quién hace esa solicitud de réplica? No sé… déjame consultarlo con Alfredo."*
- **Fecha de planificación (duda de Rafael, luego corregida):** *"Hay un campo `fecha_planificación_despacho`, pero creo que ellos todavía no usan ese campo…"* — **NOTA DEL EDITOR:** esto se corrigió después: el campo **SÍ se usa**, hay registros con la fecha cargada.
- **Dos números de viaje / híbrido:** *"Tienes dos números de viaje: uno a nivel de torre de control (WMH) y otro a nivel de WMS… el de WMS casi siempre tiene valor porque se crea automático; el de WMH puede no existir porque se carga manual. En el TMS de Costa Rica hice un híbrido: si consigo el pedido en WMH uso ese viaje, si no, el de WMS."*
- **CR no carga todo en torre de control:** *"En Costa Rica solo una compañía se carga en torre de control; el resto se procesa directo por WMS… tienen que definir si van a manejar solo lo de torre de control o los dos."*
- **Ruta como número sin catálogo:** *"En Costa Rica la ruta es solo un número (5, 4, 3, 2…); ese número representa una ubicación que los transportistas ya conocen, pero yo nunca tuve de dónde sacar el mapeo. Lo saco de `expedición_cabecera` y no detallo más."*
- **Visión de Jean:** *"Jean quería que ese sistema hiciera lo que hace el TMS: que llevara el análisis, el ordenamiento y la corrección de la data, y que el lago quedara solo como un contenedor de información ya depurada."*
- **Recomendación de tablas:** *"Conecta `almacén_movimiento_carcán` con `expedición_detalle` y `expedición_cabecera`… en cabecera consigues las rutas para saber qué regla aplicar, y en carcán consigues cuáles pedidos ya fueron trabajados o cerrados."*

## Terminología corregida (de la transcripción)
| En la transcripción | Corregido |
|---|---|
| IPRAC / IPRA / Iprac | **EPRAC** |
| Soslan / Sollan / Soflan | **Softland** (ERP de facturación del cliente) |
| Jan / JN | **Jean** (desarrollador del cliente) |
| Iflow OLO / Iflo OLO / iflce | **`IFLOW_OLO`** (BD del WMS, producción CR) `[verificar]` |
| Iflow Febeca | BD `IFLOW` de Febeca (Venezuela) `[verificar]` |
| almacén movimiento carcán / carcal / carcampo | tabla **`almacén_movimiento_carcán`** (¿"carga camión"/CARCAM?) `[verificar]` |
| Jorn Orders / Jorness Horders / journal riding | **`Journey Orders`** (torre de control, cabecera) `[verificar]` |
| Jorn Orders Transportation / journal Transportation | **`Journey Orders Transportation`** (detalle, chofer) `[verificar]` |
| TPE X | **tipo de expedición** (`"TPE"`) `[verificar]` |
| Windry / Windy | **Windry** (cliente/EPRAC) `[verificar]` |
| Hiperpos | sistema mencionado como "fiable para info de OLO" `[verificar]` |
| WMH | torre de control | 
| WMS | sistema de gestión de almacén |
