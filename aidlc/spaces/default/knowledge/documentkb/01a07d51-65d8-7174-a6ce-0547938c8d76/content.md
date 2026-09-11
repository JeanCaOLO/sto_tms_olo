# Reunión funcional OMS con Antonio — flujo actual (WMH), priorización, origen de datos y aprovisionamiento

**Fecha:** `[verificar fecha exacta — ~2026-09-04 al 2026-09-07]`
**Participantes:**
- **Antonio** — funcional / encargado de la logística de pedidos; experto en el WMS y la torre de control (WMH) actuales. Es quien más habla (audio se cortaba mucho → varios términos reconstruidos).
- **Ana María** — Intelix, lidera la sesión.
- **Eduardo** — Intelix, módulo OMS (el usuario).
- **Andrey** — participa al inicio de la fase técnica y luego se despide.
- Referenciados: **Jesús** (módulo Planificación), **Ricardo** (inventario/planificación), **Rafael Padrón** (réplicas de datos), **Calzadilla** (datos/tablas de Venezuela), **Roni** (aprovisionamiento/permisos AWS), **Giancarlo** (cliente de ejemplo y usuario de QA del monitor), **Chirle**.

**Fuente:** transcripción automática, resumida y estructurada. La sección final se separa porque **Antonio se despide** (tenía un compromiso) y la conversación continúa entre **Eduardo y Ana María** (parte técnica).

> **Nota de terminología (transcripción corregida):** **EPRAC** (no IPRAC/IPRAX/IPEX/IPRA/IPA), **EFLOW** (no iflow/iflo/iflu/IFL), **Softland** (no Soflan/Sofland/Sofía — el ERP del cliente) `[verificar nombre]`, **QA** (no "Cuba/cubat"), **PostgreSQL** (no "pobre/postgre"), **Aurora** (no "Auror"), **stack** (no "TAC"), **Lambda** (no "Landa"), **CodeCommit** (no "Code Comic"), **AWS** (no "As"), **CDC / AWS DMS** (no "CDCDS"), **Capa X** (capa de integración). **WMH** = torre de control actual; **WMS** = sistema de gestión de almacén; **TMS/OMS** = lo que se construye. Términos aún dudosos marcados `[verificar]`.

---

## PARTE A — Sesión con Antonio (funcional del flujo)

### A.1 Origen del calendario de rutas
- **Hoy NO existe un calendario "por cliente"; es un calendario por RUTA.** Mayoreo (Cofersa y en general) es **venta tipo push**: el cliente no compra con cita ni "de hoy para mañana"; puede comprar todos los días y hay que entregarle todos los días. El cliente **"cae dentro de una ruta"**, no tiene fecha asignada.
- La data del calendario **no está en el WMS** (el WMS no maneja esa información) → **la maneja el TMS**. Por lo tanto, el **origen del calendario debe ser el TMS**. (Confirma la decisión previa: calendario = TMS, el OMS lo consume.)
- Antonio dijo al inicio que **ese calendario "se debería administrar en este módulo"** → el TMS/OMS debería ser el **maestro de rutas** y mantenerlo.

### A.2 Posicionamiento del OMS frente a la Torre de Control (WMH)
- **¿El OMS reemplaza la torre de control (WMH)?** → **Sí, la idea es reemplazarla, pero de forma PROGRESIVA.** No se quita de momento; se manejan **las dos formas en paralelo** mientras se prueba el OMS. Motivo: la torre de control es un punto **muy sensible**; si el OMS no queda bien, habría "una serie de problemas con los pedidos". **El fin último es eliminar la torre de control.**
  - → **Esto resuelve el bloqueante** que quedó abierto en la reunión de portafolio (¿reemplaza / intermedio / convive?): **reemplaza, con convivencia temporal durante la transición.**
- **Posición del OMS en el flujo:** el OMS es un **intermediario entre las tablas intermedias** (las que ya existen con EPA y Cofersa, que mandan los pedidos a la torre de control y al WMS) **y el WMS**. El OMS **analiza** esos pedidos y los **manda según las reglas** que se definan.
- **Corrección de dirección de datos (importante):** el OMS **NO toma información de EFLOW**. Al revés: **el OMS le PROPORCIONA información al WMS.** El OMS no consume nada de EFLOW.
- **Fuente de los pedidos a priorizar:** los pedidos que llegan por las **intermedias de EPRAC** (EPA/Cofersa).

