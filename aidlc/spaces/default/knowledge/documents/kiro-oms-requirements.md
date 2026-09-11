# Requirements Document

## Introduction

El OMS es un sistema satélite del TMS OLO que se posiciona entre el WMS/Torre de Control y el lago de datos. Su función principal es calcular la prioridad de cada pedido según reglas de negocio configurables (no FIFO) e insertarlo en el lago de datos con esa prioridad ya asignada. El sistema debe prevenir tanto el alistamiento prematuro (saturación del muelle de despacho) como el tardío (pérdida de la ruta). Incluye aprobación humana obligatoria antes de la ejecución del alistamiento. Soporta operaciones multi-país (Costa Rica y Venezuela) con calendarios de rutas distintos.

## Glossary

- **OMS**: Order Management System — sistema satélite que calcula y asigna prioridades a pedidos antes de su ingreso al lago de datos del TMS.
- **Motor_de_Reglas**: Componente del OMS que evalúa condiciones de negocio configurables para calcular el `priority_score` y `priority_tier` de cada pedido.
- **Cola_de_Priorización**: Vista operativa que muestra los pedidos pendientes ordenados por prioridad calculada, con capacidad de override manual.
- **Panel_OMS**: Dashboard de salud del motor de priorización que muestra KPIs operativos.
- **Calendario_de_Rutas**: Mantenimiento de la relación ruta ↔ día(s) de salida ↔ excepciones por cliente. Es la fuente de verdad para la Regla 1 del Motor de Reglas.
- **Simulador_de_Reglas**: Herramienta que permite previsualizar el efecto de cambios en reglas sin aplicarlos en producción.
- **Auditoría_de_Priorización**: Registro histórico de cada cambio de prioridad (automático o manual), con actor, motivo y timestamp.
- **priority_score**: Valor numérico que determina la posición de un pedido en la cola de priorización.
- **priority_tier**: Nivel categórico de prioridad asignado a un pedido (ej. crítica, alta, media, baja).
- **ready_to_prep_date**: Fecha calculada en la que un pedido debe enviarse a alistar, derivada del calendario de la ruta.
- **Override_Manual**: Acción por la cual un operador autorizado modifica la prioridad calculada automáticamente, requiriendo un motivo obligatorio.
- **WMS**: Warehouse Management System — sistema externo que genera pedidos y viajes.
- **Torre_de_Control**: Centro operativo que supervisa el flujo de preparación y despacho de pedidos.
- **Lago_de_Datos**: Repositorio de datos del TMS donde el OMS inserta los pedidos ya priorizados.
- **Operador**: Usuario con rol de operaciones (torre de control/almacén) que aprueba la propuesta de priorización del OMS.
- **Regla_de_Priorización**: Condición de negocio configurable que, al evaluarse contra un pedido, contribuye a su priority_score.

## Requirements

### Requerimiento 1: Mantenimiento de Calendario de Rutas y Días de Despacho

**User Story:** Como operador de logística, quiero mantener un catálogo centralizado de rutas con sus días de salida y excepciones, para que el motor de reglas tenga una fuente de verdad confiable sobre cuándo despacha cada ruta.

#### Criterios de Aceptación

1. THE Calendario_de_Rutas SHALL permitir crear, leer, actualizar y desactivar registros de ruta con sus días de salida semanales asociados.
2. WHEN un operador crea o actualiza un registro de ruta, THE Calendario_de_Rutas SHALL almacenar el identificador de ruta, al menos un día de la semana de salida (lunes a domingo) y el país al que pertenece, rechazando la operación si no se selecciona al menos un día de salida.
3. WHEN un operador registra una excepción puntual, THE Calendario_de_Rutas SHALL almacenar la fecha específica (que debe ser igual o posterior al día actual), el cliente afectado y el motivo de la excepción (campo obligatorio, máximo 500 caracteres).
4. WHILE una excepción puntual tiene una fecha específica igual o posterior al día actual para un cliente, THE Motor_de_Reglas SHALL usar la fecha de excepción en lugar del día de salida regular de la ruta para calcular el ready_to_prep_date de los pedidos de ese cliente.
5. IF un operador intenta crear una ruta con un identificador que ya existe para el mismo país, THEN THE Calendario_de_Rutas SHALL rechazar la operación e indicar que la ruta ya está registrada.
6. THE Calendario_de_Rutas SHALL soportar calendarios independientes por país (Costa Rica y Venezuela) con días de salida distintos para la misma ruta lógica.
7. WHEN un operador desactiva una ruta que tiene excepciones futuras registradas, THE Calendario_de_Rutas SHALL desactivar también las excepciones asociadas y generar una alerta en el Panel_OMS indicando la cantidad de excepciones afectadas.
8. IF un operador intenta registrar una excepción puntual para un cliente que ya tiene una excepción vigente en la misma fecha y ruta, THEN THE Calendario_de_Rutas SHALL rechazar la operación e indicar que ya existe una excepción para esa combinación.

