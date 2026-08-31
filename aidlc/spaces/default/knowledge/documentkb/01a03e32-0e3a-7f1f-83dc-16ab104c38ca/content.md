# Reunión de seguimiento — Módulo OMS (roles de usuario)

**Fecha:** 2026-08-26
**Participantes mencionados:** Eduardo (presentó el avance de requerimientos/diseño técnico generado con Kiro), Andrey, Yanca (consultada y confirmó por chat durante la reunión), además se referencia contexto previo de Carlos y Valencia. Queda pendiente validar puntos con "el funcionario" (stakeholder de negocio externo al equipo de desarrollo).
**Fuente:** transcripción de reunión, resumida y estructurada.

## Contexto de roadmap (para orientar priorización de agentes/desarrollo)

**Etapa 1 — en definición/diseño/desarrollo ahora mismo:**
- **OMS**
- **Planificación**
- **Devoluciones / Logística Inversa** — recién arrancó el levantamiento (ayer); queda pendiente una próxima reunión para continuar el análisis del flujo de proceso.

**Etapa 2 — próxima, prioridad menor pero sí forma parte del alcance:**
- Última milla
- Gestión de fletes
- Tracker / Torre de Control

**Transversal — para todos los módulos:**
- Preparar y describir el catálogo de **data común / maestros** (ej. maestro de artículos) y la data transaccional común, identificando todas las entidades a manejar.
- Todo el desarrollo debe orientarse a la arquitectura de **"Capa X"** (suscriptor/proveedor de información), que está en definición en paralelo.

## Objetivo de esta sesión

Eduardo presentó el avance de la matriz de requerimientos del OMS (generada inicialmente con Kiro) — es muy extensa, así que se decidió dejarla como documento para revisión individual del equipo, y usar la reunión únicamente para **validar los roles de usuario** identificados, antes de seguir con historias de usuario.

## Roles del OMS — estado antes de esta reunión (según documento generado por Kiro)

1. **Operador** — descrito de forma ambigua/genérica; aparecía tanto en el requerimiento de calendario de rutas y días de despacho como en la cola de priorización operativa (torre de control).
2. **Administrador del OMS**
3. **Jefe de Almacén**
4. **Responsable del OMS**

## Decisiones tomadas en la reunión

### 1. "Operador" → renombrado a **"Operador de Despacho"**
- Se identificó que "Operador" era demasiado amplio y generaba confusión/errores previos solo por el nombre del rol.
- Corresponde al requerimiento de **mantenimiento de calendario de rutas y días de despacho** (guías, organización de rutas de salida).
- Se descartó el nombre alternativo "Planificador de despacho" — queda **"Operador de Despacho"** por ser más genérico.
- **Importante:** la funcionalidad de "cola de priorización operativa" (visualizar pedidos pendientes por prioridad, intervenir manualmente) que originalmente también aparecía bajo "operador de torre de control" **NO pertenece a este rol** — se reasigna conceptualmente al rol "Responsable del OMS" (ver abajo).

### 2. "Administrador del OMS" → renombrado a **"Administrador de Módulo"**
- Configura las reglas del sistema (priorización, etc.) — es el superusuario de este módulo específico.
- Se aclaró explícitamente que **no es el administrador de todo el TMS** (eso sería un superadministrador a nivel de sistema completo con todos los módulos integrados).
- Con este nombre, un mismo perfil "Administrador de Módulo" podría eventualmente tener acceso a uno o varios módulos (no solo OMS), en vez de crear un desarrollo aparte de permisos por-módulo desde cero.