### A.3 Cómo opera hoy el flujo (WMH → WMS)
1. Un pedido entra por **FE / EDI / manual** → pasa por la **tabla intermedia** → la consume el **WMH** (torre de control).
2. En el **WMH se arman los viajes**. Criterio de armado: en **Costa Rica prácticamente ninguno**; en **Venezuela** hay algo más (dimensión de camiones, costo de ruta).
3. Al cargar un camión, se le da **"check"** al pedido/grupo → llega al **WMS en forma de tareas**.
4. El **WMS consume la intermedia de inmediato** pero deja el pedido en **estado "disponible" / situación "disponible"**. Cuando la torre de control **arma y manda a alistar**, el pedido pasa a **estado "disponible" / situación "generada"**, y **ahí el WMS genera automáticamente las tareas** de picking/packing (el operador del WMS no toca nada).
5. **Antes de la torre de control** el proceso era **100% manual** dentro del WMS (entrar a salidas, seleccionar, filtrar pedido por pedido). Con el **WMH** se selecciona **por ruta**.
6. La torre de control asigna a cada pedido: **número de viaje** y **prioridad**. Por default el pedido trae en cabecera una **prioridad** y un **muelle/puerto** (EPA y Cofersa: **puerto 12**; EPA prioridad default **1**; **cross docking prioridad 0**).

**Ejemplo del dolor manual (ruta vs. observaciones):** un pedido llega con **ruta 4 (San José)** pero el vendedor puso una **observación** de entregar en **Guanacaste (ruta 25)**. Los operadores deben **filtrar por ruta, luego por observaciones**, sacar ese pedido de la ruta 4 e **inyectarlo manualmente** en la ruta de Guanacaste. Tienen que **aprenderse los viajes** (ej. Guanacaste "altura" vs. "bajura"). Muy manual y propenso a error.

**Guía de carga:** hoy la genera el **WMS**; en el **mundo ideal** debería generarla el **TMS**, con **lógica de secuencia de paradas/stops** (parada 1, parada 2… en orden de entrega). Hoy se hace "al revés" porque no hay un TMS real.

### A.4 Rol ideal del OMS en el flujo
- El **TMS arma y controla la ruta**; el **OMS ordena**: pone prioridades, decide qué tarea va primero/después e incluso el **orden de liberación** dentro de una misma ruta (según la secuencia física de entrega). El OMS hace los **"clicks" que hoy hace el operador antes de liberar**.
- Al terminar el WMS, la **guía de carga la debería generar el TMS**; WMS y TMS deben **comunicarse** (si algo no se preparó en el WMS o no se trabajó en el TMS, no debería poder cargarse).
- **Entrada al proceso de priorización:** **todas las expediciones en estado "disponible" / situación "disponible"**, tanto las que vienen por **integración** (intermedia) como las que se crean **por cargador** o **directamente en el WMS**. **Filtro de tipo: expedición ERP** (Cofersa hoy solo tiene expedición ERP).

### A.5 El OMS también propone FECHA DE LISTO (no solo prioridad)
- El OMS no solo **asigna prioridad**, también debe **proponer la fecha de listo/alistamiento**.
- **Regla T-1:** fecha de listo = **fecha de entrega − 1 día**.
  - Ejemplo: un pedido llega el lunes 31 pero su fecha de entrega es el 4; **no se debe listar el lunes** (quitaría capacidad a la mercadería que sí se va ese día). El OMS debería mandarlo a listar en su **T-1**.
- El OMS debe **balancear la carga de trabajo en vivo**: si a mediodía se acabó lo del día, **adelantar el día siguiente** y seguir liberando dinámicamente (no mandar a la gente a casa).

