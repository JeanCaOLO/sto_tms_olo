# Conversación exploratoria OMS — integración WMS/WMH, estados y motor de reglas

**Fecha:** `[verificar — ~2026-09-08]`
**Carácter:** ⚠️ **NO es una reunión oficial.** Fue una sesión interna del equipo para **entender el contexto que hemos recogido, conversar dudas/confusiones y listar lo que queda por definir**. **Todo lo de abajo es TENTATIVO / especulación**, no decisiones. Varias personas hablaban a la vez y la transcripción es confusa; los términos se reconstruyeron para que tengan sentido.
**Participantes (equipo Intelix):** Eduardo (OMS, el usuario), Ana María (toma notas), Chirle, Jesús (Planificación — su parte se omite por estar fuera de alcance). Referenciados: **Jean** ("Jan", líder cliente), **Calzadilla** y **Andrey** (a consultar sobre las tablas), **Antonio** (funcional, cierre de requisitos), **Dylan** (dev cliente), **Ricardo** (inventario).
**Fuente:** transcripción automática, resumida. Se descartó toda la charla no técnica.

> **Nota de terminología:** **WMS** = sistema de almacén (lo llaman **EFLOW**; BD `EFLOW_OLO`). **WMH** = torre de control (tablas `Journey Orders`). **Trade/Tray** = sistema que se reemplaza (el lago apunta a él). Nombres de tablas/campos/códigos marcados `[verificar]` — se leyeron de pantalla, mal, y algunos permisos aún no estaban disponibles.

---

## 1. Idea central de integración (tentativa): LEER del WMS, ESCRIBIR en el WMH
- La información que el OMS necesita (**`fecha_planificación_despacho`**, si un pedido está **cerrado**) está en el **WMS** (`expedición_cabecera` + `carga_camión`), **NO** en el WMH. → El OMS **lee del WMS**, **antes** de que el pedido llegue al WMH (leer del WMH "no tiene sentido porque es lo que se va a quitar").
- **PERO el WMH no se puede quitar todavía:** hoy el WMH es quien "**da el GO**" al WMS/EFLOW para que genere las **tareas de picking**. Mientras el OMS no automatice **todas** las reglas, ese proceso lo sigue disparando el WMH.
- **Estrategia tentativa:** **leer del WMS y escribir en el WMH**, para que el proceso actual (WMH → EFLOW → tareas) siga corriendo sin desarrollo del cliente. Cuando esté todo automatizado, se corta el WMH.
- **Riesgo señalado:** si las tablas/lógica del OMS **apuntan** al WMH, al quitarlo "se cae". Hay que diseñarlo para **no depender** del WMH y evitar tener que rehacer todo cuando se elimine.
- **Modo de escritura preferido:** **cambiar el estatus directo en la BD** (sin API ni desarrollo del cliente), en lugar de una integración formal.

## 2. Flujo de la 1.ª regla (asignación de ruta), como lo mostró Jean/Antonio
1. El sistema **lee todos los pedidos**.
2. El operador **elige una ruta X** → el sistema despliega **los pedidos asociados a esa ruta** (existe asociación previa pedido ↔ ruta).
3. El operador va **marcando** cuáles preparar (según ubicación/entrega/fecha).
- Hoy esto es **100% manual** en el WMH. El OMS automatiza ese primer paso: **filtrar por ruta y asignar cada pedido a su ruta**.

## 3. Cálculo de la fecha (lo más confuso — clave para la prioridad)
- El pedido trae una **`fecha_planificación_despacho`** (la manda el cliente), pero **la fecha real de despacho la determina la próxima SALIDA de esa ruta**, según el **calendario/plan de despacho** (por **chofer/ruta/día** — "planning chofer").
- **Ejemplo del ejercicio:** el pedido dice despacho 31/08, pero la ruta (con su chofer) sale el **01/09** → el OMS recalcula y la fecha efectiva es **la más cercana** (01/09). Esa fecha alimenta la prioridad.
- **Regla T-1 / T-2:** a la fecha de despacho se le **restan 1–2 días** para obtener la **fecha de alisto** ("prepárame el pedido N días antes de la salida").
- **El OMS debe PROPONER esa fecha** aunque planificación luego la cambie al asignar el viaje. Probablemente el OMS deba **guardarla en su propia BD** (p. ej. "fecha límite de alisto" / "fecha de despacho planificada calculada") y pasarla al WMS.
- **La `fecha_de_alisto` la pone hoy EFLOW** al generar la tarea. Hay ambigüedad sobre qué campo es qué.
- **Duda mayor:** ¿la fecha que el OMS calcula es el campo **`assignment_date`** (fecha de asignación) de `Journey Orders`, u otro campo? **Calzadilla dijo que `assignment_date` es a nivel de VIAJE** (planificación), no de pedido → **probablemente NO es ese campo**. → Preguntar a **Calzadilla/Andrey**.