### 3. "Jefe de Almacén" → se mantiene el nombre — **RESUELTO tras la reunión (ver Adenda)**
- Equivale, en la operación real de Ologistics, al **coordinador de piso/almacén** (Costa Rica) — término reconocible en ambas operaciones (Venezuela y Costa Rica).
- ~~Responsable de **revisar y aprobar la propuesta de priorización del OMS antes de que inicie el alistamiento** (requerimiento correspondiente).~~ **Superado — ver Adenda: no existe paso de aprobación, el flujo es automático.**
- Tiene acceso a reportería del módulo y a la planificación (la planificación en sí puede delegarse operativamente a otra persona, pero el Jefe de Almacén conserva el acceso/visibilidad).
- ~~**Punto abierto sin resolver en la reunión:** hay duda sobre si la aprobación de la propuesta de priorización antes del alistamiento le corresponde realmente a "Jefe de Almacén" o si es una responsabilidad de "Torre de Control" (es decir, del rol "Responsable del OMS") — **queda pendiente de validar**.~~ **RESUELTO — ver Adenda.**

### 4. "Responsable del OMS" — el rol más debatido, **RESUELTO tras la reunión (ver Adenda)**
Este fue el punto central de discusión de la reunión, sin resolución 100% cerrada en el momento (confirmado después — ver Adenda al final del documento):

- **Tensión identificada:** ¿el cálculo de prioridad de pedidos (fecha de despacho + día de ruta, reglas por cliente/torre — ver ejemplos EPA y Cofersa abajo) debe ser **totalmente automático** (el motor de reglas decide, sin intervención humana rutinaria), o requiere **aprobación humana obligatoria antes de la ejecución del alistamiento** (como señalaban los resúmenes de reuniones previas de definición del módulo)?
- El entendimiento de Andrey (y confirmado por conversación previa con Carlos y Valencia): el OMS existe para **automatizar** el proceso que hoy hacen 3–4 personas de Torre de Control manualmente en Costa Rica — mapear las reglas actuales (ej. fecha, hora de ingreso del pedido, personal disponible) y dejar que el sistema decida la prioridad sin intervención rutinaria.
- Reglas de priorización mencionadas como ejemplo (a mapear formalmente más adelante con "el funcionario"):
  - **EPA**: pedidos semanales; prioridad especial si hay quiebre de stock en tienda ("números rojos") — regla ya mapeada/automatizable.
  - **Cofersa**: reglas más dinámicas — día de salida de ruta, hora de ingreso del pedido al sistema, cantidad de personal disponible, etc.
- **Acuerdo tentativo de alcance para este rol:**
  - Consolida en **una sola persona** las funciones que hoy hacen varias personas de Torre de Control.
  - **Monitorea** el sistema: alertas del motor, conflictos contra el alistamiento y el WMS, pedidos sin configuración necesaria, errores que el sistema no puede resolver solo, etc.
  - **Interviene únicamente en casos extraordinarios** (no en el flujo normal día a día) — ejemplo dado: reasignar manualmente la prioridad de un pedido urgente que rompe el flujo normal (p. ej. un viaje extra que el cliente está dispuesto a pagar).
- Yanca fue consultada durante la reunión y confirmó que esta es la visibilidad que se tenía sobre el alcance del OMS.
- ~~**Acción pendiente explícita:** validar formalmente este rol (automatización total vs. aprobación humana obligatoria) — de ser necesario, convocar sesión con "el funcionario".~~ **RESUELTO — ver Adenda.**

## Lista de roles resultante de la reunión (nombres actualizados)

| # | Nombre anterior | Nombre acordado | Responsabilidad principal | Estado |
|---|---|---|---|---|
| 1 | Operador | **Operador de Despacho** | Mantenimiento de calendario de rutas y días de despacho | Cerrado |
| 2 | Administrador del OMS | **Administrador de Módulo** | Configura las reglas del sistema/módulo (potencialmente reusable para otros módulos) | Cerrado |
| 3 | Jefe de Almacén | **Jefe de Almacén** (sin cambio de nombre) | Visibilidad/reportería del módulo y acceso a la planificación — **sin paso de aprobación bloqueante** (el flujo de priorización es automático, ver Adenda) | Cerrado — confirmado post-reunión (ver Adenda) |
| 4 | Responsable del OMS | **Responsable del OMS** (sin cambio de nombre) | Monitorea el motor de priorización automatizado; interviene solo para alterar la prioridad de un pedido puntual | Cerrado — confirmado post-reunión (ver Adenda). Posible traslape con Jefe de Almacén en el punto 3 sigue **pendiente**. |

