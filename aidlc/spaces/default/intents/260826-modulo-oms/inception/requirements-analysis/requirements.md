# Requerimientos — Módulo OMS (Order Management System)

> Intent: `260826-modulo-oms`. Etapa: Requirements Analysis (Inception).
> Proyecto brownfield `sto_tms_olo`. Idioma: español.
>
> Este documento **corrige y reemplaza** la matriz previa generada con Kiro
> (`documents/kiro-oms-requirements.md`). La corrección estructural principal:
> **se elimina el requerimiento de aprobación humana** de la propuesta de
> priorización. El cálculo de prioridad del OMS es **100 % automático** y **no
> existe ningún paso de aprobación** (de Jefe de Almacén ni de ningún rol) antes
> del alistamiento — así lo fija la Adenda del 2026-08-26 de
> `documents/2026-08-26-reunion-oms-roles.md`, que **supera** a
> `CONTEXTO_PROYECTO_TMS.md` §2.4 y `PLAN_MODULO_OMS.md` §7.0.

## Análisis de intención

El objetivo de negocio es **automatizar la priorización de alistamiento de
pedidos** que hoy realizan manualmente 3–4 personas de Torre de Control en Costa
Rica. El OMS es un **sistema satélite** que se posiciona **entre el WMS/Torre de
Control y el lago de datos** del TMS (según `architecture.md` y
`business-overview.md` del codekb): toma el pedido y el viaje generados por el
WMS, calcula **cuándo** debe alistarse cada pedido y **con qué prioridad**
aplicando reglas de negocio configurables (no FIFO), e inserta el pedido en el
lago de datos ya priorizado.

Lo que el OMS **busca lograr** (metas, no features):

- Evitar el **alistamiento prematuro** (que satura el muelle de despacho) y el
  **alistamiento tardío** (que pierde el viaje de la ruta).
- Sustituir el criterio manual disperso por un **motor de reglas** auditable y
  configurable sin tocar código.
- Operar de forma **independiente por país** (Costa Rica y Venezuela), que
  tienen calendarios de ruta distintos.
- Mantener el flujo **automático de extremo a extremo**, con intervención humana
  reservada exclusivamente a casos extraordinarios (alterar la prioridad de un
  pedido puntual).

