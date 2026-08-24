# Contexto del Proyecto — TMS OLO

> Documento generado a partir de transcripciones de reuniones de kickoff/planificación.
> Objetivo: servir como fuente única de contexto de negocio y organización del proyecto
> (complementa `Estandares_Desarrollo_AWS_Intelix.md`, que cubre los estándares técnicos/AWS).
> Puntos marcados **[verificar]** vienen de audio poco claro en la transcripción y conviene confirmarlos.

---

## 1. Resumen general

- **Nombre del proyecto:** TMS OLO (Transportation Management System de OLO). Nombre provisional anterior: "STO" / "Sistema de Transporte OLO". Código de proyecto interno (Intelix/Xtiming): **OC26007**, título formal **"Desarrollo para proyectos TMS"** (suite de módulos, no un desarrollo único).
- **Líder del proyecto:** **Jean Carlo** — lidera el desarrollo técnico, actúa como superusuario del sistema base, gestiona infraestructura (servidor/DB/agentes Claude) y reglas de negocio junto con cada dueño de módulo.
- **Objetivo:** aplicación web con múltiples módulos para gestionar toda la operación de transporte de OLO (Costa Rica, Venezuela y un tercer país **[verificar cuál]**), construida "a medida" tomando como referencia TMS estándar de la industria pero adaptado a cómo opera OLO.
- **Alcance actual:** originalmente ~11 módulos; en la práctica el alcance ha ido creciendo a medida que se detalla con el negocio (ver §2 — ya se identificaron 2-3 módulos adicionales no contemplados al inicio).
- Repo existente: `sto_tms_olo` (React/TypeScript). El código base y accesos los gestiona Jean Carlo. Habrá además un **repositorio centralizado de documentación** del proyecto (requerimientos, funcionalidades, agentes) accesible a todo el equipo.
- El proyecto se presenta también en la **reunión de portafolio de Intelix**, con el equipo completo (asisten al menos Jean Carlo y Andrey).

## 2. Módulos del sistema

| Módulo | Dueño / asignado | Estado y notas |
|---|---|---|
| **Catálogos** | Base transversal (todos dependen de esto) | Ya construidos como CRUD (países, rutas, transportistas, vehículos, choferes, clientes, puntos de entrega). Falta cargar data real y revisar que todos los "maestros" estén completos (acción pendiente, ver §9). |
| **Tracking** | Justin (mobile) + equipo web | Prioridad alta / parte del MVP. Sigue camiones que salen de los almacenes (Cliro en Costa Rica; San Diego y Micheleana en Venezuela). Versión mobile + versión web. Hoy en Venezuela lo cubre el sistema legado "Trade" (a reemplazar). Recibe como insumo el orden de entrega que genere el módulo de Planificación. |
| **Planificación de rutas / viajes** | **Jesús** | El más complejo. Ordena los pedidos ya asignados a una ruta/transportista/conductor/vehículo/fecha para la entrega más eficiente (menor distancia/combustible, mayor cumplimiento de tiempos). Ver detalle en §2.2. |
| **OMS (Order Management System)** *(no es un módulo del TMS — es un "satélite", ver §2.4)* | **Eduardo** | Nuevo, no existe todavía. Prioriza pedidos por reglas de negocio (no FIFO), actuando **antes** de que el pedido entre al lago de datos del TMS (entre el WMS/Torre de Control y el lago). Definido en Reunión 8 explícitamente como **"satélite"**: el TMS no depende de él para funcionar. "Mini-proyecto dentro del proyecto." Ver detalle en §2.4. |
| **Liquidación / Tarifas** | **Dylan** | Prioridad alta / parte del MVP junto con Tracking (son los módulos que hoy "dan guerra" en Venezuela vía sistemas legados). Ver detalle en §2.3. |
| **Devoluciones / Logística inversa** | Sin asignar | Nada construido. Tiene su propia estructura de tarifa (distinta a la de entrega). Hay que mapear bien el proceso de negocio primero. |
| **Guías de despacho** | Sin asignar | Debe integrarse 100% con el sistema externo **EPRAC**. Hoy la guía de despacho la genera EPRAC y consolida los pedidos de una ruta; a eso Planificación le agrega el orden óptimo de entrega. |
| **Pedidos** | Relacionado con OMS | Catálogo/listado de pedidos que llegan desde el WMS al lago de datos. **Aclarado en Reunión 8:** el OMS antecede a este módulo en el flujo — es quien inserta esos pedidos en el lago de datos ya con su prioridad calculada, no al revés. |
| **Mantenimiento de flota** *(nuevo, identificado en Reunión 4)* | Sin asignar | Solo aplica donde hay flota propia (Costa Rica). Control de mantenimiento y compras, ligado al kilometraje recorrido por unidad. |
| **Backhaul** *(nuevo, identificado en Reunión 4)* | Sin asignar | Negocio propio de OLO (utilidad propia) por aprovechar el viaje de regreso — distinto del cobro de logística inversa/devoluciones; hay que separar bien esa lógica. |
| **Contratos y documentos legales** | Sin asignar | Sección creada, a ampliar. |
| **Reportería** | Sin asignar | Reportes transversales a todos los módulos. |
| **Configuración** | Sin asignar | Base creada: gestión de usuarios/roles (incipiente) y preferencias (zona horaria, etc.). Ver roles en §4. |
| **RLS / Seguridad (transversal)** *(no es un módulo funcional, es una capa)* | **Andrey** | Roles, permisos, RLS, tokens JWT — aplica sobre todos los módulos, con distinto nivel de exigencia (p. ej. un liquidador necesita permisos más finos, hasta por botón, que un dashboard). |