### A.6 Validación de inventario (viabilidad antes de liberar) — deseado, fuera del primer sprint
- El OMS debería **no liberar más de lo que el inventario soporta**. Ejemplo: **10 unidades y 20 pedidos de 1** → hoy EPRAC genera los 20; los primeros 10 toman unidades y **10 pickers quedan sin nada** (stops improductivos). El sistema debería **normalizar por oleadas** de picking y respetar la **prioridad de reposición** para que la reposición atienda **antes** de que llegue el picker.
- **Inventario a revisar:** el **inventario en vivo / total** = **suma de todas las ubicaciones** (alturas + zonas de picking + mezzanine). Artículos voluminosos (p. ej. compresores) van en **alturas** (más baratas), no en picking; si picking está en 0, el picker hace un **stop improductivo** → hay que **acelerar la reposición**.
- **Inventario disponible vs. comprometido:** hoy el WMS solo descuenta **cuando se piquea**; debería descontar **en vivo** conforme se **compromete** (10 → llega pedido de 1 → 9 → 8…). Hoy, si hay 1 unidad y 15 pedidos, se generan 15 tareas y **14 son improductivas** (hay que "omitirlas" dos veces para que el sistema las descarte).
- **Regla derivada:** dentro de las reglas del OMS hay que **revisar el inventario total (sumatoria de ubicaciones)** antes de liberar.
- **Capacidad/plantilla de operadores por zona:** **no está disponible en ningún sistema** (ni EPRAC la tiene); es operación interna, **no entra en el alcance de esta etapa**.

### A.7 Alcance del PRIMER SPRINT (decisión clave)
- **Priorización por PEDIDO (cabecera), NO por línea**, en el primer sprint. La tarea es por línea, pero el OMS cambiará la prioridad del **pedido completo**, sin segregar por línea. (Antonio pedía "todo" — "la carta al Niño" —; se acota conscientemente.)
- **Reglas básicas primero**, incorporadas **de forma progresiva**:
  1. **Asignación de ruta** (automatizar el primer paso manual: filtrar por ruta y asignar los pedidos a su ruta).
  2. Luego **fecha (T-1)** y **prioridad** asociadas.
  - El **lunes** se definirán **3–4 reglas concretas** para la primera entrega y se automatizarán las que **más dolor** causan, entrega por entrega (ej. regla 1 para el 30 de sep, regla 2 para el 15 de octubre).
- **Por compañía:** **Cofersa** = se trabaja la priorización por pedido. **EPA** = **no requiere priorización** (opera por **cross docking**: recibe y alista al mismo tiempo; no es una "tarea", sale con prioridad 1 por default pero no genera acciones de crossdocking). → EPA es una compañía **ya filtrada** del alcance de priorización.

---

## PARTE B — Después de que Antonio se despide (Eduardo + Ana María, parte técnica)

### B.1 Origen real de los datos
- Se había planteado tomar los datos de la **tabla intermedia**, pero tras la explicación de Antonio **hay muchos campos/variables que NO están en la intermedia**. La intermedia **solo indica si EFLOW procesó el pedido**: **procesado / pendiente / error**; no da el estado real ni todos los campos necesarios para las reglas.
- **Conclusión: la intermedia no basta.** Hay que revisar las **réplicas de pedidos** que ya existen y funcionan (corren, p. ej., **cada 20 minutos**) y que **probablemente están en el lago de datos**. Si sirven, no habría que crear estructuras nuevas.
- **Ruta del pedido:** llega **asignada desde Softland**, en la **cabecera del pedido** (Softland tiene la BD de clientes: código, nombre, dirección, georreferencias, contactos). El WMS **no liga** el pedido a la ruta vía catálogo; la **ruta viene en la cabecera** y solo se puede rastrear filtrando por cliente/pedido.
- **Calendario de rutas hoy:** son **dos tablas cargadas MANUALMENTE en el lago** (no alimentadas por nada automático), con **lista de rutas, días y horas de despacho**. Serán la **fuente de la primera regla** (match pedido ↔ ruta).
- **A quién consultar por los datos:**
  - **Rafael Padrón** → lista de **réplicas actuales** para OLO (**Costa Rica y Venezuela**); ya generaron un listado de réplicas para mayoreo en otro proyecto. (Eduardo/Ana enviarán correo.)
  - **Calzadilla** (Venezuela) → **tablas de pedidos/réplicas** y **tablas de rutas** de planificación de CR y VE.

