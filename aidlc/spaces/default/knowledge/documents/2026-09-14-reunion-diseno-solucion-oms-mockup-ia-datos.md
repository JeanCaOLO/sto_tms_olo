# Reunión de diseño de solución OMS — mockup, motor de reglas, IA para observaciones, modelo de datos y multi-compañía

**Fecha:** `[verificar — ~2026-09-14]`
**Participantes (equipo Intelix):** **Eduardo** (OMS, el usuario) y **Ana María** (principalmente). Referenciados: **Calzadilla** y **Rafael** (BD/datos), **Jesús** (Planificación), **Alfredo** (solicitud de réplicas), **Ron/Dubler** (validación de BD del monitor), equipo de **arquitectura**.
**Fuente:** transcripción automática, resumida y estructurada. Reunión **interna de diseño** (no oficial con cliente); varios puntos son **tentativos**.

> **Terminología corregida:** **EFLOW** (no iflow/iflo/if), **OLO** (no "oro"), **JSON** (no "Jason"), **mockup** (no mocop/mocó), **Capa X** (no "KX/K X"), **DeepSeek** (no dipsic/dipsek), **Claude** (no "Cloud"), **OpenAI** (no "Open AI"), **OpenRouter** (no "Open router"), **Amazon Bedrock** (no "Bedw"), **Gemini / "Gems"** (no "Jeninai/gema"), **Calzadilla** (no Casillo/Calcella/Casadillo), **`assignment_date`** (no "Simon Date"), **Carcam** (no carcá/carcán), **Lambda** (no "landa").

---

## 1. Cola de Priorización (pantalla de pedidos)
- **Selección de columnas por usuario:** el usuario podrá elegir qué columnas visualiza. Se guarda en una tabla **`User Preference`**, manejada con un campo **JSON**.
- **Filtro por estado/situación con default `DISP` (disponible):** hoy el filtro muestra todo; debe entrar **por omisión en `DISP`** para que el usuario vea los pedidos nuevos/pendientes. El usuario podrá cambiar a otros estados ya procesados.
- **Se MANTIENE el filtro de "almacén"** en esta pantalla (corrección: NO se quita; una compañía puede tener varios almacenes — ver §7). Y **mostrar el nombre de la compañía** (hoy muestra el código `009` porque va directo contra los datos → hay que hacer *match* con el maestro para traer el nombre).

## 2. Dónde ver las priorizaciones ejecutadas
- **Simulador** = vista previa (lo que **no** se ha aplicado aún).
- **Auditoría** = registra las asignaciones de prioridad **manuales y automáticas** (la misma lista de pedidos, pero con el **tipo**: automático vs. manual). Ahí es donde se ven las priorizaciones ya ejecutadas.

## 3. Motor de Reglas (confirmado el rediseño a catálogo)
- Se confirma el cambio de **dinámico → catálogo semi-configurable**: por regla se muestra **nombre, descripción, activa/inactiva (toggle), peso** (editable por el usuario con permisos) y **parámetros** (según la regla; p. ej. días/horas relativos a la fecha de la ruta — "48 horas antes").
- **Regla de cliente retira:** parámetros = **patrón de detección, prioridad, ventana**.
- **Regla 1 (primera entrega) — fecha:** aclaración importante sobre "calcula la fecha de listo":
  - No se **modifica** ninguna fecha (Eduardo lo recalcó: *"yo no necesito que me calcules una fecha, necesito que no la modifiques"*). La fecha de entrega se toma como **INSUMO** para decidir la prioridad y el momento.
  - **Planteamiento concreto de la regla:** *cuando se cumple el parámetro (T-1) → cambia `estatus = DISP` + `situación = GENERADA` y asigna `prioridad = 1`.* Es decir, con la fecha se **decide**; la acción es cambiar estatus/situación + prioridad.

## 4. Análisis de observaciones con IA (idea nueva, requiere evaluación de costos)
- El **cliente retira** por sí solo se puede resolver con un **condicional/expresión regular** que lee el texto de la observación y detecta el patrón. Pero es **poco flexible**.
- **Propuesta:** usar un **modelo de IA** que **lea la observación** y decida qué es (cliente retira, cambio de dirección, quién recibe, cambio de día de entrega, etc.), guiado por un **prompt**. Más flexible, "analiza casi como una persona".
- **Reutilizable:** el mismo modelo/campo sirve para varias reglas — mismo prompt base, **condiciones de inicio distintas → salidas distintas**; y **una misma observación puede dar varias salidas** (p. ej. cliente retira + cambio de dirección).
- **Costo — CONFIRMADO barato (Eduardo ya hizo las pruebas):** clasificar un texto de ~40 caracteres sobre **~400 registros/día** y disparar Lambdas de acción, con **modelos ultraligeros**, cuesta **< $1 USD/mes**. (Referencias: **DeepSeek** ~$0.30/millón de tokens; el costo depende del modelo.)
- **Cómo estimarlo:** medir tokens de entrada+salida por pedido, multiplicar por los **~400 pedidos/día** (solo **Cofersa**, filtrando), luego mensual.
- **Prueba planteada:** usar **OpenRouter** (prueba gratuita) con un modelo **DeepSeek (V3/V4)**; armar un ciclo con el prompt que consuma la observación, ejecute y devuelva la decisión + el **JSON con el consumo**; probar con un pedido **con** observación y otro **sin**.
- **Modelo — decisión:** como la arquitectura está en **AWS**, lo ideal es usar los **modelos nativos de Amazon Bedrock** (ultraligeros) integrados directamente con las Lambdas. (La prueba con OpenRouter/DeepSeek fue solo para medir consumo.)
- **Diseño:** el **prompt NO es editable desde la UI** (es delicado; el resultado depende del prompt) → no es un parámetro. La regla en la UI solo guarda lo visual (nombre); la lógica/prompt vive en la **Lambda**.
- **Alcance:** por ahora la salida a implementar es solo **cliente retira**; el modelo se deja preparado para agregar otras salidas después. Presentar esta propuesta (con modelos y costos) en el mockup **la próxima semana**.