## Próximos pasos acordados

1. **Eduardo** vuelve a iterar con Kiro el documento de requerimientos del OMS incorporando: los 4 roles renombrados + la aclaración de que el cálculo de prioridad debe orientarse a ser automático (motor de reglas), con intervención humana limitada a casos extraordinarios.
2. Evaluar si el documento de diseño técnico también necesita regenerarse junto con los requerimientos (probable, aunque no se esperan cambios grandes).
3. Compartir ambos documentos actualizados (requirements + design) a todo el equipo vía carpeta compartida, para revisión minuciosa dado lo extenso de la matriz.
4. ~~Si queda algo sin claridad tras la revisión del equipo, convocar sesión con "el funcionario" — en particular para cerrar el punto abierto del punto 3 (alcance de aprobación de Jefe de Almacén).~~ Los puntos 3 y 4 ya quedaron resueltos — ver Adenda. **Acción nueva:** revisar si el REQ-4 original de `kiro-oms-requirements.md` (aprobación de Jefe de Almacén antes del alistamiento) debe reescribirse o eliminarse, dado que ya no existe ese paso de aprobación.
5. Antes de pasar a historias de usuario, confirmar que los roles cubren todo el flujo del proceso (¿falta algún rol?).
6. Siguiente actividad importante con "el funcionario": **definición formal de las reglas de negocio** de priorización (EPA, Cofersa, etc.) — insumo directo para el motor de reglas del OMS.
7. Reunión pendiente (día siguiente a esta) sobre la estructura de seguimiento de desarrollo/entregables que deben reportar los desarrolladores, ligada a la matriz de requerimientos, estimación estándar vs. acelerada, y el factor de aceleración.

## Adenda — 2026-08-26 (confirmación posterior a la reunión)

Se confirmó, resolviendo el punto abierto #4 (rol "Responsable del OMS"):

- **El cálculo de prioridad del OMS es 100% automático** (motor de reglas — no requiere aprobación humana obligatoria antes de la ejecución del alistamiento, contrario a lo que sugerían resúmenes de reuniones previas).
- **La intervención humana del rol "Responsable del OMS" es específicamente para alterar la prioridad de un pedido en particular** (caso puntual/extraordinario, ej. un pedido urgente que debe romper el orden que calculó el motor) — no para aprobar o revisar el cálculo de forma rutinaria.

Esto cierra el punto 4 de la tabla de roles.

**Segunda confirmación (misma fecha):** el punto 3 también queda resuelto. **No existe un paso de aprobación de "Jefe de Almacén" (ni de ningún rol) antes del alistamiento.** Motivo explícito: un paso de aprobación humana ahí **detendría el flujo automático del sistema** — contradice directamente el objetivo de automatización total confirmado en el punto anterior. En consecuencia:

- El requerimiento original tal como está redactado en `kiro-oms-requirements.md` — *"Como Jefe Almacén busca revisar y aprobar la propuesta de priorización del OMS antes de que se inicie el alistamiento"* — **queda superado y debe reescribirse o eliminarse** en la próxima iteración de requerimientos (tanto la de Eduardo en Kiro como la que corra en AI-DLC).
- "Jefe de Almacén" conserva **visibilidad** (reportería, acceso a la planificación) pero **no bloquea ni aprueba** el flujo de alistamiento — es un rol de monitoreo/gestión, igual en espíritu a "Responsable del OMS" pero a otro nivel organizacional (coordinador de almacén vs. torre de control).
- Con esto, **los 4 roles del OMS quedan cerrados** — no quedan puntos abiertos de esta reunión pendientes de validar con "el funcionario" sobre roles. La siguiente validación pendiente con "el funcionario" pasa a ser la definición formal de las reglas de negocio del motor de priorización (ver Próximos pasos, punto 6).