### B.2 Integración con EFLOW / WMH (cómo entrega el OMS)
- Cuando la torre de control da **"okay"**, eso **viaja al WMS** (están conectados por **cambio de estatus**) y **genera las tareas**. **Por eso NO se puede desconectar el WMH todavía.**
- El OMS dejaría la información lista en el **estatus que necesita EFLOW** para que el proceso **EFLOW ↔ WMH** (que ya funciona) continúe generando tareas.
- **Pregunta abierta (costos/desarrollo):**
  - **Intervenir a nivel de datos** (cambiar el estatus directo en la BD de EFLOW) → **no requiere desarrollo de ellos**, es la **solución intermedia** inicial.
  - **Integración formal con EFLOW** → **sí requiere desarrollo** de su parte; es la **solución óptima** a futuro.
  - Se prefiere empezar por la intervención a nivel de datos para **automatizar las reglas básicas sin generar costos** y **evitar cambios en su sistema** `[verificar: "cambios a nivel de ISO"]`.

### B.3 Aprovisionamiento e infraestructura
- **Stack:** el mismo del lago/monitor → **AWS, Lambda y servicios AWS**. Frontend en **Amplify**, ahora **desplegable desde GitLab** (para el monitor tuvieron que usar **CodeCommit** porque en su momento Amplify no tomaba GitLab; ya no es necesario).
- **Permisos/usuario:** probablemente **reusar el mismo usuario/permisos del monitor** (ya tiene Lambda, API Gateway `[verificar: "ABC"]`, etc. aprovisionado). Debe ser en la **cuenta/consola de OLO**. Contacto: **Roni** (ya sabe stack y permisos del monitor).
- **Despliegue:** **solo Intelix despliega** (Jesús y Eduardo); los desarrolladores del cliente **prueban en local** (no tendrán permisos de despliegue).
- **Lo único que hay que pedir nuevo:** el **RDS** (si se usa BD propia del TMS) — **PostgreSQL**; falta definir si **Aurora** (se decide al hacer el modelo de datos). El **CDC** (Change Data Capture) no lo maneja el OMS: lo gestiona la **Capa X** (réplicas vía servicio CDC/eventos, tipo **AWS DMS**) `[verificar]`.
- **Ambientes:** el monitor hoy tiene **2** (QA y producción); **falta el 3.º (desarrollo)**. Eduardo aboga por **3 ambientes**. Alternativa de ahorro: **2 RDS** (productivo y QA) y, dentro del de QA, **una BD de desarrollo + una de QA**. El RDS del monitor es **PostgreSQL**. **No hace falta un RDS por aplicativo**: **el mismo RDS, bases de datos distintas**. La **talla del RDS se ajusta** (escala) según necesidad.

### B.4 Arquitectura de base de datos (discusión abierta)
- El OMS se pensó inicialmente "aparte", pero **está dentro de la misma aplicación (TMS)** → al final, **una misma base de datos** para el TMS (un mismo RDS/servidor, BDs distintas por ambiente).
- **Multi-compañía — postura de Ana María (NO decisión cerrada):** **no es partidaria de esquema por compañía** para estas aplicaciones. Su propuesta: llevar **país y compañía como columnas clave en TODAS las tablas**, más un **sistema de purga histórica** para mantener la BD limpia. Sí ve bien la **separación por compañía en las intermedias** (clientes distintos, datos "raros", errores).
  - ⚠️ **Contradice la recomendación del asistente** (esquema por compañía) y la decisión "parcial/pendiente" registrada en `project.md`. **Sigue ABIERTA** — es una postura, no un acuerdo firme.
- **Servicios comunes vs. propios del módulo:** común = **login/usuarios**. **Tabla de auditoría:** se armaría con la estructura del módulo que **más campos** necesite (los que usen menos dejan campos vacíos), o cada módulo la suya (la de OMS solo maneja **motivo** y **acción**). Es **propia del módulo**; estructura compartida a discutir.
- Para el OMS (trabaja con **réplica**, posiblemente vía **cola**, sin persistir mucho): quizá **no necesite estructuras nuevas** salvo sus tablas propias (auditoría; y, si guarda **simulaciones** 1/2/3 hasta la definitiva que va al WMH). En el primer sprint (solo **cabecera**), **ni siquiera necesita el detalle de líneas**.

---

## Próximos pasos y acuerdos
1. **Reunión con Antonio — lunes** (después de la 1:30 p.m. CR / horario coordinado): **exclusivamente para definir las REGLAS concretas** (3–4 reglas para la primera entrega; elegir cuáles automatizar primero).
2. **Origen de datos:** Eduardo coordina con **Padrón** (correo pidiendo la lista de réplicas OLO — CR + VE) y con **Calzadilla** (tablas de pedidos y de rutas CR/VE).
3. **Aprovisionamiento:** Eduardo revisa qué recursos ya existen (reusar los del monitor) y qué falta pedir; escribir a **Roni** por el **RDS** (¿usuario nuevo o reusar?). Coordinar con **Jesús** las tablas de Planificación para estructurar la **BD compartida**.
4. **Repos/ambientes:** los desarrolladores sincronizan para **migrar los repositorios** y dejar la configuración lista; definir ambientes (mínimo QA; discusión sobre el 3.º).