## 5. Modelo de datos del OMS (qué se guarda)
- La estructura de BD la generará **Kiro** en sus artefactos, **pero** falta **definir qué BD** se usa (ver §7).
- El OMS **no guarda todo** el pedido, solo datos básicos: **código/número de pedido, estado, situación, compañía, almacén, sucursal, ruta, prioridad, y fechas** (fecha estimada de entrega/despacho, fecha de creación). El **cliente** se guarda aunque lo use más planificación.
- **Quitar el campo "fecha de listo":** **no existe en EFLOW** y el OMS **no genera fechas**. (Se pueden **mostrar** las fechas que sí existen: creación, cierre, planificada de despacho, generación, expedición planificada, modificación.)
- **`assignment_date`** (Journey Orders): Calzadilla aclaró que es la **fecha de creación de ese registro en Journey Orders** (nivel viaje). Se puede traer la fecha del viaje asignado a la ruta y **guardarla solo para tenerla**, sin consultarla siempre.
- **Nivel cabecera** por ahora (sin detalle/líneas; el `número de línea` se podría mostrar, pero **no hay regla asociada a líneas** todavía).

## 6. Viaje y relación con Planificación (aclaración de alcance)
- Los pedidos que el OMS prioriza (en `DISP`/`DISP`) **NO tienen viaje asignado todavía** en la primera lectura. Pero **para ese día debe existir un viaje ABIERTO** (Planificación abre viajes a diario, por bajada).
- **Quién asigna pedido → viaje: Planificación**, de forma **automática**, tomando los pedidos que el OMS ya mandó a preparar. El OMS solo dice "**prepáralo**" (cambia a `situación = generada`); luego el WMS crea las tareas de picking/packing; cuando está preparado pasa a **predespacho**, y Planificación lo toma para asignarlo al viaje (con sus propias reglas de camión/capacidad).
- Por eso el OMS **prepara los que NO tienen viaje** (los `DISP`). Idea: una **vista adicional** con la **lista de viajes abiertos** (viene de Planificación), separada de la priorización.
- **Nota de proceso:** hoy el WMH resuelve **dos procesos en uno** (pedido + transporte); el cliente los tiene como procesos separados (planificación, almacenaje, **preparación de pedidos** [aquí entra el OMS], transporte). Al hacer módulos distintos, los separamos.

## 7. Multi-compañía / multi-país (decisión de arquitectura importante)
- **Las reglas son muy específicas por compañía** → NO son parametrizables en código: cada compañía tendrá su **Lambda específica**, y las reglas deben **identificar de qué compañía son**. (Se descartó hacerlas configurables/parametrizadas por lo específico de la lógica.)
- **NO habrá UI por perfil de compañía (corrección: NO es como el monitor):** en un **mismo perfil el usuario PUEDE ver lo de otras compañías**. La compañía es un **filtro/selector dentro de la vista** (no un silo por perfil); el usuario puede alternar entre compañías sin cambiar de perfil.
- **BD: una sola base de datos para todas las compañías** (como el WMH, que filtra por compañía). El monitor usa **un esquema, una tabla, y la compañía como campo/columna**; se inclinan a replicar ese enfoque. *(Esto refuerza la postura de "columna compañía" sobre "esquema por compañía"; la decisión de BD sigue formalmente ABIERTA — ver `project.md`.)*
- **Multi-almacén:** una misma compañía puede tener **varios almacenes** (Colombia/Mundial de Partes: 2 bodegas; Costa Rica: 1–2 con zona franca; Venezuela: 1). El operador **se mueve entre almacenes** → habrá **filtro por almacén** dentro de la compañía.
- **País:** se maneja **dentro del código de compañía** (evitar un filtro de país aparte): p. ej. `EPA GT` / `EPA VE`. EFLOW maneja los códigos.
- **Estándar Capa X:** **TODAS las tablas deben tener `compañía` y `país`** (incluido el monitor). El nombre de la compañía se resuelve con un **maestro** (tabla de compañías) que debería vivir en **Capa X** (aún no existe) — **no** consultar EFLOW cada vez; crear una tabla que migre a Capa X cuando haga falta.