## 4. Estados y situación (crítico para saber qué leer y qué escribir)
- Existen **dos campos**: **`estado`** y **`situación`** (aparecen en la tabla **`carga_camión`/`carcam`** y se referencian en `expedición_cabecera`). Nombres de campo tentativos: **`TPES` (estado)** y **`TPESI` (situación)**; en cabecera también hay un campo **`TPEX`** `[verificar todos]`.
- **Códigos observados:** **`DIS`/`DISP` = disponible**, **`PREP` = preparado**, **`DSP` = despachado** `[verificar]`.
- **Flujo del OMS (tentativo):**
  1. **Leer** los pedidos en **estado=disponible / situación=disponible (`DIS`/`DIS`)** → esa es la **cola de priorización**.
  2. Aplicar todas las reglas.
  3. Al terminar, **escribir en el WMH** cambiando la situación a **preparado (`DIS`/`PREP`)** → eso dispara el proceso normal (EFLOW genera las tareas). El cliente ya tiene un proceso que pone `PREP` por su cuenta; el OMS solo adelanta ese cambio.
- **Consecuencia:** cuando un pedido pasa a **preparado**, **desaparece de la cola del OMS** (ya no está en `DIS`/`DIS`). → Hay que decidir cómo ver los ya procesados: una **bitácora/histórico** o un **filtro de "preparados" en solo-lectura** (el OMS no vuelve a actuar sobre ellos).
- **Reemplazo de estatus / concurrencia:** el OMS **reemplaza el estatus** para que al operador manual **no le aparezca** en su filtro y no haya **doble trabajo**. Si otro operador ya priorizó un pedido en el WMH, el OMS **no lo verá** (ya salió de `DIS`). → Importante **registrar qué se tocó por dónde** (un campo de observación 1/2: "hecho por OMS" vs. "hecho por WMH manual") para trazabilidad.

## 5. El motor de reglas: ¿score ponderado o filtro? (duda para el cliente)
- El mockup calcula la prioridad como un **conjunto de reglas con PESO (score)**: se aplican las reglas y, según **cuáles se cumplan y su peso**, sale un **score** → la prioridad.
- **Pregunta clave al cliente:** ¿las reglas deben cumplirse **TODAS** obligatoriamente, o **cada una suma peso**? Si deben cumplirse todas, entonces sería un **filtro**, **no** un motor de prioridad. Hay que confirmarlo.
- **Prioridad numérica:** el cliente maneja **números consecutivos 1..N** (1 = máxima). Necesitamos que **el cliente dé la tabla de prioridades** (insumo). Cuando desaparezca el WMH, **¿de dónde sale ese número?** → insumo pendiente.
- **Override manual:** el cálculo es automático, pero debe permitir que **un rol autorizado baje/cambie la prioridad a mano** (camión dañado, chofer accidentado, EPA urgente, impulsar un camión con poca carga). Confirmado como **opción limitada a cierto rol**.
- **Ambigüedad:** cuando el motor no pueda resolver una regla, debería mostrar una **pantalla para que el operador asigne la prioridad manualmente**.

## 6. Reglas identificadas (tentativas, en orden de automatización)
1. **Asignación de ruta** — filtrar por ruta y asignar el pedido a su ruta.
2. **Fecha** — T-1/T-2 → fecha de alisto y prioridad según la próxima salida de la ruta.
3. **Capacidad/tamaño del camión** (peso/volumen) — el camión sale con cierta capacidad; **NO se automatiza al inicio** (habría que traer todo el peso/volumen). El **peso está en el detalle** (`cargado`/peso); **no manejan volumen**, usan **peso teórico**. La **sumatoria de pesos de los pedidos = peso del camión**.
- Falta la reunión con **Antonio** para definir bien las **3–4 reglas concretas** y priorizar cuáles automatizar primero (era "el lunes", se movió).

## 7. Nivel cabecera vs. línea (confirmado de la sesión del viernes)
- Hoy la prioridad se maneja a **nivel de cabecera (pedido)**, no de línea. Lo óptimo sería **por línea** (entran reglas de **inventario**, altura → generar actividad de bajada, menudeo…), pero eso es "la carta al niño" → **futuro**. **Primer alcance = por cabecera.**
- **Pregunta:** si un pedido **ya está en preparación** y entra en los elegibles para cambiar prioridad, **ya no se puede** → el OMS debe **llevar registro de las prioridades que no puede cambiar** (las que ya salieron de `DIS`).