### Requerimiento 2: Cálculo de Prioridad por Fecha de Despacho y Día de Ruta (Regla 1)

**User Story:** Como responsable del OMS, quiero que el sistema calcule automáticamente cuándo debe alistarse cada pedido según la fecha de despacho y el día de salida de su ruta, para evitar tanto el alistamiento prematuro como la pérdida de la ruta.

#### Criterios de Aceptación

1. WHEN un pedido ingresa al OMS, THE Motor_de_Reglas SHALL identificar la ruta del pedido a través del cliente asociado y consultar el próximo día de salida de esa ruta en el Calendario_de_Rutas del país correspondiente al pedido, seleccionando la primera fecha de salida futura que permita al menos 1 día calendario de antelación para alistamiento.
2. WHEN el Motor_de_Reglas calcula el ready_to_prep_date, THE Motor_de_Reglas SHALL asignar como fecha de alistamiento 1 día calendario antes de la fecha de salida seleccionada de la ruta del pedido.
3. WHEN un pedido tiene ready_to_prep_date igual al día actual, THE Motor_de_Reglas SHALL asignar un priority_score mayor que los pedidos cuyo ready_to_prep_date es posterior.
4. WHEN dos pedidos tienen el mismo ready_to_prep_date, THE Motor_de_Reglas SHALL ordenarlos por la hora de ingreso al sistema (FIFO como criterio de desempate).
5. IF un pedido tiene una fecha de despacho que ya pasó sin ser alistado, THEN THE Motor_de_Reglas SHALL asignarle el priority_tier más alto (crítico) y generar una alerta en el Panel_OMS.
6. IF la ruta de un pedido no tiene días de salida registrados en el Calendario_de_Rutas, THEN THE Motor_de_Reglas SHALL marcar el pedido como "sin ruta configurada" y generar una alerta en el Panel_OMS para revisión manual.
7. IF un pedido ingresa al OMS y su ready_to_prep_date calculado es igual o anterior al día actual, THEN THE Motor_de_Reglas SHALL asignarle el priority_tier "crítico" inmediatamente y procesarlo con la misma urgencia que los pedidos vencidos del criterio 5.
8. WHEN el Calendario_de_Rutas es actualizado (cambio de días de salida o nueva excepción), THE Motor_de_Reglas SHALL recalcular el ready_to_prep_date y el priority_score de todos los pedidos pendientes asociados a la ruta modificada dentro de los 60 segundos siguientes a la actualización.

### Requerimiento 3: Cola de Priorización Operativa

**User Story:** Como operador de torre de control, quiero visualizar los pedidos pendientes ordenados por prioridad calculada y poder intervenir manualmente cuando sea necesario, para gestionar la operación diaria de alistamiento.

#### Criterios de Aceptación