## Preguntas abiertas
- **Reglas concretas** del primer sprint (se cierran el lunes).
- **Fuente definitiva de los pedidos con todos los campos** (¿qué réplica del lago sirve? — Padrón/Calzadilla).
- **BD multi-compañía:** ¿**columnas país+compañía** (postura de Ana) vs. **esquema por compañía** (recomendación del asistente)? — sin cerrar.
- **RDS:** ¿**Aurora** o PostgreSQL estándar? — se define al modelar.
- **Integración con EFLOW:** ¿intervención a nivel de datos (intermedia) o integración formal (requiere desarrollo del cliente)?
- **Términos aún por verificar:** "Softland" (ERP), "ABC" (¿API Gateway?), "escoba" (¿tanda/ola de picking?), "ángel"/"Hangel" (¿estación/andén de picking?), "una prioridad" en A.3.

## Extractos verbatim clave (reconstruidos)
- **Reemplazo progresivo del WMH:** *"…sí viene a reemplazar la torre de control… pero es progresivo, porque la torre de control es un punto muy sensible. Si el OMS no queda bien, vamos a tener una serie de problemas con los pedidos. El fin es eliminar la torre de control."*
- **El OMS como intermediario:** *"El OMS es un intermediario que va a estar entre las intermedias que ya tenemos con EPA y Cofersa… Él va a analizar esos pedidos y los va a mandar en base a las reglas que nosotros le digamos."* / *"La información no viene de EFLOW; más bien el OMS es el que le va a proporcionar la información al WMS."*
- **Fecha de listo (T-1):** *"No solo asignar la prioridad, sino proponer la fecha de listo… si tengo que entregar el viernes, mi fecha de listo debería ser el jueves."*
- **Inventario en vivo:** *"Es el inventario disponible contra mi demanda, y debería ir sumando, debería estar en vivo… si alguien me pide y ya tengo las 10 comprometidas, no debería poder alistar, aunque el sistema todavía muestre 10."*
- **Alcance por pedido:** *"Yo lo estaba visualizando por pedido; la tarea es por línea, pero el OMS le cambia la prioridad al pedido completo, no lo segrega… ese es el primer ejercicio de automatización."*
- **La intermedia no basta:** *"Teníamos planteado tomar los datos desde la intermedia, pero después de todo lo que explicó Antonio, hay muchas variables que no están en esos registros… habría que ver de dónde se sacan con todos esos campos."*
- **Ruta desde Softland:** *"La ruta me llega en la cabecera del pedido… eso me viaja desde Softland; yo no lo ligo a nada en el catálogo del WMS."*
- **BD por compañía (postura de Ana):** *"No soy muy amiga de tener varios esquemas por país o por compañía para estas aplicaciones… lo que sí pudiéramos es que en todas nuestras tablas tuviéramos el país y la compañía como clave."*

## Terminología corregida (de la transcripción)
| En la transcripción | Corregido |
|---|---|
| IPRAC / IPRAX / IPEX / IPRA / IPA | **EPRAC** |
| iflow / iflo / iflu / IFL / "if" | **EFLOW** |
| Soflan / Sofland / Sofía | **Softland** (ERP del cliente) `[verificar]` |
| Cuba / cubat / cubano | **QA** (ambiente) |
| pobre / postgre | **PostgreSQL** |
| Auror | **Aurora** |
| TAC | **stack** |
| Landa | **Lambda** |
| Code Comic | **CodeCommit** |
| As | **AWS** |
| CDCDS | **CDC / AWS DMS** `[verificar]` |
| Vidal / Idal | **"el ideal"** (escenario ideal) |
| RP (tipo de expedición) | **ERP** (expedición ERP) |
| "carta del niño" | modismo = lista de deseos ("la carta al Niño") |
| Ron / Roni | **Roni** (aprovisionamiento/permisos) |
| WMH | torre de control actual (a reemplazar por el OMS) |