**Alcance del OMS** (de `business-overview.md` → "El OMS: reposicionamiento y
alcance vigente"): decidir cuándo mandar a alistar un pedido y con qué
prioridad. **Fuera de alcance**: asignación de ruta (deriva de la relación
cliente↔ruta), asignación de transportista/vehículo/conductor y secuencia de
paradas (módulo Planificación), generación de la guía de despacho (EPRAC),
inventario/disponibilidad, y tarifas/liquidación.

### Actores (los 4 roles del OMS, cerrados en la Adenda del 2026-08-26)

| Rol | Responsabilidad en el OMS |
|---|---|
| **Operador de Despacho** | Mantiene el calendario de rutas y días de despacho (fuente de la Regla 1). |
| **Administrador de Módulo** | Configura las reglas del motor y los perfiles; superusuario del módulo (no del TMS completo). |
| **Jefe de Almacén** | Visibilidad y reportería del módulo, acceso a la planificación. **No bloquea ni aprueba** el flujo. |
| **Responsable del OMS** | Monitorea el motor automatizado; interviene **solo** para alterar la prioridad de un pedido puntual. |

> **Corrección aplicada**: el rol "Operador" del documento de Kiro (definido
> como quien "aprueba la propuesta de priorización") queda redefinido. Ya no
> existe aprobación; las acciones operativas se reparten entre "Responsable del
> OMS" (override puntual) y "Administrador de Módulo" (configuración).

## Glosario

- **OMS**: sistema satélite que calcula y asigna prioridades a los pedidos
  antes de su ingreso al lago de datos del TMS.
- **Motor de Reglas**: componente que evalúa condiciones de negocio
  configurables para calcular el `priority_score` y el `priority_tier` de cada
  pedido, de forma automática.
- **Cola de Priorización**: vista operativa de los pedidos pendientes ordenados
  por prioridad calculada, con capacidad de override manual por pedido.
- **Panel OMS**: dashboard de salud del motor con los KPIs operativos.
- **Calendario de Rutas**: mantenimiento de la relación ruta ↔ día(s) de salida
  ↔ excepciones por cliente. Fuente de verdad de la Regla 1.
- **Simulador de Reglas**: herramienta para previsualizar el efecto de un cambio
  de reglas sin aplicarlo en producción.
- **Auditoría de Priorización**: registro histórico inmutable de cada cambio de
  prioridad (automático o manual).
- **priority_score**: valor numérico que determina la posición de un pedido en
  la cola.
- **priority_tier**: nivel categórico de prioridad de un pedido. Los nombres
  "crítica / alta / media / baja" son **ilustrativos**: hasta cerrar OQ-1 solo
  es normativo el **ordenamiento relativo** (mayor tier = mayor urgencia), no el
  número exacto de niveles ni sus etiquetas.
- **ready_to_prep_date**: fecha calculada en la que un pedido debe enviarse a
  alistar, derivada del calendario de su ruta.
- **Override Manual**: acción por la que el Responsable del OMS altera la
  prioridad calculada de un pedido puntual, con motivo obligatorio.
- **WMS**: Warehouse Management System — sistema externo que genera pedidos y
  viajes.
- **Lago de Datos**: repositorio de datos del TMS donde el OMS inserta los
  pedidos ya priorizados.

## Requerimientos funcionales

### FR1 — Mantenimiento de Calendario de Rutas y Días de Despacho

Como **Operador de Despacho**, quiero mantener un catálogo centralizado de rutas
con sus días de salida y excepciones, para que el Motor de Reglas tenga una
fuente de verdad fiable sobre cuándo despacha cada ruta.

- **FR1.1** El Calendario de Rutas permite crear, leer, actualizar y desactivar
  registros de ruta con sus días de salida semanales asociados.
- **FR1.2** Al crear o actualizar una ruta, se almacena el identificador de
  ruta, al menos un día de salida (lunes–domingo) y el país; la operación se
  rechaza si no se selecciona al menos un día de salida.
- **FR1.3** Al registrar una excepción puntual, se almacena la fecha específica
  (≥ día actual), el cliente afectado y el motivo (obligatorio, máx. 500
  caracteres).
- **FR1.4** Mientras una excepción puntual esté vigente para un cliente (fecha ≥
  día actual), el Motor de Reglas usa la fecha de excepción en lugar del día de
  salida regular para calcular el `ready_to_prep_date` de los pedidos de ese
  cliente.
- **FR1.5** Si se intenta crear una ruta con un identificador ya existente para
  el mismo país, la operación se rechaza indicando que la ruta ya está
  registrada.
- **FR1.6** El Calendario de Rutas soporta calendarios independientes por país
  (Costa Rica y Venezuela), con días de salida distintos para la misma ruta
  lógica.
- **FR1.7** Al desactivar una ruta con excepciones futuras registradas, se
  desactivan también esas excepciones y se genera una alerta en el Panel OMS con
  la cantidad afectada.
- **FR1.8** Si se intenta registrar una excepción para un cliente que ya tiene
  una excepción vigente en la misma fecha y ruta, la operación se rechaza
  indicando el conflicto.

*Acceptance (BDD):*
- Given una ruta sin días de salida, When el Operador de Despacho intenta
  guardarla, Then el sistema rechaza el guardado y exige al menos un día.
- Given una excepción vigente cliente+fecha+ruta, When se registra otra igual,
  Then el sistema la rechaza indicando duplicado.

### FR2 — Cálculo de prioridad por fecha de despacho y día de ruta (Regla 1)

Como **Responsable del OMS**, quiero que el sistema calcule automáticamente
cuándo debe alistarse cada pedido según la fecha de despacho y el día de salida
de su ruta, para evitar tanto el alistamiento prematuro como la pérdida de la
ruta. Esta es la **primera regla a construir** (`BR1.1` en `business-overview.md`).

- **FR2.1** Al ingresar un pedido, el Motor de Reglas identifica su ruta a
  través del cliente asociado y consulta el próximo día de salida de esa ruta en
  el Calendario de Rutas del país correspondiente, eligiendo la primera fecha de
  salida futura que permita ≥ 1 día calendario de antelación para alistamiento.
- **FR2.2** El `ready_to_prep_date` se asigna 1 día calendario antes de la fecha
  de salida seleccionada.
- **FR2.3** Un pedido con `ready_to_prep_date` igual al día actual recibe un
  `priority_score` mayor que los pedidos con `ready_to_prep_date` posterior.
- **FR2.4** Ante igual `ready_to_prep_date`, el desempate es por hora de ingreso
  al sistema (FIFO como criterio de desempate).
- **FR2.5** Un pedido con fecha de despacho ya vencida sin alistar recibe el
  `priority_tier` más alto (crítico) y genera una alerta en el Panel OMS.
- **FR2.6** Si la ruta de un pedido no tiene días de salida registrados, el
  pedido se marca "sin ruta configurada" y se genera una alerta en el Panel OMS
  para revisión manual.
- **FR2.7** Si el `ready_to_prep_date` calculado es igual o anterior al día
  actual, el pedido recibe `priority_tier` crítico inmediatamente, con la misma
  urgencia que los vencidos de FR2.5.
- **FR2.8** Al actualizarse el Calendario de Rutas (cambio de días o nueva
  excepción), el Motor de Reglas recalcula `ready_to_prep_date` y
  `priority_score` de todos los pedidos pendientes de la ruta modificada dentro
  de los 60 s siguientes (ver NFR1).

*Acceptance (BDD) — ejemplo canónico Caracas/Valencia (`business-overview.md`):*
- Given un pedido a Caracas cuya ruta sale el jueves y que ingresa el lunes,
  When el Motor de Reglas lo evalúa el lunes, Then su `ready_to_prep_date` es el
  miércoles (salida − 1 día) y **no** se alista de inmediato.
- Given un pedido a Valencia cuya ruta sale el martes y que ingresa el mismo
  lunes, When el Motor de Reglas evalúa ambos pedidos, Then el pedido de
  Valencia recibe mayor `priority_score` que el de Caracas y se alista primero.
- Given un pedido cuya fecha de despacho ya pasó sin alistar, When el Motor de
  Reglas lo evalúa, Then recibe `priority_tier` crítico y genera una alerta en
  el Panel OMS (FR2.5).
- Given un pedido cuya ruta no tiene días de salida registrados, When el Motor
  de Reglas lo evalúa, Then lo marca "sin ruta configurada" y alerta para
  revisión manual (FR2.6).

### FR3 — Cola de Priorización operativa y override manual

Como **Responsable del OMS**, quiero visualizar los pedidos pendientes ordenados
por prioridad calculada y poder alterar la prioridad de un pedido puntual cuando
sea necesario, para gestionar la operación diaria de alistamiento **sin detener
el flujo automático**.

- **FR3.1** La Cola muestra los pedidos pendientes ordenados por
  `priority_score` descendente, con un máximo de 50 pedidos por página y
  controles de paginación.
- **FR3.2** Para cada pedido se muestra: identificador, cliente, ruta,
  `priority_tier`, `priority_score`, `ready_to_prep_date` y estado actual.
- **FR3.3** Al aplicar filtros por cliente, país, ruta o rango de
  `ready_to_prep_date`, la Cola muestra solo los pedidos que cumplen todos los
  criterios simultáneamente (lógica AND).
- **FR3.4** Al ejecutar un Override Manual sobre un pedido, el sistema exige el
  nuevo `priority_tier` y un motivo obligatorio de al menos 10 caracteres antes
  de aplicar el cambio.
- **FR3.5** Aplicado el override, el sistema recalcula el `priority_score` del
  pedido según el nuevo tier, actualiza su posición en la Cola y registra el
  cambio en la Auditoría de Priorización.
- **FR3.6** Al seleccionar un pedido, la Cola muestra un panel lateral (sin
  abandonar la vista) con los campos de la cola, la fecha de ingreso, el
  historial de cambios de prioridad y el detalle de las reglas que contribuyeron
  al `priority_score` actual.
- **FR3.7** Si un usuario sin permiso de override intenta alterar la prioridad,
  la acción se deniega informando falta de permisos (ver FR9).
- **FR3.8** Cuando la prioridad de uno o más pedidos cambia por recálculo
  automático o por override de otro usuario, la Cola actualiza el orden en ≤ 5 s
  sin recarga manual (ver NFR2).

> **Corrección aplicada**: el override es la **única** intervención humana sobre
> el cálculo y opera **por pedido individual**. No existe aprobación ni rechazo
> de lote (el antiguo REQ 4 de Kiro queda eliminado).

### FR4 — Panel OMS (dashboard de salud del motor)

Como **Responsable del OMS** (y con visibilidad para el **Jefe de Almacén**),
quiero un dashboard con la salud del motor y los indicadores clave, para
detectar anomalías a tiempo.

- **FR4.1** El Panel muestra: pedidos pendientes por `priority_tier`, pedidos
  con `ready_to_prep_date` vencido, % de overrides manuales vs. priorizaciones
  automáticas en las últimas 24 h, y pedidos sin ruta configurada.
- **FR4.2** Muestra una tabla de alertas activas ordenadas por severidad
  (crítica primero) y, dentro de la misma severidad, por timestamp descendente;
  para cada alerta: tipo, pedido afectado, timestamp y severidad.
- **FR4.3** Cuando un KPI supera un umbral configurable, el indicador se resalta
  con el badge de estado correspondiente (`danger`/`warning`) del design system
  existente (`architecture.md`, `code-structure.md`: badges teal/slate + 5
  estados).
- **FR4.4** Permite filtrar KPIs y alertas por país (CR/VE), mostrando por
  defecto los del país del usuario en sesión (el país del usuario proviene del
  token de la capa RLS transversal, ver FR10.3 y FR10.6).
- **FR4.5** Al seleccionar una alerta, navega al pedido en la Cola aplicando el
  filtro necesario para ubicarlo.
- **FR4.6** El Panel actualiza KPIs y alertas automáticamente cada 60 s sin
  recarga manual.
- **FR4.7** Si no puede obtener datos actualizados del motor o de la Cola,
  muestra los últimos datos disponibles con el timestamp de la última
  actualización exitosa y una alerta de conexión.
- **FR4.8** Cuando una alerta se resuelve (el pedido deja de cumplir la
  condición), se remueve de la tabla de alertas activas.

### FR5 — Motor de Reglas configurable (CRUD de reglas)

Como **Administrador de Módulo**, quiero crear, activar y desactivar reglas de
priorización sin modificar código, para adaptar el motor a las necesidades
cambiantes del negocio.

- **FR5.1** Permite crear reglas con: nombre (1–100 caracteres), condición
  (campo del pedido + operador de comparación [igual, distinto, mayor, menor,
  mayor-igual, menor-igual, contiene] + valor esperado), peso numérico (entero
  1–1000) y estado inicial (activa/inactiva).
- **FR5.2** Al activar una regla, se incluye en el cálculo del `priority_score`
  de todos los pedidos nuevos.
- **FR5.3** Al desactivar una regla, se excluye del cálculo sin eliminarla.
- **FR5.4** Las reglas activas se evalúan en el orden de su peso numérico (mayor
  peso primero).
- **FR5.5** Cuando varias reglas activas aplican al mismo pedido, el
  `priority_score` es la suma de los pesos de las reglas cuya condición se
  cumple.
- **FR5.6** Si se intenta activar una regla cuya condición referencia un campo
  inexistente en el pedido, la activación se rechaza indicando el campo inválido.
- **FR5.7** Permite agrupar reglas en perfiles reutilizables asociables por país
  o por cliente, con un máximo de 50 reglas por perfil.
- **FR5.8** Si ninguna regla activa aplica a un pedido, se le asigna
  `priority_score` 0 y el `priority_tier` más bajo.

### FR6 — Simulador de Reglas (vista previa de cambios)

Como **Administrador de Módulo**, quiero previsualizar cómo un cambio de reglas
reordenaría la cola actual antes de aplicarlo, para reducir el riesgo en
producción.

- **FR6.1** Al seleccionar reglas para simular, se recalcula el `priority_score`
  de todos los pedidos pendientes (hasta 10.000) con las reglas seleccionadas,
  sin tocar datos de producción, en ≤ 30 s (ver NFR4).
- **FR6.2** Muestra una comparación en dos columnas: cola actual (izquierda) vs.
  cola simulada (derecha), con identificador, cliente, tier actual/simulado y
  score actual/simulado por pedido.
- **FR6.3** Marca visualmente los pedidos cuya posición cambió ≥ 1 lugar o cuyo
  `priority_tier` cambió.
- **FR6.4** Al confirmar la simulación, ofrece aplicar los cambios como nuevas
  reglas activas, preservando los overrides manuales vigentes.
- **FR6.5** Si la simulación mueve > 30 % de los pedidos de un tier a otro,
  muestra una advertencia de "impacto alto" que el administrador debe confirmar
  explícitamente antes de aplicar.
- **FR6.6** Si la simulación falla o excede 30 s, cancela la operación, descarta
  resultados parciales y muestra la causa, sin alterar datos de producción.
- **FR6.7** Incluye un resumen: total de pedidos afectados, cuántos cambian de
  tier y % que cambia de posición sobre el total simulado.

### FR7 — Auditoría de Priorización

Como responsable de gobernanza, quiero un registro completo e inmutable de todos
los cambios de prioridad, para trazabilidad y análisis.

- **FR7.1** Al calcular o recalcular la prioridad de un pedido, se registra:
  identificador, país, tier anterior (o "sin asignar"), tier nuevo, score
  anterior (o nulo), score nuevo, tipo de cambio (automático), regla que lo
  causó y timestamp.
- **FR7.2** Al ejecutar un Override Manual, se registra: identificador, país,
  tier y score anterior/nuevo, tipo de cambio (manual), usuario, motivo y
  timestamp.
- **FR7.3** Permite filtrar por pedido, usuario, tipo de cambio, rango de fechas
  y país, retornando páginas de máx. 50 registros.
- **FR7.4** Es de solo lectura para todos los usuarios (no se modifican ni
  eliminan registros).
- **FR7.5** Retiene los registros un mínimo de 12 meses disponibles para
  consulta.

> **Corrección aplicada**: se elimina el antiguo AC que registraba
> "aprobación/rechazo de propuesta". Ya no hay evento de aprobación que auditar;
> la auditoría cubre cálculos automáticos y overrides manuales.

### FR8 — Inserción de pedidos priorizados al Lago de Datos

Como sistema TMS, quiero recibir del OMS los pedidos ya con su prioridad
calculada en el lago de datos, para que los módulos downstream (Pedidos,
Planificación, Tracking) operen con información de prioridad fiable.

- **FR8.1** En cuanto el Motor de Reglas calcula la prioridad de un pedido (o un
  Override Manual la altera), el OMS inserta/actualiza el pedido en el Lago de
  Datos en ≤ 5 s con: identificador, `priority_score`, `priority_tier`,
  `ready_to_prep_date`, identificador de origen en el WMS y timestamp. **No hay
  estado intermedio de aprobación.**
- **FR8.2** Mantiene la integridad referencial entre el pedido insertado y su
  origen en el WMS mediante el identificador de origen como campo obligatorio y
  no nulo.
- **FR8.3** Si el Lago de Datos no está disponible, reintenta con backoff
  exponencial (base 2 s, máx. 3 intentos, máx. 30 s totales) y genera una alerta
  en el Panel OMS tras agotar los intentos.
- **FR8.4** Si todos los reintentos fallan, mantiene el pedido "pendiente de
  sincronización", registra el fallo en Auditoría y permite reintento manual o
  automático en el siguiente ciclo.
- **FR8.5** Si un pedido ya insertado recibe un Override Manual posterior, el OMS
  actualiza `priority_score`, `priority_tier` y timestamp en el Lago de Datos en
  ≤ 5 s.
- **FR8.6** Si el registro de origen en el WMS no existe al insertar, rechaza la
  inserción, marca el pedido "referencia inválida" y genera una alerta en el
  Panel OMS.

> **Corrección aplicada**: el disparador de inserción pasó de "aprobación humana
> confirmada" (antiguo REQ 9 de Kiro) a "prioridad calculada por el motor",
> coherente con el flujo automático.

### FR9 — Multi-país (Costa Rica y Venezuela)

Como **Administrador de Módulo**, quiero que el OMS opere de forma independiente
por país, para respetar las diferencias operativas sin interferencia cruzada.

- **FR9.1** Cada pedido, ruta, regla y perfil se asocia a un país (CR o VE) como
  campo obligatorio.
- **FR9.2** El Motor de Reglas evalúa únicamente las reglas activas del país del
  pedido.
- **FR9.3** La Cola requiere seleccionar país antes de mostrar pedidos, y solo
  muestra/opera pedidos de ese país.
- **FR9.4** Un perfil de reglas puede asociarse a uno o más países; activar o
  desactivar un perfil en un país no altera su estado en otro.
- **FR9.5** El Calendario de Rutas mantiene calendarios de salida independientes
  por país para la misma ruta lógica.
- **FR9.6** Si un pedido ingresa sin país asociado, el OMS rechaza su ingreso a
  la cola, lo marca "país no identificado" y genera una alerta.

### FR10 — Seguridad y control de acceso

Como responsable de seguridad, quiero que las acciones sensibles del OMS estén
protegidas por permisos granulares, para que solo usuarios autorizados alteren
prioridades y configuren reglas.

- **FR10.1** El OMS diferencia al menos tres niveles de acceso: **visualización**
  (Cola y Panel en solo lectura), **operación** (Override Manual y consulta de
  Auditoría) y **administración** (CRUD de reglas, perfiles y Calendario de
  Rutas, además de operación y visualización). Mapeo orientativo rol↔nivel (el
  detalle de permisos por acción se cierra en el diseño de autorización):

  | Rol OMS | Nivel de acceso |
  |---|---|
  | Jefe de Almacén | visualización (reportería y planificación, sin escritura) |
  | Responsable del OMS | operación (Override Manual + consulta de Auditoría) |
  | Operador de Despacho | administración acotada al Calendario de Rutas (CRUD de FR1) |
  | Administrador de Módulo | administración plena (reglas, perfiles, calendario) |
- **FR10.2** Si un usuario intenta una acción para la que no tiene permiso, el
  OMS la deniega sin ejecutar cambios y muestra el permiso requerido.
- **FR10.3** El OMS delega autenticación y gestión de tokens a la capa
  RLS/seguridad transversal del TMS, y resuelve la autorización validando los
  permisos del token contra el nivel requerido por la acción.
- **FR10.4** En toda acción de escritura (override, CRUD de regla/perfil,
  modificación de Calendario de Rutas), el OMS incluye el identificador del
  usuario en el registro de Auditoría.
- **FR10.5** Si el token es inválido o expiró, el OMS rechaza la operación sin
  aplicar cambios y redirige al flujo de autenticación del TMS.
- **FR10.6** El OMS permite restringir los permisos de un usuario a un país (CR o
  VE), impidiendo acciones sobre pedidos, reglas o calendarios del otro país.

> **Corrección aplicada**: el nivel "operación" ya **no** incluye "aprobar/
> rechazar propuestas" (acción inexistente); se limita a override y consulta de
> auditoría.

## Requerimientos no funcionales

> Umbrales **provisionales**, adoptados como punto de partida; a validar con el
> volumen real por país (pendiente en `PLAN_MODULO_OMS.md` §7.2, ver OQ-5).

- **NFR1 — Recálculo tras cambio de calendario**: el recálculo de
  `ready_to_prep_date`/`priority_score` de los pedidos afectados se completa en
  ≤ 60 s desde la actualización del Calendario de Rutas (soporta FR2.8).
- **NFR2 — Refresco de la Cola**: los cambios de orden por recálculo o override
  se reflejan en la Cola en ≤ 5 s sin recarga manual (soporta FR3.8).
- **NFR3 — Latencia de inserción al lago**: la inserción/actualización de un
  pedido en el Lago de Datos se completa en ≤ 5 s (soporta FR8.1, FR8.5).
- **NFR4 — Rendimiento del simulador**: la simulación recalcula hasta 10.000
  pedidos en ≤ 30 s sin tocar producción (soporta FR6.1).
- **NFR5 — Refresco del Panel**: el Panel actualiza KPIs y alertas cada 60 s
  automáticamente (soporta FR4.6).
- **NFR6 — Resiliencia de sincronización**: la inserción al lago tolera
  indisponibilidad con backoff exponencial (base 2 s, máx. 3 intentos, ≤ 30 s
  totales) y degradación a "pendiente de sincronización" (soporta FR8.3, FR8.4).
- **NFR7 — Aislamiento por país**: ninguna operación de un país puede leer ni
  escribir datos del otro (soporta FR9, FR10.6).
- **NFR8 — Auditabilidad/retención**: los registros de auditoría son inmutables
  y se retienen ≥ 12 meses (soporta FR7.4, FR7.5).
- **NFR9 — Observabilidad operativa**: el estado de salud del motor
  (pedidos por tier, vencidos, sin ruta, % override) es observable en el Panel
  en todo momento (soporta FR4).
- **NFR10 — Consistencia de UI**: toda pantalla nueva del OMS se compone con el
  design system existente (Card/Button/Badge/Input/Select/StatCard, paleta
  teal/slate + 5 estados), sin introducir kits de UI nuevos
  (`code-structure.md`, `PLAN_MODULO_OMS.md` §4).

## Restricciones

- **C1 — Posicionamiento satélite**: el OMS opera antes del lago de datos, entre
  el WMS/Torre de Control y el TMS; el TMS no depende del OMS para funcionar
  (`business-overview.md`, `PLAN_MODULO_OMS.md` §1–§2).
- **C2 — Prototipo desechable**: el prototipo actual en `src/pages/oms/`
  (alimentado por `mockData.ts`) es explícitamente descartable
  (`PLAN_MODULO_OMS.md` §9); no es base de implementación productiva.
- **C3 — Identidad delegada**: el OMS **no** gestiona identidades ni
  autenticación propias; usa las de la capa RLS/seguridad transversal del TMS
  (decisión Q5=A).
- **C4 — Design system obligatorio**: no se introducen kits de UI nuevos ni
  colores fuera de la paleta existente (`Estandares_Desarrollo_AWS_Intelix.md`
  §11, `PLAN_MODULO_OMS.md` §4).
- **C5 — Multi-país obligatorio**: país es campo obligatorio y eje de
  aislamiento en pedidos, rutas, reglas y perfiles.
- **C6 — Divergencia de plataforma no resuelta**: el código corre sobre Supabase
  gestionado, la arquitectura objetivo es PostgreSQL propio y el estándar
  organizacional apunta a serverless AWS; la distancia no está planificada
  (`business-overview.md`). No se decide en este ciclo.

## Supuestos

- **A1** El calendario de rutas de Costa Rica existe y es accesible; el de
  Venezuela aún no (dependencia declarada en `PLAN_MODULO_OMS.md` §7.3). Se
  asume que la Regla 1 puede validarse con datos mock mientras tanto.
- **A2** El pedido llega al OMS "picking-ready" desde el WMS/EPRAC; el OMS no
  hace inventario ni disponibilidad.
- **A3** La relación cliente↔ruta ya existe y es fuente para identificar la ruta
  de un pedido (el OMS la usa, no la decide).
- **A4** Los umbrales de NFR son provisionales hasta conocer el volumen real por
  país.

## Fuera de alcance

- Aprobación humana de la propuesta de priorización (**eliminado**; el flujo es
  automático).
- Asignación de ruta, transportista, vehículo, conductor y secuencia de paradas
  (módulo Planificación).
- Generación de la guía de despacho (EPRAC).
- Inventario/disponibilidad de bodega y tarifas/liquidación.
- Regla 2 (prioridad por línea de pedido): confirmada como futura, sin detalle;
  no se especifica en este ciclo.
- Migración de plataforma (Supabase → PostgreSQL propio / AWS): no planificada
  aquí.

## Open Questions

Puntos reales pendientes que dependen de terceros o de sesiones posteriores; no
bloquean este ciclo de requerimientos pero deben cerrarse antes del diseño
detallado del motor:

- **OQ-1 — Niveles de prioridad**: número de `priority_tier` a homologar entre
  WMS, EPA/Cofersa (2 niveles) y Mayoreo (~8 informales). Pendiente con Antonio
  / "Toño" (`business-overview.md`, `PLAN_MODULO_OMS.md` §7.3).
- **OQ-2 — Tablas del lago y sistema de origen**: a qué tablas del lago de datos
  se conecta el OMS y de qué sistema exacto sale la data. Pendiente con Ana y el
  equipo de datos (`PLAN_MODULO_OMS.md` §7.4).
- **OQ-3 — Tercera regla**: se mencionaron "3 reglas" pero solo se detallaron 2;
  la tercera podría ser el override manual, marcado `[verificar]` en la fuente.
  Nota: si se confirma que esa 3ª "regla" es el override manual, **no hay cambio
  de alcance** — ya está cubierto por FR3 como intervención humana, no como
  regla del motor.
- **OQ-4 — Contrato de salida hacia Planificación**: si es un campo/estado en la
  tabla `orders` o una tabla/endpoint intermedio (`PLAN_MODULO_OMS.md` §7.4).
- **OQ-5 — Volumen esperado**: pedidos pendientes simultáneos por país por día;
  necesario para confirmar los umbrales de NFR y decidir paginación/
  virtualización (`PLAN_MODULO_OMS.md` §7.2).
- **OQ-6 — Recálculo en tiempo real vs. corridas programadas**: si la
  priorización se recalcula al entrar cada pedido o en corridas con hora de
  corte (`PLAN_MODULO_OMS.md` §7.2).

## Sources

- `aidlc/spaces/default/codekb/sto_tms_olo/business-overview.md` — dominio TMS,
  reposicionamiento y alcance del OMS, reglas de negocio, roles cerrados,
  automatización 100 % y documentación desactualizada.
- `aidlc/spaces/default/codekb/sto_tms_olo/architecture.md` — arquitectura del
  sistema, posicionamiento satélite del OMS, patrones y design system.
- `aidlc/spaces/default/codekb/sto_tms_olo/code-structure.md` — organización de
  `src/pages/oms/`, patrón de páginas y design system reutilizable (badges,
  Card/Button/Input).
- `documents/2026-08-26-reunion-oms-roles.md` (Adenda del 2026-08-26) — los 4
  roles cerrados, cálculo 100 % automático y ausencia de paso de aprobación.
  **Fuente vigente que supera** a los documentos desactualizados.
- `documents/kiro-oms-requirements.md` — matriz previa (11 requerimientos)
  tomada como base y **corregida** (eliminación del REQ de aprobación humana,
  reescritura de trigger de inserción, redefinición de roles).
- `PLAN_MODULO_OMS.md` §1–§9 — alcance, flujo de datos, submódulos, design
  system, arquitectura propuesta y preguntas abiertas.
- `CONTEXTO_PROYECTO_TMS.md` §2, §2.4, §4 — contexto del programa y roles del
  sistema (§2.4 desactualizada en el punto de aprobación, corregida por la
  Adenda).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements-analysis-questions.md`
  — decisiones de alcance de este ciclo (Q1–Q5 = A).
- `aidlc/spaces/default/memory/project.md` (`## Decided`, `## Corrections`) y
  `aidlc/spaces/default/memory/phases/inception.md` — reglas activas
  (automatización del OMS; requisitos testables y trazables).

## Assumptions & Open Questions

Ver las secciones **Supuestos** (A1–A4) y **Open Questions** (OQ-1 a OQ-6)
arriba. En síntesis, los puntos que quedan abiertos dependen de negocio/datos
(niveles de prioridad, tablas del lago, volumen, contrato hacia Planificación) y
no bloquean la aprobación de estos requerimientos; se resolverán antes del
diseño detallado del motor.

## Review

**Reviewer:** aidlc-product-lead-agent · **Clase:** advisory · **Iteración:** 1 (pase único) · **Veredicto:** READY

El revisor confirmó que el artefacto cumple el alcance acordado (Q1=A, 10 requerimientos), respeta íntegramente el hecho de negocio crítico (flujo 100 % automático, sin ningún paso de aprobación; override puntual como única intervención humana), sin residuos del antiguo REQ de aprobación, con NFR cuantificables y trazabilidad limpia. No hubo hallazgos bloqueantes ni contradicciones con hechos vigentes; los 5 hallazgos fueron Menores.

Resumen consolidado confirmado por el humano ("Looks correct") antes de fijar este artefacto.

Refinamientos aplicados tras la revisión advisory:
- Glosario `priority_tier`: se marcó que los nombres de nivel son ilustrativos y que solo el ordenamiento relativo es normativo hasta cerrar OQ-1.
- FR2: se añadió el escenario BDD canónico Caracas/Valencia (y los casos de vencido y sin ruta) para reforzar la testabilidad de la Regla 1.
- FR10.1: se añadió el mapeo orientativo rol OMS ↔ nivel de acceso.
- FR4.4: se enlazó "país del usuario en sesión" con el token RLS (FR10.3, FR10.6).
- OQ-3: se aclaró que confirmar override = 3ª regla no altera el alcance ya redactado.