> Nota explícita del equipo: es esperable seguir agregando 2-3 módulos más a medida que el negocio (el "responsable comercial"/gerente de sistemas del cliente) termina de precisar su intención — el equipo debe traducir esa intención en módulos y funciones concretas, no asumir que la lista de arriba es definitiva.

### 2.1 Catálogos — detalle y pendientes de data real

- **Países:** multi-país, ya con los 3 países que maneja OLO actualmente.
- **Rutas:** mantenimiento de rutas + tipo de ruta. Costa Rica tiene rutas cargadas; **faltan las rutas de Venezuela** (tarea de Dylan).
- **Transportistas / Choferes / Vehículos:** catálogos existen, falta data real. El de vehículos es crítico: tipo de camión (incluye motos en Venezuela), capacidad de volumen (mm³) y peso, tipo de combustible, tipo de llantas — todo esto alimenta tanto el cálculo de costos (Liquidación) como la planificación (para no dejar mercancía sin poder cargar en el camión, algo que hoy sí pasa).
- **Clientes / Puntos de entrega:** origen/destino, país, dirección y coordenadas geográficas. Las coordenadas de Costa Rica ya las tiene Jean Carlo (obtenidas para un prototipo previo); las de Venezuela deberían estar en EPRAC — pendiente validar con **Toño**.
- **Acción pendiente (Reunión 4):** repasar todos los catálogos maestros (camiones, choferes, zona, transporte) para confirmar que están completos antes de que Liquidación y Tracking (el MVP) dependan de ellos.

### 2.2 Planificación de rutas — detalle técnico (Reunión 5)

- **Qué hace:** dado un conjunto de pedidos ya asignados a ruta + transportista + conductor + vehículo + fecha, determina en qué **orden** se deben entregar para minimizar distancia/combustible/desgaste y cumplir tiempos. La salida de este módulo es lo que alimenta a Tracking (antes ese "orden" se mandaba al sistema legado Trade).
- **Fase 1 (la que se está construyendo ahora):**
  - Clustering de clientes por coordenadas geográficas.
  - Cálculo de distancias con la API de Google Maps usando **distancia "driving" (por carretera), nunca distancia en línea recta** — la línea recta subestima el recorrido real y no sirve para esto.
  - Jean Carlo ya tiene un prototipo (de noviembre) con esta lógica de clustering + Google Maps para Costa Rica, y las coordenadas de todos los clientes de Costa Rica — se los va a compartir a Jesús como base/punto de partida junto con el código.
  - **Ojo con el costo de la API de Google Maps:** las primeras ~1000 peticiones son gratis, luego se cobra por consulta. Como el número de combinaciones de rutas posibles crece rápido, es tarea de research de Jesús evaluar cómo optimizar/limitar esas llamadas (o evaluar alternativas a Google Maps).
  - Existe en el lago de datos una tabla llamada "planificación de viajes" que en realidad **no es una planificación real** — solo contiene los pedidos (equivalente a la guía de despacho que genera EPRAC). Hay otra tabla legada (cargada una vez en enero) con reglas estáticas del sistema Trade que puede estar en desuso — a revisar con Jean Carlo/Ana antes de reusar cualquiera de las dos.
- **Fase 2 (futura, con datos históricos, estimado 8 meses–1 año de operación):** incorporar como factores el transportista, el conductor y el vehículo específicos (hay diferencias reales de desempeño — ej. un chofer históricamente más rápido sin importar la ruta), y factores de tránsito por hora/zona. No hay data para esto todavía; se recolectará una vez el TMS esté en producción (primeras señales esperables en 1-2 meses).
- **Datos de apoyo:** las coordenadas de clientes se guardan igual para Tracking (Justin las usa con Waze para trazar la ruta visual desde la posición actual) y para Planificación (Jesús las usa para calcular todas las combinatorias posibles) — mismo dato, dos consumos distintos.

### 2.3 Liquidación / Tarifas — detalle de negocio (Reunión 4)

**Diferencias clave Costa Rica vs. Venezuela que el módulo debe soportar:**

| Aspecto | Costa Rica | Venezuela |
|---|---|---|
| Flota | Propia (camiones de OLO) | Sin flota propia (a la fecha) — 100% tercerizado |
| Rutas/día | 12–19 | 21–36 (~el doble) |
| Choferes | No entrenados en ventas | Entrenados en ventas/servicio — actúan como extensión de vendedores |
| Ayudante en camión | Sí | Sí (en ambos: debe estar en la estructura de costos) |
| "Implant" (representante del transportista en sitio) | No existe | Sí existe |
| Tipos de vehículo | Camiones grandes/medianos/pequeños | Igual + **motos** (logística y costos distintos: combustible, desgaste, licencia) |
| Centros de distribución | Uno | Varios — el planificador debe decidir si conviene recoger de otro centro o consolidar en uno (según qué salga más barato) |
| Tipos de ruta | — | Cortas (diarias, ~1 día), medianas (cada 2 días), largas (3–4 días, 800–1000 km) |