1. THE Cola_de_Priorización SHALL mostrar los pedidos pendientes de alistamiento ordenados por priority_score de mayor a menor, presentando un máximo de 50 pedidos por página con controles de paginación.
2. THE Cola_de_Priorización SHALL mostrar para cada pedido: el identificador del pedido, el cliente, la ruta, el priority_tier, el priority_score, el ready_to_prep_date y el estado actual.
3. WHEN un operador aplica uno o más filtros por cliente, país, ruta o rango de ready_to_prep_date, THE Cola_de_Priorización SHALL mostrar solo los pedidos que cumplan todos los criterios seleccionados simultáneamente (lógica AND).
4. WHEN un operador autorizado ejecuta un Override_Manual sobre un pedido, THE Cola_de_Priorización SHALL solicitar el nuevo priority_tier a asignar y un motivo obligatorio de al menos 10 caracteres antes de aplicar el cambio de prioridad.
5. WHEN un Override_Manual se aplica exitosamente, THE Cola_de_Priorización SHALL recalcular el priority_score del pedido según el nuevo priority_tier asignado, actualizar su posición en la cola y registrar el cambio en la Auditoría_de_Priorización.
6. WHEN un operador selecciona un pedido de la cola, THE Cola_de_Priorización SHALL mostrar un panel lateral sin abandonar la vista de cola, incluyendo: los campos de la vista de cola, la fecha de ingreso al sistema, el historial de cambios de prioridad del pedido y el detalle de las reglas que contribuyeron al priority_score actual.
7. IF un operador sin permisos de override intenta modificar la prioridad de un pedido, THEN THE Cola_de_Priorización SHALL denegar la acción e informar que no tiene permisos suficientes.
8. WHEN la prioridad de uno o más pedidos cambia por recálculo automático o por Override_Manual de otro operador, THE Cola_de_Priorización SHALL actualizar el orden de la cola en un máximo de 5 segundos sin requerir recarga manual de la página.

### Requerimiento 4: Aprobación Humana de la Propuesta de Priorización

**User Story:** Como jefe de almacén, quiero revisar y aprobar la propuesta de priorización del OMS antes de que se inicie el alistamiento, para asegurar que la operación diaria tiene sentido desde el punto de vista práctico.

#### Criterios de Aceptación

1. WHEN el Motor_de_Reglas completa el cálculo de prioridades para un lote de pedidos, THE OMS SHALL presentar la propuesta a los operadores autorizados como "pendiente de aprobación", mostrando para cada pedido: identificador del pedido, cliente, ruta, priority_tier, priority_score y ready_to_prep_date, ordenados por priority_score de mayor a menor.
2. WHILE la propuesta de priorización está en estado "pendiente de aprobación", THE OMS SHALL impedir que esos pedidos pasen al estado de alistamiento y rechazar cualquier intento de transición de estado sobre dichos pedidos.
3. WHEN un operador autorizado aprueba la propuesta, THE OMS SHALL cambiar el estado de todos los pedidos incluidos en la propuesta a "listo para alistar" y registrar el evento en la Auditoría_de_Priorización con el identificador del operador y el timestamp.
4. WHEN un operador autorizado rechaza la propuesta, THE OMS SHALL mantener los pedidos en estado "pendiente", registrar el rechazo en la Auditoría_de_Priorización, y habilitar la ejecución de Override_Manual sobre los pedidos del lote rechazado; WHEN el operador confirma que los ajustes están completos, THE OMS SHALL generar una nueva propuesta con las prioridades actualizadas para su aprobación.
5. IF han transcurrido más de 120 minutos desde que una propuesta se generó sin recibir aprobación ni rechazo, THEN THE Panel_OMS SHALL generar una alerta visible de "propuesta sin revisar" dirigida a todos los operadores con permiso de aprobación del país correspondiente.
6. IF un operador autorizado intenta aprobar o rechazar una propuesta que ya fue procesada por otro operador, THEN THE OMS SHALL denegar la acción e informar que la propuesta ya fue resuelta, indicando el operador que la procesó y el timestamp de la acción.
7. THE OMS SHALL permitir la aprobación únicamente sobre la propuesta completa; no se permite aprobar pedidos individuales dentro de una propuesta (la aprobación o rechazo aplica al lote completo).
8. IF un operador autorizado rechaza la propuesta más de 3 veces consecutivas para el mismo lote, THEN THE OMS SHALL escalar la situación generando una alerta de "bloqueo de aprobación" en el Panel_OMS dirigida al nivel de administración.

### Requerimiento 5: Panel OMS (Dashboard de Salud del Motor)

**User Story:** Como responsable del OMS, quiero un dashboard que muestre la salud del motor de priorización y los indicadores operativos clave, para detectar anomalías a tiempo.

#### Criterios de Aceptación