## 8. Naturaleza del mockup / UI
- El mockup del OMS es un **"ejecutor"** (automatiza), no solo un lector. Surge la duda: como el proceso es automático, **¿en qué momento se le muestra la lista al operador?** ¿Es instantáneo o puede ver/intervenir la lista antes de que se apliquen las reglas?
- **Idea:** la **cola de priorización** = la tabla de pedidos en `DIS`/`DIS`, con **movimiento en vivo** (cambia fecha, cambia estado — "esto se está procesando"), similar a los filtros del monitor. Mostrar una **bitácora** de lo ejecutado por si quieren intervenir. Ver "preparados" en un **filtro de solo-lectura**.

## Fuera de alcance (solo como contexto)
- **`Journey Orders` / `assignment_date` es a nivel de VIAJE = Planificación (Jesús)**, no OMS. El OMS lee del WMS; la **asignación de viaje** no es del OMS. Planificación calcula la mejor ruta/orden de entrega, capacidad del camión, etc.
- **`Journey Orders` "es de Trade"**; el **lago apunta a Trade** y le manda la fecha "un día antes" para la agenda del chofer. A futuro **Trade no existirá**.
- **Otros módulos:** Dylan subió la rama del **tracker/liquidador** (tasas, "señor taza" = Ricardo) — es **prototipo**, falta definir estándares de backend. Jean priorizó para el 30: **planificación (tasa)** y **liquidador**; aún no cerró **devoluciones/logística inversa**.
- **Permisos GitLab:** el grupo del cliente los estaba organizando para dárnoslos.

## Preguntas abiertas (a quién preguntar)
1. **`assignment_date` vs. `fecha_planificación_despacho`:** ¿nivel pedido o viaje? ¿son la misma? → **Calzadilla / Andrey**.
2. **¿Dónde se guarda hoy** la fecha que el WMH asigna manualmente (la de la próxima salida/despacho recalculada)? → ver en WMH / cliente.
3. **Motor:** ¿las reglas se cumplen todas (filtro) o suman peso (score)? → **cliente**.
4. **Tabla de prioridades** (números 1..N): insumo que debe dar el cliente; ¿de dónde sale cuando no exista el WMH?
5. **Campos a mostrar** en la cola y **nombres/códigos exactos** de `estado`/`situación` (`TPES`/`TPESI`/`TPEX`, `DIS`/`PREP`/`DSP`).
6. **Reunión con Antonio** (próxima): cerrar requisitos del OMS y que muestre **en pantalla** dónde está cada campo. Planificación aún no.

## Extractos verbatim clave (reconstruidos)
- **Leer WMS / escribir WMH:** *"Lo que podemos es leer del WMS y escribir en el WMH para que el proceso suyo actual siga… cuando yo quite ese, no voy a tener ningún problema."*
- **No se puede quitar el WMH aún:** *"El que ahorita le da el GO al WMS para hacer las tareas es el WMH… por eso no lo podemos quitar de una."*
- **Fecha por próxima salida:** *"La fecha real de despacho la va a determinar la salida que tengas para entregar… cuando le aplicas el motor te puede resultar otra fecha, porque depende de la ruta… la más cercana."*
- **Score vs. filtro:** *"Si te dicen que todas las reglas se tienen que cumplir, entonces estás haciendo un filtro, no un motor de prioridad de pedidos."*
- **Override:** *"Esto tiene que tener la capacidad de que, aunque le dije que era prioridad uno, yo la puedo bajar… porque el camión se accidentó… esa opción está limitada a cierto rol."*
- **Estados disponibles → preparado:** *"Yo debería tomar los `DIS`/`DIS` y, cuando vengan de regreso, se van a poner `DIS`/`PREP`… ese es el último estatus que viene de allá para acá."*

## Terminología corregida (de la transcripción)
| En la transcripción | Corregido |
|---|---|
| Jan | **Jean** (líder del cliente) |
| iflo / iflu / iflow | **WMS / EFLOW** (BD `EFLOW_OLO`) |
| WMH | **torre de control** |
| moco / mocó / mocota / mocop | **mockup** |
| Carcam / carcán / carga camión | tabla **`carga_camión` (CARCAM)** `[verificar]` |
| Journey Orders / Juner Order | **`Journey Orders`** (WMH/Trade, nivel viaje) `[verificar]` |
| assignment day / assignment date | **`assignment_date`** (fecha de asignación, nivel viaje) `[verificar]` |
| TPEX / TPES / TPESI / TPEC | campos de `expedición_cabecera`: `TPEX`, `estado`, `situación` `[verificar]` |
| DIS / DISP / DSP / PREP | disponible / disponible / despachado / preparado `[verificar]` |
| trade / tray | **Trade** (sistema a reemplazar; el lago apunta a él) |
| el niño (a consultar) | **Calzadilla** |