- **Cómo se cobra/liquida hoy en Venezuela (a mejorar con el TMS):** tabulador por ruta + $1.75 por visita/recolección adicional (una recolección cuesta el doble que una entrega porque implica ida y vuelta) + 0.4% de la facturación como seguro pagado al transportista. El cliente **Mayoreo** (a través de **Ignacio**) pide un motor de reglas mucho más flexible: por kilómetro, volumen, bulto, tiempo, flat rate, etc., **configurable incluso por cliente**, no reglas fijas en código sino data.
- **Estructura de costos (tarifario) — la base de todo:** tiene **componentes fijos** (chofer, ayudante, etc. — aplican a propio y a tercero) y **componentes variables** (combustible, llantas, aceite, filtros, desgaste — en función del kilómetro). Costa Rica ya tiene un estudio de este tipo hecho con mucho detalle (hasta desgaste de piezas específicas); Jean Carlo lo va a compartir con Dylan como base, aunque los montos varían por país (el diésel y las llantas no cuestan igual en CR que en VE).
- **Diferencia propio vs. tercero:** al transporte **tercerizado** se le agrega un margen de utilidad sobre el costo (ej. costo real $200 + 20% = se cobra $240). Al transporte **propio** no se le agrega ese margen — en su lugar aplica un % de "costo de conversión" (ejemplo dado: 6%).
- **Tres "ciclos" de dinero a modelar por separado:**
  1. Lo que OLO le paga al transportista (según estructura de costos + margen si es tercero).
  2. Lo que OLO le cobra a Mayoreo por el servicio de transporte.
  3. Lo que Mayoreo decide cobrarle a su cliente final — esta regla es de Mayoreo, no de OLO, y puede ser distinta por cliente.
- **Tarifario combinable (n × n):** Dylan debe modelarlo como catálogo combinable — hoy en Venezuela ya se combina tipo de camión + 2-3 zonas; el objetivo es generalizar esa combinatoria (camión × zona × tipo de cobro × cliente, etc.).
- **Preliquidación / agilización del pago (dolor real en Venezuela):** hoy el ciclo completo (chofer entrega → sella guías/factura en cliente → regresa 2-3 días después → revisión entrega por entrega buscando novedades/devoluciones → cálculo → proforma → factura → cuentas por pagar) toma semanas, y en Venezuela el bolívar se devalúa en ese tiempo. La solución que se busca: el chofer confirma entregas desde una app móvil; si no hay novedad, se puede preliquidar casi de inmediato (de ~2 semanas a preliquidación el mismo día), con doble verificación del cliente (firma/sello digital o foto de la factura en la app) y conciliación automática de proforma vs. factura vía IA.
- **Referencia histórica compartida por Ricardo (ex-Walmart):** un tarifario basado en componentes fijos/variables por distancia a cada tienda, con comprobante físico sellado por el cliente, escaneado semanalmente y validado contra el sistema antes de pagar — muy similar al proceso actual de Venezuela, útil como marco de comparación.
- **Requerimientos funcionales:** Dylan ya investigó cómo liquidan otros TMS del mercado (mencionó SAP entre otros) y generó un documento de requerimientos funcionales de liquidación como base de "mejores prácticas".

### 2.4 OMS — primera sesión de trabajo: concepto, reglas iniciales y posicionamiento (Reunión 8)

- **Qué es:** OMS = *Order Management System*. Un administrador de prioridades — en este caso,
  de pedidos. Resuelve un problema concreto de hoy: los pedidos entran a una cola tipo FIFO y se
  van alistando en el orden en que llegan, sin importar si alguno era más urgente; un pedido
  urgente puede terminar de último o a la mitad de la cola simplemente porque entró después.
- **Dónde vive respecto al TMS (aclaración importante, cambia el entendimiento previo):** el OMS
  trabaja **entre el WMS/Torre de Control y el lago de datos** — toma lo que genera el WMS
  (pedido + viaje) y, aplicando reglas, lo inserta en el lago de datos **ya con una prioridad
  asignada**. Es decir, actúa **antes** de que cualquier cosa entre al TMS propiamente, no
  después del módulo Pedidos.
  - **El OMS no se va a considerar un módulo del TMS.** Se define explícitamente como un
    **"satélite"**: interviene en el flujo de datos de origen (en medio del WMS y el lago de
    datos) y le da insumos al TMS (la prioridad ya calculada), pero **el TMS no depende de él
    para funcionar** — sin OMS, los pedidos y viajes van a seguir existiendo igual, solo que sin
    la priorización inteligente. Sigue siendo, como se dijo desde el kickoff, un **"mini-proyecto
    dentro del proyecto"**, pero ahora con una definición más precisa de dónde vive.
  - Los pedidos pueden llegar al lago de datos por dos vías: directo desde el WMS, o pasando por
    "la planificación" **[verificar a qué proceso exacto se refiere — no quedó claro si es la
    tabla estática de "planificación de viajes" que menciona Ana más abajo, o el módulo de
    Planificación de Jesús (§2.2); aclarar en la siguiente sesión]**.
  - El OMS se planteó por primera vez en **marzo (2026)**, pero no se había podido trabajar por
    prioridades del equipo — esta es la primera sesión real de trabajo sobre el tema.
- **Reglas de priorización — se arranca con 2 (se mencionaron "3" al inicio de la reunión, pero
  solo se detallaron 2; la tercera podría ser el mecanismo de asignación manual de urgencias que
  se describe más abajo — [verificar] en la siguiente sesión):**
  1. **Fecha de despacho / día de salida de la ruta (la primera a construir):** cada ruta tiene
     días fijos de salida ya definidos (ej. en Venezuela, Caracas sale solo los jueves, Valencia
     sale martes y viernes; en Costa Rica varía por zona — el GAM/anillo central sale todos los
     días, zonas rurales como Guanacaste o San Carlos salen 1-2 veces por semana — con
     posibilidad de excepciones puntuales para un cliente específico). La regla decide **cuándo
     mandar a alistar** un pedido: no antes de lo necesario. Ejemplo dado en la reunión: un
     pedido para Caracas (sale jueves) que entra el lunes NO se debe alistar de inmediato — se
     debe alistar el día antes de que salga la ruta. Si en cambio otro pedido va para Valencia
     (sale martes) y entra ese mismo lunes, ese sí se debe alistar primero, aunque haya entrado
     después que el de Caracas, porque su ruta sale antes.
  2. **Priorización por línea (futura, después de la regla 1):** cada pedido se compone de
     varias líneas/ítems, y puede haber líneas más prioritarias que otras dentro de un mismo
     pedido.
  - **Por qué importa el "no antes de lo necesario":** si se manda a alistar con demasiada
    antelación, el producto llega al muelle de despacho y se queda ahí ocupando espacio varios
    días hasta que sale el camión — el problema real que el OMS busca evitar no es solo llegar
    tarde, sino también alistar demasiado temprano y saturar el muelle innecesariamente.
  - Las reglas se piensan **iterativas**: arrancar simple (regla 1) e ir agregando complejidad
    después (regla 2, más las que salgan).