1. THE Panel_OMS SHALL mostrar los siguientes KPIs: cantidad de pedidos pendientes por priority_tier, cantidad de pedidos con ready_to_prep_date vencido, porcentaje de overrides manuales vs. priorizaciones automáticas en las últimas 24 horas, y cantidad de pedidos sin ruta configurada.
2. THE Panel_OMS SHALL mostrar una tabla de alertas activas ordenadas por severidad (crítica primero) y, dentro de la misma severidad, por timestamp descendente (más reciente primero), mostrando para cada alerta: tipo de alerta, pedido afectado, timestamp y severidad.
3. WHEN un KPI supera un umbral configurable, THE Panel_OMS SHALL resaltar visualmente el indicador aplicando el badge de estado correspondiente (danger para crítico, warning para atención) según los estados definidos en el design system.
4. THE Panel_OMS SHALL permitir filtrar los KPIs y alertas por país (Costa Rica o Venezuela), mostrando por defecto los datos del país asociado al usuario en sesión.
5. WHEN un operador selecciona una alerta de la tabla, THE Panel_OMS SHALL navegar al pedido correspondiente en la Cola_de_Priorización, aplicando automáticamente el filtro necesario para ubicar ese pedido.
6. THE Panel_OMS SHALL actualizar los KPIs y la tabla de alertas automáticamente cada 60 segundos sin requerir recarga manual de la página.
7. IF el Panel_OMS no puede obtener datos actualizados del Motor_de_Reglas o de la Cola_de_Priorización, THEN THE Panel_OMS SHALL mostrar los últimos datos disponibles con una indicación visible del timestamp de la última actualización exitosa y una alerta de conexión.
8. WHEN una alerta se resuelve (el pedido asociado deja de cumplir la condición que la generó), THE Panel_OMS SHALL remover la alerta de la tabla de alertas activas.

### Requerimiento 6: Motor de Reglas Configurable (CRUD de Reglas)

**User Story:** Como administrador del OMS, quiero poder crear, activar y desactivar reglas de priorización sin modificar código, para adaptar el comportamiento del motor a las necesidades cambiantes del negocio.

#### Criterios de Aceptación

1. THE Motor_de_Reglas SHALL permitir crear reglas definiendo: nombre (entre 1 y 100 caracteres), condición compuesta por campo del pedido, operador de comparación (igual, diferente, mayor que, menor que, mayor o igual, menor o igual, contiene) y valor esperado, peso numérico (entero entre 1 y 1000) y estado inicial (activa o inactiva).
2. WHEN un administrador activa una regla, THE Motor_de_Reglas SHALL incluirla en el cálculo de priority_score para todos los pedidos nuevos que ingresen al sistema.
3. WHEN un administrador desactiva una regla, THE Motor_de_Reglas SHALL excluirla del cálculo de priority_score sin eliminarla del sistema.
4. THE Motor_de_Reglas SHALL evaluar todas las reglas activas en el orden definido por su peso numérico (mayor peso se evalúa primero).
5. WHEN múltiples reglas activas aplican al mismo pedido, THE Motor_de_Reglas SHALL calcular el priority_score como la suma de los pesos de todas las reglas cuya condición se cumple para ese pedido.
6. IF un administrador intenta activar una regla cuya condición referencia un campo inexistente en la estructura del pedido, THEN THE Motor_de_Reglas SHALL rechazar la activación e indicar el campo inválido.
7. THE Motor_de_Reglas SHALL permitir agrupar reglas en perfiles reutilizables asociables por país o por cliente, con un máximo de 50 reglas por perfil.
8. IF ninguna regla activa aplica a un pedido, THEN THE Motor_de_Reglas SHALL asignarle un priority_score de 0 y un priority_tier de nivel más bajo (baja).

### Requerimiento 7: Simulador de Reglas (Vista Previa de Cambios)

**User Story:** Como administrador del OMS, quiero previsualizar cómo un cambio en las reglas reordenaría la cola actual antes de aplicarlo, para reducir el riesgo de errores en producción.

#### Criterios de Aceptación