## 8. Cruce con Carcam / Journey Orders (qué pedidos tomar)
- **Carcam** = registra cada carga de artículo al camión (varios registros por pedido). Dice qué pedidos **ya se trabajan/cargan**, cantidades cargadas (progreso vs. `expedición_detalle`), si está **cerrado** (`fecha_de_cierre`, nº guía, nº carga camión), **nº de viaje (WMS)**, **fecha de atención** y **chofer** (por `driver_code`). **Detalle = lo pedido (demanda); Carcam = lo ya trabajado/cargado.**
- **El OMS incide sobre lo pendiente:** toma de `expedición_cabecera` los que **aún no** están en Carcam / no cerrados (no los que ya se están preparando). Preguntar a **Calzadilla** exactamente **qué campos/estados** usar en el cruce.
- **Alternativa/complemento:** consultar también **`Journey Orders`** (viajes) — un pedido que **no** está ahí es que **no** tiene viaje (no se está preparando aún); si está, ya tiene viaje y se está preparando. Puede que haya que chequear **ambas** (Carcam + Journey Orders). Un pedido puede estar en **dos viajes** (dos camiones) → su ID puede repetirse en Journey Orders.

## 9. Réplica de EFLOW OLO — CONFIRMADO: no existe (bloqueante)
- Se **confirmó** (Rafael, con Calzadilla unido) que **NO hay réplica de EFLOW para OLO**. Solo **Venezuela** tiene réplicas de ciertas tablas/esquemas en una instancia de réplicas del servidor; **para EFLOW OLO no existe**.
- Sin réplica, cualquier consulta pegaría **directo al transaccional** (no deseable). Hay que **solicitar crear/extraer la réplica vía Alfredo**, indicando **qué tablas** se necesitan (al menos `expedición_cabecera`, `Journey_Orders`, `Carcam`) → **coordinar con Jesús** las tablas comunes.
- Duda abierta: quizá la extracción para el lago se hace pero **no se persiste** (¿staging?) → verificar. **Ana no estuvo** en la reunión donde se dijo esto y le sorprendió ("¿cómo se alimenta el lago sin réplica?").

## 10. Otros puntos
- **Prioridad intermedia (EPA):** EPA está pidiendo **añadir un campo de "prioridad intermedia" en `expedición_detalle`/cabecera**. Como implica una modificación a nivel de línea, **a futuro se podría aprovechar** para que a **Cofersa** también se le pueda asignar prioridad por ese campo (Cofersa no lo envía, pero se le podría **asignar**).
- **Backorders (Cofersa):** si no hay producto, esa línea **no se debería mandar a preparar** (generar traslado desde altura, o no enviar). Requiere **consultar existencias** (API o tabla de inventario actualizado) → **no está** ni a nivel de integración; **fuera de alcance** ahora (necesita control por línea). Regla futura.
- Se comentó que **otro desarrollo** (¿"Pasado"?) asigna prioridades pero **del lado del cliente** `[verificar]`.

## Acciones / pendientes
1. **IA observaciones:** hacer la **prueba con OpenRouter + DeepSeek** (1 pedido con obs. y 1 sin), medir consumo, extrapolar a ~400 pedidos/día de Cofersa; **consultar a arquitectura** por modelo en Bedrock y estimar uso. Preparar la propuesta para el mockup (próxima semana).
2. **Réplica:** definir tablas y **solicitar a Alfredo** la réplica de EFLOW OLO; coordinar con **Jesús**.
3. **BD:** cerrar con arquitectura/Calzadilla el enfoque (una BD, compañía+país como columnas; Capa X). La compañía se ve/filtra dentro de la vista (no por perfil).
4. **Cruce de datos:** confirmar con **Calzadilla** qué campos/estados de Carcam (y/o Journey Orders) filtran los pedidos a priorizar.
5. **Mockup:** aplicar selección de columnas (User Preference/JSON), default `DISP`, **mantener** el filtro de almacén, agregar **filtro/selector de compañía dentro de la vista**, mostrar nombre de compañía, priorizaciones ejecutadas en Auditoría.

## Terminología corregida (de la transcripción)
| En la transcripción | Corregido |
|---|---|
| iflow / iflo / if | **EFLOW** |
| oro | **OLO** |
| Jason | **JSON** |
| mocop / mocó | **mockup** |
| KX / K X | **Capa X** |
| dipsic / dipsek / DEC…es | **DeepSeek** |
| Cloud | **Claude** |
| Open AI | **OpenAI** |
| Open router | **OpenRouter** |
| Bedw / Amazon Bed | **Amazon Bedrock** |
| Jeninai / gema | **Gemini / "Gems"** |
| Casillo / Calcella / Casadillo / Calzado | **Calzadilla** |
| Simon Date | **`assignment_date`** |
| carcá / carcán | **Carcam** (carga camión) |
| landa | **Lambda** |