- **Cómo se conoce la ruta y el día de salida de un pedido:** a través del **cliente** — cada
  cliente/punto de entrega ya está asociado a una ruta (el cliente es el punto final, el centro
  de distribución es el punto de inicio), y cada ruta ya tiene sus días de salida definidos.
  - Costa Rica: del orden de ~1200 clientes / ~100+ puntos de entrega **[verificar cifra exacta,
    audio poco claro]**, agrupados en unas 25-28 rutas ya definidas con sus días de salida
    conocidos. Jean Carlo tiene esta información y se la comparte a Eduardo.
  - Venezuela: no está claro todavía cómo conseguir el equivalente — se va a pedir al
    coordinador de transportes, y también apoyo de Dylan (que está frecuentemente en el almacén
    de Venezuela) para conseguir horarios/días de despacho por ruta.
  - **Acción concreta identificada:** hoy esa relación ruta↔día-de-salida vive en una tabla
    **estática y 100% mantenida a mano** en el lago de datos (ver el punto de Ana más abajo) —
    nadie la administra de forma centralizada. **El OMS debería ser la fuente/dueño de ese
    mantenimiento** (crear/editar rutas y sus días de despacho), para que un cambio (ej. "Caracas
    ya no sale martes y viernes, ahora sale miércoles") se actualice en un solo lugar y el resto
    del flujo lo tome automáticamente, en vez de mantenerlo manual.
- **Contexto de Ana sobre la tabla "planificación de viajes" del lago de datos (complementa lo
  ya documentado en §2.2):** hoy esa tabla estática asigna días por ruta, y el viaje se marca
  "listo para preparar" con **un día de antelación** respecto a la fecha que indica la tabla.
  Esa tabla es la que alimentaba a Trade para sincronizar qué viajes trabajar al día siguiente en
  la Torre de Control. Antes de que un pedido entre a ese plan, "anda suelto" — hoy no hay forma
  de asignarle una prioridad temprana. Esa tabla es precisamente lo que el OMS debería absorber
  y automatizar.
- **Manejo de urgencias / prioridad manual:** se retomó la propuesta de Eduardo de poder asignar
  una prioridad manualmente desde el propio módulo cuando un pedido es urgente ("esto ocupa que
  se vaya hoy") — validado en la reunión como buena idea. Esto es exactamente lo que ya cubre el
  submódulo de Cola de Priorización con override manual (ver `PLAN_MODULO_OMS.md` §5).
- **Cuántos niveles de prioridad — todavía sin definir, hay que homologar sistemas que hoy
  conviven por separado:**
  - El WMS ya maneja prioridades propias.
  - Para pedidos de **EPA** y de **Cofersa [verificar nombre]** se manejan hoy solo **2 niveles**
    de prioridad.
  - Para **Mayoreo**, hoy el proceso es **100% manual**: una persona analiza físicamente la
    situación (cantidad de líneas, pedidos, clientes) y decide en el momento si la ruta sale hoy
    o mañana y qué prioridad le da a cada pedido — pueden ser "n" niveles distintos, sin un
    número fijo (se mencionó que **hoy en la práctica se manejan hasta ~8 prioridades
    informales** para Mayoreo).
  - **Pendiente:** hablar con **Antonio/"Toño"** (encargado de procesos en Costa Rica) para
    definir cuántos niveles de prioridad va a manejar el OMS — no hay que asumir un número, es
    tema de la siguiente sesión.
- **Aprobación humana antes de ejecutar (confirma el patrón ya documentado en §6.1):** el OMS
  **propone** una priorización/planificación de alistamiento, pero es la operación (torre de
  control / almacén) quien revisa esa propuesta y da el visto bueno antes de arrancar el proceso
  de alistamiento — no es una decisión 100% automática sin supervisión.
- **Próxima sesión:** más extensa, ya con tablas/sistemas concretos — falta definir a qué tablas
  del lago de datos se va a conectar el OMS y de qué sistema exacto sacar la data (pendiente del
  lado de Ana/equipo de datos). Mientras tanto, Eduardo puede ir avanzando la lógica de la regla
  1 (fecha de despacho + día de ruta) con **datos mock**, simulando pedidos para probar la lógica
  a nivel de reglas antes de tener las tablas reales — coincide con el enfoque de prototipo con
  datos de ejemplo que ya se armó (ver `PLAN_MODULO_OMS.md` §9).

## 3. Arquitectura técnica y datos

- **Base de datos transaccional nueva:** se va a construir una arquitectura de base de datos (PostgreSQL) *inspirada en la estructura actual del lago de datos*, no un lago nuevo. El lago de datos debe dejar de usarse como transaccional y pasar a ser un lago real (solo BI/consultas), mientras la nueva base transaccional de TMS lo alimenta.
- **Lago de datos actual** recibe hoy 3 sistemas: última milla, liquidador de viajes y trade/torre de control (el equipo ya trabaja en el monitor de este lago).
- **Infraestructura:** se está tramitando un servidor; plan es montar Docker + PostgreSQL ahí para TMS.
- **Creación de tablas/esquema:** se hace pidiendo a un agente de Claude que genere las tablas/relaciones (emulando la agilidad de Supabase pero sobre infraestructura propia), y todo pasa por PR — no cambios manuales.
- **Sistema externo EPRAC:** fuente de datos de pedidos, guías de despacho y geolocalización de puntos de entrega/clientes. Genera hoy la guía de despacho (consolidado de pedidos por ruta) que Planificación debe ordenar; también debería tener las coordenadas de clientes de Venezuela (a confirmar con Toño).
- Torre de Control (Venezuela) es hoy quien asigna/planifica manualmente qué sale al día siguiente; esa consolidación es la que llegará como guía de despacho desde EPRAC.
- Jean Carlo preparará/mantiene un diagrama de flujo de datos (de dónde se jala la data, qué vive en cada sistema).

## 4. Roles del sistema (dentro de la aplicación)

- **Superusuario:** acceso total. Hoy solo lo tiene Jean Carlo; la meta es que todo el equipo de desarrollo lo tenga.
- **Admin:** ve solo ciertas cosas.
- **Cliente:** ve solo ciertas cosas.
- **Operaciones:** uso diario del sistema.

No hay gestión de roles/permisos madura aún — es justamente la capa de RLS/seguridad que Andrey está desarrollando de forma transversal (ver §2), y que debe permitir permisos finos por módulo (ej. un liquidador necesita restricciones hasta por botón, no solo por pantalla).

## 5. Equipo

### 5.1 Equipo de desarrollo (con módulo/responsabilidad asignada)

| Persona | Módulo / responsabilidad | Notas |
|---|---|---|
| **Jean Carlo** *(también referido como "Giancarlos" o, posiblemente, "Yanca" — [verificar] esta última)* | Liderazgo técnico, infraestructura, superusuario | Organiza reuniones, sube código base, gestiona accesos/licencias, comparte prototipos y estudios base (costos CR, clustering de rutas). Mantiene el índice/menú maestro de todos los módulos del sistema TMS, trabajado directamente con Justin. |
| **Justin** | Tracking (mobile) | Experto en desarrollo de apps móviles. |
| **Andrey** | RLS / seguridad (transversal a todos los módulos) | También participa en la parte web general; asiste con Jean Carlo a la reunión de portafolio de Intelix. Ya armó la lista de "agentes" IA propuestos (ver §6), pero está bloqueado esperando que Ana le confirme el mapeo actualizado de quién trabaja en qué módulo antes de entregarla. |
| **Dylan** | Liquidación / Tarifas + mapeo de rutas de Venezuela | Basado en Venezuela. Ya generó un documento de requerimientos funcionales de liquidación y un primer prototipo (con feedback recibido). No carga horas en Xtiming (a diferencia del resto del equipo). |
| **Jesús** | Planificación de rutas/viajes | Recibirá de Jean Carlo el código base y las coordenadas de clientes de Costa Rica para arrancar. |
| **Eduardo** | OMS | Pendiente de licencia de Kiro (solicitada, aún no llega). |

**Modelo de trabajo:** cada desarrollador trabaja en su propia rama por módulo; se centraliza el merge. Los módulos que se relacionan entre sí (p. ej. planificación ↔ tracking ↔ catálogos) deben coordinarse en conjunto. El equipo se declara explícitamente **"un solo equipo de trabajo de desarrollo"**: cada módulo asignado conforma el alcance completo del proyecto TMS, no silos independientes.

**Prioridad / MVP:** **Liquidación y Tracking tienen la máxima prioridad** — son los módulos que hoy "dan guerra" en Venezuela (cubiertos por sistemas legados: liquidador y Trade) y se consideran el producto mínimo viable. Dependencia crítica: para que funcionen, los catálogos maestros (conductores, choferes, transporte, camiones) y las bases de datos deben estar al día primero.

### 5.2 Otros roles / stakeholders (no son parte del equipo de desarrollo)

- **Palencia:** coordinador/enlace de negocio. Propuso originalmente el esquema de "una persona por módulo", participa activamente definiendo reglas de liquidación junto con Dylan y Ricardo, y coordina aspectos organizativos del equipo (asignación de módulos, canal de comunicación, códigos de proyecto). No tiene un módulo de desarrollo propio asignado.
- **Ana** (Intelix): coordinadora de documentación/PM. Responsable de centralizar la documentación del proyecto (requerimientos, funcionalidades, MVPs), de los reportes de avance semanales, y del "notebook" de reuniones. El equipo le propuso crear un agente IA de documentación/roadmap para facilitarle el seguimiento (puede llevar ~40 proyectos a la vez).
- **Ricardo:** consultor/experto externo en operaciones de transporte (ex-logística Walmart). Aporta las reglas de negocio y diferencias operativas CR/VE para Liquidación y Planificación.
- **Ignacio:** stakeholder del cliente Mayoreo — pide flexibilidad en el motor de reglas de cobro.
- **Toño (Antonio):** encargado de procesos en Costa Rica. Referente clave para el OMS — es quien
  puede orientar cómo homologar los distintos sistemas de prioridad que hoy conviven por separado
  (WMS, EPA, Cofersa, Mayoreo — ver §2.4) en un único esquema de niveles de prioridad. También
  pendiente confirmar si las coordenadas geográficas de clientes de Venezuela están cargadas en
  EPRAC.

## 6. Metodología y herramientas de desarrollo

- **Herramientas de IA para codificar:** el equipo trabaja principalmente con **Kiro** y **Claude** ("Cloud" en las transcripciones) para los agentes de apoyo.
- **Agentes de IA configurados/propuestos:**
  - Ya existen: agente de **revisión de código** (estándares) y agente de **contexto del proyecto**.
  - En construcción: skill de consistencia visual (tipografía, look & feel) entre módulos.
  - **Propuestos (Reunión 6):** agente **generalista de documentación** (apoya a Ana), agente de **RLS/seguridad** (roles, permisos, JWT), agente de **prototipado/UI**, agente de **base de datos**, agente de **arquitectura/infraestructura**, agente de **roadmap** (para que Ana consulte avance). Cada módulo también tendría su propio agente especializado (ej. reglas de liquidación para Dylan) que se apega a las reglas del agente generalista, para evitar contradicciones entre agentes.
  - **Estado a Reunión 7:** Andrey ya tiene armada una lista completa de agentes propuestos para TMS, pero **está bloqueado** — necesita que Ana le confirme primero en qué módulo está trabajando cada quien (mapeo actualizado), para entregar solo los agentes que realmente se van a usar. Motivo explícito: si se generan de más, después hay que estar modificándolos, y eso es justo lo que se quiere evitar. Mientras tanto, parte de la documentación que se pensaba cubrir con agentes ya se está generando automáticamente con la herramienta AWS/AIDLC que se está adoptando (ver §6.1) — hay que identificar qué documentación **no** cubre esa herramienta para enfocar ahí los agentes que sí hace falta construir.
  - Idea explícita: que el feedback de revisión de código (ej. hecho de madrugada) se reincorpore como aprendizaje del propio agente, no se pierda.
- **PRs obligatorios** para todo cambio, incluida la creación de tablas en la base de datos.
- **Repositorio centralizado de documentación** (a crear): requerimientos, funcionalidades, agentes — accesible a todo el equipo. Se usará además una herramienta tipo "notebook" (probablemente NotebookLM u homólogo — **[verificar]**) para mantener la documentación de la solución; la idea es que los documentos vivan en la carpeta del repo del proyecto y se consulten/lean desde ahí por cualquier herramienta que se use, no al revés.

### 6.1 Documentación viva del proyecto — metodología AI/DLC aplicada a TMS (Reunión 7)

Ana (Intelix) explicó el set de **documentos vivos** que se van a mantener de forma colaborativa durante todo el desarrollo, siguiendo la metodología AI/DLC que Intelix está adoptando (ver `Estandares_Desarrollo_AWS_Intelix.md` §2 para la metodología en general):

- **Matriz de requerimientos** (etapa Discovery): en TMS se va a construir **al revés** del flujo natural de la metodología — en vez de partir de entrevistas secuenciales con el cliente, se va a hacer **ingeniería inversa a partir de los mockups que ya están armados** ("MoSCoW" en la transcripción suena como "MOCOP" — se interpreta como la versión de mockups ya priorizada con el método MoSCoW, **[verificar]**). Esos mockups son el insumo para generar la matriz. Aunque hay **una sola matriz para todo el proyecto**, los requerimientos se identifican y acotan **por módulo** (cada módulo es amplio y particular). De cada requerimiento sale un entregable con sus criterios de aceptación, y esos criterios son la base del guion de pruebas.
- **Plan de desarrollo:** tareas de construcción + pruebas unitarias + pruebas técnicas integrales, por recurso asignado (desarrollador + su IA). Cada desarrollador genera su propio plan (horas, fecha inicio/fin) usando los *skills* de la metodología instalados en Kiro; esos planes individuales se consolidan en el cronograma general del proyecto (a cargo de Ana), organizado por los entregables que salen de la matriz de requerimientos.
- **Reporte de ejecución de tareas de desarrollo:** reporte semanal (o más frecuente) de horas ejecutadas por entregable, **más un "factor de aceleramiento"** — el % de reducción de tiempo que da el desarrollo asistido por IA frente a una estimación tradicional (ejemplo dado: una tarea estimada en 18h con un factor de aceleramiento del 20-30% se reduce y debe adelantar las fechas de inicio/fin de las tareas siguientes en el cronograma, en tiempo real). Este factor **solo aplica a tareas de desarrollo de aplicaciones**, no a todas las actividades. La estructura exacta de este reporte todavía la está definiendo Intelix internamente; se compartirá al equipo cuando esté lista.
- **Matriz de incidencias** (etapa de pruebas): registra fallas, criterios de aceptación no contemplados o nuevos requerimientos descubiertos en pruebas, ligados siempre a un requerimiento/entregable de la matriz de requerimientos. Se registran en **3 momentos**: (1) certificación interna (aún no liberado al cliente), (2) certificación funcional (ya en QA, disponible para que el cliente pruebe), (3) post-implementación (incidencias sobre lo ya implantado en producción — contemplando que puede haber entregas/liberaciones parciales por entregable). Flujo de responsables: el funcional/líder del proyecto registra la incidencia → el equipo técnico se autoasigna o el líder asigna → quien corrige registra hallazgo + solución → el funcional/líder certifica que la corrección cumple el criterio de aceptación.
- **Regla explícita e importante:** una tarea de desarrollo **no se da por completada hasta que el desarrollador humano la certifica**. Las horas que se miden por entregable son: horas de desarrollo asistido por IA **+** horas de verificación del desarrollador humano. Cuando el factor de aceleramiento acorta el tiempo de un entregable, el desarrollador debe hacer su verificación justo cuando termina el desarrollo asistido, para no atrasar el "check".
- Todo el código debe vivir en Git, con checkpoint/certificación en cada entrega del desarrollador.

**Punto de partida inmediato (a la fecha de la Reunión 7):** cerrar la versión de mockups (priorizados vía MoSCoW) esa misma tarde con Jean Carlo ("Giancarlos"), para poder generar la matriz de requerimientos y revisar una por una las historias de usuario y criterios de aceptación, módulo por módulo.
- **Herramienta descubierta en Reunión 2** (compartida por Anderson/Alfredo **[verificar]**): un repo en tendencia (top 3 GitHub trending en ese momento) que instala como CLI tanto en Claude como en Kiro y mantiene un **grafo/contexto del proyecto y de roles**. *Nota: esto es conceptualmente muy cercano al skill `repo-orchestrator`/`graphify` que ya se usa en este proyecto — vale la pena comparar antes de adoptarlo para no duplicar esfuerzo.*
- **Estándares técnicos AWS/AIDLC** (metodología, IaC/SAM, Python backend, React frontend, seguridad): documentados por separado en [`Estandares_Desarrollo_AWS_Intelix.md`](Estandares_Desarrollo_AWS_Intelix.md) — ya completo, con la transcripción íntegra de la sesión más el deck oficial de la presentación (Beconsult · Intelix, julio 2026). Esa sesión (~30 personas) nace de otro proyecto interno de Intelix ("Gestión de portafolio"), no es exclusiva de TMS, pero fija el estándar que aplica a todo desarrollo, TMS incluido. **La presenta "Javi"/Javier, del equipo de arquitectura de Intelix — es una persona distinta de Jean Carlo** (líder de TMS OLO); antes había una duda cruzada sobre si el líder de TMS se llamaba Javier — queda resuelta: no, son dos personas distintas.
- **Insumo recomendado para levantamiento de requisitos:** grabar las reuniones con clientes/negocio y transcribirlas — "el 80% se dice y no se escribe". Este mismo documento es un ejemplo de esa práctica.
- **Soporte técnico especializado:** el equipo de desarrollo tiene asesoría (no ejecución directa) de especialistas de Intelix en arquitectura, base de datos, aplicaciones y seguridad para lineamientos técnicos.

## 7. Accesos, licencias y seguimiento administrativo

- Licencias de Claude ("Cloud") gestionadas por Jean Carlo con cuentas corporativas OLO (correos genéricos tipo `@mayoreo`/OLO) para Eduardo, Jesús y Dylan.
- Dylan: acceso a Claude estuvo bloqueado hasta activar su correo corporativo (pendiente de IT en su momento).
- Eduardo: licencia de **Kiro** solicitada, aún no había llegado (a la fecha de la Reunión 6).
- VPN: disponible si se necesita.
- **Registro de horas:** vía **Xtiming**, con el código de proyecto **OC26007** ("Desarrollo para proyectos TMS"). Reuniones, documentación y cualquier entregable del proyecto se registran bajo ese código. Dylan es la excepción — no registra horas en Xtiming.
- **Canal de comunicación interno:** Google Chat (no WhatsApp, al menos por ahora — se evaluará abrir otros canales en 2-3 semanas).

## 8. Cadencia de reuniones

- **Reunión semanal (lunes):** seguimiento más amplio / con negocio y arquitectura — históricamente 2:00–2:30 p.m. hora de Costa Rica = 4:00 p.m. hora de Venezuela.
- **Reunión de seguimiento interno del equipo de desarrollo (martes, 9:00 a.m. hora Venezuela):** para coordinar tareas, resolver bloqueos y (a futuro) revisar avances. Establecida a partir de la Reunión 6.
- Reportes de avance semanales hacia Intelix, además de las reuniones puntuales de revisión por módulo (liquidación, planificación, tracking, etc., ~30 min cada una).

## 9. Pendientes / acción (open items)

- [ ] Repasar todos los catálogos "maestros" (camiones, choferes, zona, transporte) para confirmar que están completos, antes de que Liquidación/Tracking (MVP) dependan de ellos.
- [ ] Dylan: modelar el tarifario combinable (n × n) del sistema de liquidación; traer el panel de tarifas combinables a revisión.
- [ ] Jean Carlo: compartir con Dylan el estudio detallado de estructura de costos de Costa Rica (base para adaptar a Venezuela).
- [ ] Jean Carlo: compartir con Jesús el prototipo de noviembre (clustering + Google Maps) y las coordenadas de clientes de Costa Rica.
- [ ] Jesús: research sobre cómo optimizar/limitar las llamadas a la API de Google Maps (costos después de las primeras ~1000 peticiones) o evaluar alternativas.
- [ ] Validar con Toño si las coordenadas de clientes de Venezuela están en EPRAC.
- [ ] Confirmar licencia de Kiro para Eduardo.
- [ ] Cada desarrollador: definir y traer los submódulos de su módulo asignado (fecha objetivo: martes siguiente a la Reunión 6).
- [ ] Crear el repositorio centralizado de documentación del proyecto.
- [ ] Definir el proceso de negocio de Devoluciones/Logística inversa antes de diseñar el módulo (sin dueño asignado todavía).
- [ ] Asignar dueño de: Guías de despacho, Mantenimiento de flota, Backhaul, Contratos, Reportería, Configuración.
- [ ] Evaluar la herramienta de grafo/contexto descubierta en Reunión 2 (trending en GitHub) y decidir si se adopta, comparándola con `repo-orchestrator`/`graphify`.
- [ ] **Ana → Andrey:** compartir el mapeo actualizado de qué módulo trabaja cada quien, para que Andrey pueda entregar (sin sobre-construir) la lista final de agentes IA a crear.
- [ ] **Andrey → equipo/Ana:** compartir el índice/menú completo de módulos del sistema TMS (lo tiene o lo consigue vía Jean Carlo/"Yanca" + Justin).
- [ ] **Todo el equipo:** confirmar por escrito (chat del proyecto) qué módulo tiene asignado cada uno, para identificar huecos sin asignar.
- [ ] Cerrar la versión de mockups (priorizados con MoSCoW) con Jean Carlo, para poder generar la matriz de requerimientos módulo por módulo.
- [ ] Intelix: terminar de definir la estructura del reporte de ejecución de tareas (horas + factor de aceleramiento) y compartirla al equipo.
- [ ] **Jean Carlo → Eduardo:** compartir la tabla cliente↔ruta↔día de despacho de Costa Rica (ver §2.4).
- [ ] Conseguir el equivalente de Venezuela (rutas y sus días de despacho) — vía el coordinador de transportes y/o apoyo de Dylan en el almacén.
- [ ] Hablar con Toño/Antonio (procesos) para definir cuántos niveles de prioridad va a manejar el OMS, homologando lo que hoy hacen WMS, EPA, Cofersa y Mayoreo por separado (ver §2.4).
- [ ] Aclarar a qué se refiere exactamente "pasando por la planificación" como vía alterna de entrada de un pedido al OMS (§2.4) — ¿la tabla estática de planificación de viajes, o el módulo de Planificación de Jesús?
- [ ] Definir a qué tablas/sistema exacto del lago de datos se va a conectar el OMS (pendiente que Ana/equipo de datos lo precise para la siguiente sesión de OMS).
- [ ] Eduardo: mientras tanto, avanzar la lógica de la Regla 1 del OMS (fecha de despacho + día de ruta) con datos mock, simulando pedidos para validar la lógica antes de tener las tablas reales.

---

## 10. Bitácora de reuniones (fuente)

| # | Tema principal | Puntos clave |
|---|---|---|
| Reunión 1 | Kickoff de desarrollo TMS | Modelo de ramas por persona, decisión de nueva BD Postgres, agentes Claude, overview de los ~11 módulos, primeras asignaciones (tracking→Justin, liquidación→Dylan), estado de catálogos, acceso a demo, cuadre de horario de reunión semanal. Confirma a **Jean Carlo** como líder/superusuario. |
| Reunión 2 | Aclaración de arquitectura de datos + herramientas | Aclaración lago de datos vs. BD transaccional nueva, avance en agentes Claude (code review + skill visual), descubrimiento de herramienta de grafo/contexto (Anderson/Alfredo), invitación abierta a preguntas. |
| Reunión 3 | Estándares AWS/AIDLC (Intelix) — sesión más amplia (~30 personas), no exclusiva de TMS, ligada al proyecto interno "Gestión de portafolio" de Intelix, presentada por **Javi/Javier** (arquitectura Intelix, distinto de Jean Carlo) | Metodología AI/DLC completa (5 etapas + prompts + puertas de calidad), IaC obligatorio (SAM/CloudFormation), ambientes dev/qa/prod, serverless-first (Lambda vs. ECS), resiliencia SQS (DLQ/maxReceiveCount/Visibility/idempotencia), optimización IAM y Lambda, React (design system, arquitectura de pantalla, Amplify vs. ECS), seguridad interna/externa, Python hexagonal/SOLID/DRY, checklist de producción. Detalle completo en `Estandares_Desarrollo_AWS_Intelix.md` (ya completo — transcripción íntegra + deck oficial). |
| Reunión 4 (2 partes) | Liquidación/Tarifas — reglas de negocio con Ricardo | Diferencias operativas CR vs. VE, estructura de costos (fijos/variables), 3 ciclos de dinero, necesidad de motor de reglas de cobro flexible (Ignacio/Mayoreo), preliquidación vía app móvil + IA, identificación de módulos nuevos (Mantenimiento de flota, Backhaul), agenda de próximas revisiones por módulo. |
| Reunión 5 | Planificación de rutas — detalle técnico con Jesús | Enfoque de clustering + Google Maps (distancia driving, no línea recta), prototipo previo de Jean Carlo (CR), cuidado con costos de la API, fases 1 (sin histórico) y 2 (con histórico de desempeño), relación con Tracking, mención de la reunión de portafolio Intelix. |
| Reunión 6 | Organización interna del equipo de desarrollo | Asignación final de módulos (Dylan-Liquidación, Jesús-Planificación, Eduardo-OMS, Andrey-RLS/seguridad), prioridad MVP (Liquidación+Tracking), propuesta de agentes IA especializados y generalistas, repositorio centralizado de documentación, código de proyecto Xtiming (OC26007), canal Google Chat, nueva reunión de seguimiento interno los martes. **Se excluye a Palencia de la tabla de responsabilidades de desarrollo** — su rol es de coordinación/negocio (ver §5.2). |
| Reunión 7 | Documentación viva del proyecto (Ana/Intelix) + estado de los agentes IA | Explicación de los documentos vivos AI/DLC aplicados a TMS: matriz de requerimientos (por ingeniería inversa desde los mockups, no desde entrevistas), plan de desarrollo, reporte de ejecución con "factor de aceleramiento", matriz de incidencias en 3 momentos. Regla de que una tarea no se cierra hasta certificación humana. Andrey ya tiene la lista de agentes armada pero está bloqueado esperando el mapeo de módulos de Ana. Pendiente: que cada uno confirme su módulo asignado y cerrar la versión de mockups con Jean Carlo esa misma tarde. |
| Reunión 8 | OMS — primera sesión de trabajo (concepto, reglas iniciales, posicionamiento), con Eduardo, Ana y Andrey | Explicación del concepto OMS (administrador de prioridades de pedidos, resuelve el problema de la cola FIFO). Aclaración clave: el OMS trabaja entre el WMS/Torre de Control y el lago de datos, **no es un módulo del TMS sino un "satélite"** — el TMS no depende de él. Dos reglas iniciales: fecha de despacho + día de salida de ruta (regla 1, a construir primero) y priorización por línea (regla 2, futura). Se identificó que la tabla de rutas↔días de despacho hoy es 100% manual y debería pasar a ser mantenida por el OMS. Se validó la idea de asignación manual de urgencias. Quedó pendiente homologar con Toño/Antonio cuántos niveles de prioridad manejar (hoy conviven WMS, EPA/Cofersa con 2 niveles, y Mayoreo con proceso manual de hasta ~8). Ver detalle completo en §2.4. |