1. WHEN un administrador selecciona una o más reglas para simular, THE Simulador_de_Reglas SHALL recalcular el priority_score de todos los pedidos pendientes (hasta un máximo de 10,000 pedidos) usando las reglas seleccionadas sin modificar los datos de producción, y SHALL completar el cálculo en un máximo de 30 segundos.
2. WHEN la simulación completa el recálculo, THE Simulador_de_Reglas SHALL mostrar una vista de comparación en dos columnas: cola actual (con reglas vigentes) a la izquierda y cola simulada (con reglas propuestas) a la derecha, mostrando para cada pedido: identificador del pedido, cliente, priority_tier actual, priority_tier simulado, priority_score actual y priority_score simulado.
3. WHEN la simulación completa el recálculo, THE Simulador_de_Reglas SHALL indicar visualmente con un marcador diferenciado los pedidos cuya posición en el ranking cambió en 1 o más posiciones o cuyo priority_tier cambió entre la cola actual y la simulada.
4. WHEN un administrador confirma los resultados de la simulación, THE Simulador_de_Reglas SHALL ofrecer la opción de aplicar los cambios simulados como nuevas reglas activas, preservando los Override_Manual vigentes sobre pedidos individuales.
5. IF el resultado de la simulación mueve más del 30% de los pedidos de un priority_tier a otro, THEN THE Simulador_de_Reglas SHALL mostrar una advertencia de "impacto alto" que el administrador debe confirmar explícitamente antes de que el sistema permita la aplicación de las reglas.
6. IF la simulación no puede completarse debido a un error de cálculo o timeout (excede 30 segundos), THEN THE Simulador_de_Reglas SHALL cancelar la operación, descartar los resultados parciales y mostrar un mensaje de error indicando la causa de la falla sin alterar datos de producción.
7. THE Simulador_de_Reglas SHALL incluir en la vista de resultados un resumen con: número total de pedidos afectados, cantidad de pedidos que cambian de priority_tier y porcentaje de pedidos que cambian de posición respecto al total simulado.

### Requerimiento 8: Auditoría de Priorización

**User Story:** Como responsable de gobernanza, quiero un registro completo e inmutable de todos los cambios de prioridad que ocurren en el sistema, para trazabilidad y análisis posterior.

#### Criterios de Aceptación

1. WHEN el Motor_de_Reglas calcula o recalcula la prioridad de un pedido, THE Auditoría_de_Priorización SHALL registrar: identificador del pedido, país del pedido, priority_tier anterior (o "sin asignar" si es el cálculo inicial), priority_tier nuevo, priority_score anterior (o nulo si es el cálculo inicial), priority_score nuevo, tipo de cambio (automático), regla que lo causó y timestamp.
2. WHEN un operador ejecuta un Override_Manual, THE Auditoría_de_Priorización SHALL registrar: identificador del pedido, país del pedido, priority_tier anterior, priority_tier nuevo, priority_score anterior, priority_score nuevo, tipo de cambio (manual), usuario que lo ejecutó, motivo ingresado y timestamp.
3. WHEN un operador aprueba o rechaza una propuesta de priorización, THE Auditoría_de_Priorización SHALL registrar: identificadores de pedidos afectados, acción (aprobación/rechazo), usuario, país y timestamp.
4. THE Auditoría_de_Priorización SHALL permitir filtrar registros por pedido, usuario, tipo de cambio, rango de fechas y país, y SHALL retornar los resultados en páginas de máximo 50 registros por consulta con posibilidad de navegar a páginas siguientes.
5. THE Auditoría_de_Priorización SHALL ser de solo lectura para todos los usuarios del sistema (los registros no se modifican ni eliminan).
6. THE Auditoría_de_Priorización SHALL retener los registros de auditoría por un mínimo de 12 meses desde su fecha de creación, durante los cuales estarán disponibles para consulta.

### Requerimiento 9: Inserción de Pedidos Priorizados al Lago de Datos

**User Story:** Como sistema TMS, quiero recibir del OMS los pedidos ya con su prioridad calculada en el lago de datos, para que los módulos downstream (Pedidos, Planificación, Tracking) operen con información de prioridad confiable.

#### Criterios de Aceptación

1. WHEN un pedido alcanza el estado "listo para alistar" (aprobación humana confirmada), THE OMS SHALL insertar el pedido en el Lago_de_Datos en un máximo de 5 segundos con los campos: identificador del pedido, priority_score, priority_tier, ready_to_prep_date, identificador de origen en el WMS y timestamp de inserción.
2. THE OMS SHALL mantener la integridad referencial entre el pedido insertado en el Lago_de_Datos y su registro de origen en el WMS mediante el identificador de origen del WMS como campo de referencia obligatorio y no nulo.
3. IF la conexión con el Lago_de_Datos no está disponible al momento de la inserción, THEN THE OMS SHALL reintentar la operación con backoff exponencial (intervalo base de 2 segundos, máximo 3 intentos, tiempo máximo total de 30 segundos) y generar una alerta en el Panel_OMS tras agotar los 3 intentos.
4. IF todos los reintentos de inserción o actualización al Lago_de_Datos se agotan sin éxito, THEN THE OMS SHALL mantener el pedido en un estado "pendiente de sincronización", registrar el fallo en la Auditoría_de_Priorización y permitir el reintento manual o automático en el siguiente ciclo de sincronización.
5. WHEN un pedido que ya fue insertado en el Lago_de_Datos recibe un Override_Manual posterior, THE OMS SHALL actualizar en el Lago_de_Datos los campos priority_score, priority_tier y timestamp de actualización del registro correspondiente en un máximo de 5 segundos.
6. IF el registro de origen en el WMS no existe al momento de la inserción, THEN THE OMS SHALL rechazar la inserción del pedido al Lago_de_Datos, marcar el pedido como "referencia inválida" y generar una alerta en el Panel_OMS.

### Requerimiento 10: Soporte Multi-País

**User Story:** Como administrador del sistema, quiero que el OMS opere de forma independiente por país (Costa Rica y Venezuela), para respetar las diferencias operativas de cada operación sin interferencia cruzada.

#### Criterios de Aceptación

1. THE OMS SHALL asociar cada pedido, ruta, regla y perfil a un país específico (Costa Rica o Venezuela) como campo obligatorio.
2. WHEN el Motor_de_Reglas calcula la prioridad de un pedido, THE Motor_de_Reglas SHALL evaluar únicamente las reglas activas asociadas al país del pedido.
3. WHEN un operador accede a la Cola_de_Priorización, THE Cola_de_Priorización SHALL requerir la selección de un país antes de mostrar pedidos, y SHALL mostrar y permitir operar únicamente sobre los pedidos del país seleccionado sin incluir pedidos de otros países en la misma vista.
4. WHEN un administrador configura un perfil de reglas, THE Motor_de_Reglas SHALL permitir asociarlo a uno o más países, de modo que activar o desactivar un perfil en un país no altere el estado de ese mismo perfil en otro país.
5. THE Calendario_de_Rutas SHALL mantener calendarios de salida independientes por país, permitiendo que la misma ruta lógica tenga días de salida distintos en cada país.
6. IF un pedido ingresa al OMS sin un país asociado, THEN THE OMS SHALL rechazar el ingreso del pedido a la cola de priorización, registrar el evento como alerta en el Panel_OMS y marcar el pedido como "país no identificado" para revisión manual.

### Requerimiento 11: Seguridad y Control de Acceso

**User Story:** Como responsable de seguridad, quiero que las acciones sensibles del OMS estén protegidas por permisos granulares, para que solo los usuarios autorizados puedan modificar prioridades y configurar reglas.

#### Criterios de Aceptación

1. THE OMS SHALL diferenciar al menos tres niveles de acceso: visualización (ver Cola_de_Priorización y Panel_OMS en modo solo lectura), operación (ejecutar Override_Manual, aprobar/rechazar propuestas de priorización y consultar Auditoría_de_Priorización) y administración (CRUD de reglas, perfiles y Calendario_de_Rutas, además de todas las acciones de operación y visualización).
2. IF un usuario intenta ejecutar una acción para la cual no tiene permiso asignado, THEN THE OMS SHALL denegar la operación sin ejecutar ningún cambio de estado y mostrar un mensaje indicando el permiso requerido para completar esa acción.
3. THE OMS SHALL delegar la autenticación y la gestión de tokens al sistema de RLS/seguridad transversal del TMS, y resolver la autorización de cada acción validando los permisos del usuario contenidos en el token recibido contra el nivel de acceso requerido por la acción solicitada.
4. WHEN un usuario ejecuta cualquier acción de escritura (Override_Manual, aprobación o rechazo de propuesta, creación/actualización/desactivación de regla o perfil, modificación de Calendario_de_Rutas), THE OMS SHALL incluir el identificador del usuario en el registro de Auditoría_de_Priorización correspondiente.
5. IF el token de sesión del usuario es inválido o ha expirado al momento de ejecutar una acción, THEN THE OMS SHALL rechazar la operación sin aplicar cambios y redirigir al usuario al flujo de autenticación del sistema de RLS/seguridad transversal del TMS.
6. THE OMS SHALL permitir restringir los permisos de un usuario a un país específico (Costa Rica o Venezuela), de modo que un operador o administrador con acceso limitado a un país no pueda ejecutar acciones sobre pedidos, reglas ni calendarios del otro país.
