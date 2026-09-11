# Panorama de negocio — STO / TMS OLO

> Code knowledge base del repositorio `sto_tms_olo`, derivada de la ingeniería
> inversa del 2026-08-27. Describe el negocio **tal como el código y la
> documentación versionada lo expresan hoy**, no el estado deseado.

## Dominio de negocio

El sistema es un **TMS (Transportation Management System)** para **Ologistics
(OLO)**, operador logístico con presencia declarada en **Costa Rica** y
**Venezuela**. El dominio cubre el ciclo de vida del transporte de mercancía
desde que un pedido entra al sistema hasta que se liquida el flete al
transportista, incluida la logística inversa.

El título del producto en el navegador es `STO - Sistema de Transportes OLO`
(`index.html`); la interfaz está escrita íntegramente en español.

Subdominios identificables en el código, agrupados por rol:

| Subdominio | Entidades observadas | Módulos que lo materializan |
|---|---|---|
| Tenencia e identidad | `organizations`, `app_users`, `roles` | `configuracion`, `hooks/useAuth` |
| Geografía y red logística | `countries`, `stores` | `paises`, `tiendas` |
| Comercial y contractual | `customers`, `contracts`, `contract_documents` | `clientes`, `contratos` |
| Capacidad y flota | `carriers`, `drivers`, `vehicles`, `vehicle_types` | `transportistas`, `conductores`, `vehiculos` |
| Rutas | `route_types`, `routes` | `rutas`, `planificacion` |
| Núcleo del pedido | `orders`, `dispatch_guides` | `pedidos`, `planificacion`, `guias` |
| Ejecución y post-venta | `tracking_events`, `returns` | `tracking`, `devoluciones` |
| Liquidación | `rates`, `settlements` | `liquidaciones` |
| Priorización de alistamiento | prototipo sobre datos mock | `oms` |

## Propósito del sistema

El propósito operativo que el código soporta hoy es **planificar y ejecutar
rutas de reparto**:

1. Los pedidos llegan desde el **WMS** — el módulo `pedidos` se subtitula
   literalmente "Gestión de pedidos desde WMS" y su botón "Importar Pedidos"
   todavía no tiene handler, así que la vía real de entrada de `orders` al
   sistema no está implementada en este repositorio.
2. **Planificación** agrupa pedidos pendientes de un mismo tipo de ruta,
   secuencia las paradas y crea la ruta con sus guías de despacho. Es el
   **único punto de escritura** de la cadena pedido → ruta → guía en todo el
   código.
3. **Tracking** hace avanzar el estado de la ruta y registra eventos de
   seguimiento.
4. **Guías**, **Devoluciones** y **Liquidaciones** cierran el ciclo documental,
   post-venta y económico.
5. Los **catálogos maestros** — países, puntos de entrega, transportistas,
   conductores, vehículos, tipos de ruta — alimentan todo lo anterior y admiten
   carga masiva por CSV.

## Funcionalidad clave

- **Tablero de indicadores** (`/`, `/dashboard`): cuatro KPIs por conteo exacto
  sobre `orders`, `routes`, `dispatch_guides` y `returns`, más las cinco rutas
  más recientes.
- **Listado de pedidos** (`/pedidos`): pedido con cliente y punto de entrega
  embebidos; prioridad `high | normal | low` y estado del pedido.
- **Planificación de rutas** (`/planificacion`): selección de tipo de ruta,
  carga de pedidos pendientes, optimización de paradas por vecino más cercano
  sobre distancia euclídea de latitud y longitud, creación de la ruta y de una
  guía de despacho por pedido.
- **Seguimiento** (`/tracking`): avance de estado de ruta, registro de eventos,
  vista de paradas con enlace profundo a Google Maps.
- **Gestión documental de contratos** (`/contratos`): contratos con
  autorrenovación y alerta de vencimiento; documentos referenciados por URL de
  texto libre.
- **Liquidaciones** (`/liquidaciones`, etiquetado "Tarifas" en la navegación):
  liquidación por ruta cruzando transportista, conductor, tarifas, guías y
  devoluciones.
- **Reportería** (`/reportes`): cuatro gráficos construidos a mano con elementos
  HTML y utilidades de Tailwind.
- **Catálogos maestros con importación CSV**: `conductores`, `paises`,
  `tiendas`, `transportistas`, `vehiculos`.
- **Prototipo del OMS** (`/oms/*`): cinco pantallas de priorización de
  alistamiento alimentadas exclusivamente por `src/pages/oms/mockData.ts`.

## El OMS: reposicionamiento y alcance vigente

El **OMS (Order Management System)** ya no se concibe como un módulo interno del
TMS. Según `CONTEXTO_PROYECTO_TMS.md` §2.4 y `PLAN_MODULO_OMS.md` §1-§2, el OMS
es un **satélite** que opera **entre el WMS / Torre de Control y el lago de
datos**, es decir **antes** de que el pedido sea visible en el TMS, no después
del módulo Pedidos.

El prototipo actual **contradice ese posicionamiento**: vive dentro de la SPA
como un grupo más del menú lateral. Es una divergencia conocida y aceptada,
porque `PLAN_MODULO_OMS.md` §9 declara el prototipo explícitamente
**desechable**.

**Alcance del OMS**: decidir **cuándo mandar a alistar** un pedido y **con qué
prioridad**.

**Fuera de alcance**, porque queda en otros módulos o sistemas:

- Asignación de ruta — se deriva de la relación cliente ↔ ruta.
- Asignación de transportista, vehículo y conductor, y secuencia de paradas —
  módulo Planificación.
- Generación de la guía de despacho — sistema EPRAC.
- Inventario y disponibilidad.
- Tarifas y liquidación.

## Reglas de negocio del OMS

**Regla 1 — fecha de despacho + día de salida de la ruta** (`BR1.1`, la primera
a construir). Objetivo doble: **no alistar tarde** y **no alistar demasiado
temprano**, porque alistar antes de tiempo satura el muelle. Ejemplo canónico
recogido en la documentación: un pedido a Caracas cuya ruta sale el jueves y que
entra el lunes **no** se alista de inmediato; un pedido a Valencia cuya ruta sale
el martes y entra el mismo lunes **se alista primero**.

**Regla 2 — prioridad por línea de pedido**: confirmada como futura, sin
detalle.

Se mencionaron "3 reglas" pero solo se detallaron 2; la tercera podría ser el
override manual — marcado `[verificar]` en la fuente y **no** dado por cierto
aquí.

**Fuente del día de salida**: hoy vive en una tabla **estática y mantenida 100 %
a mano** en el lago de datos. El OMS debería pasar a ser su dueño (submódulo 1,
"Mantenimiento de Rutas y Días de Despacho", `/oms/rutas-despacho`), que **no
existe** ni en el enrutador, ni en el menú lateral, ni en el árbol de archivos.
El proceso legado marca "listo para preparar" **un día antes** de la fecha de esa
tabla. Costa Rica: aproximadamente 1200 clientes y 100+ puntos de entrega
`[verificar cifra]` en unas 25-28 rutas con días conocidos; Venezuela sin
equivalente identificado todavía.

## Grado de automatización y roles del OMS — hecho vigente

**El cálculo de prioridad del OMS es 100 % automático.** Lo decide un **motor de
reglas** y **no requiere aprobación humana antes del alistamiento**. Así quedó
confirmado en la **Adenda del 2026-08-26** de
`aidlc/spaces/default/knowledge/documents/2026-08-26-reunion-oms-roles.md`.

- **No existe paso de aprobación de "Jefe de Almacén" ni de ningún otro rol**
  antes del alistamiento. Motivo explícito registrado en la Adenda: un paso de
  aprobación humana ahí **detendría el flujo automático del sistema**, lo que
  contradice el objetivo de automatización total.
- La **única** intervención humana permitida es que el rol **"Responsable del
  OMS"** altere la prioridad de un **pedido puntual** — caso extraordinario, por
  ejemplo un pedido urgente que debe romper el orden calculado por el motor.
  **No** aprueba ni revisa el cálculo de forma rutinaria.
- **"Jefe de Almacén"** conserva **visibilidad** — reportería del módulo y
  acceso a la planificación — pero **no bloquea ni aprueba** el flujo.

Los **4 roles del OMS quedan cerrados**:

| # | Rol | Responsabilidad principal | Estado |
|---|---|---|---|
| 1 | **Operador de Despacho** | Mantenimiento del calendario de rutas y días de despacho | Cerrado |
| 2 | **Administrador de Módulo** | Configura las reglas del módulo; superusuario del módulo, no del TMS completo | Cerrado |
| 3 | **Jefe de Almacén** | Visibilidad y reportería del módulo, acceso a la planificación; **sin paso de aprobación bloqueante** | Cerrado |
| 4 | **Responsable del OMS** | Monitorea el motor automatizado; interviene solo para alterar la prioridad de un pedido puntual | Cerrado |

Queda un traslape **no crítico** entre "Jefe de Almacén" y "Responsable del OMS"
en cuanto a nivel organizacional — coordinador de almacén frente a torre de
control. No afecta al flujo automático.

### Documentación desactualizada que debe corregirse

Esta es una **contradicción documental ya resuelta**, no una duda abierta. Los
siguientes documentos afirman lo contrario del hecho vigente y **están
desactualizados en ese punto concreto**:

- `CONTEXTO_PROYECTO_TMS.md` §2.4 — describe aprobación humana obligatoria antes
  del alistamiento. **Desactualizado: corregir.**
- `PLAN_MODULO_OMS.md` §7.0 — misma afirmación. **Desactualizado: corregir.**
- `aidlc/spaces/default/knowledge/documents/kiro-oms-requirements.md` — el
  requerimiento "Como Jefe Almacén busca revisar y aprobar la propuesta de
  priorización del OMS antes de que se inicie el alistamiento" queda superado y
  debe **reescribirse o eliminarse** en la próxima iteración.

La deuda documental correspondiente queda registrada en
`code-quality-assessment.md` → `## Calidad de documentación`.

## Niveles de prioridad: sin homologar

El **número de niveles de prioridad no está definido**. Coexisten en la
operación:

- Las prioridades propias del WMS.
- **2 niveles** para EPA y Cofersa `[verificar nombre]`.
- Aproximadamente **8 niveles informales** y proceso 100 % manual para Mayoreo.

En el código conviven a su vez **dos vocabularios distintos y ninguno
validado**: el prototipo asume `alta | media | baja`
(`src/pages/oms/mockData.ts`) y la columna real `orders.priority` asume
`high | normal | low` (`src/pages/pedidos/page.tsx`). Homologar está pendiente
con Antonio / "Toño".

Reglas de priorización mencionadas como ejemplo, a formalizar con "el
funcionario":

- **EPA**: pedidos semanales; prioridad especial si hay quiebre de stock en
  tienda. Ya mapeada y automatizable.
- **Cofersa**: reglas más dinámicas — día de salida de ruta, hora de ingreso del
  pedido, cantidad de personal disponible.

## Actores y roles en el sistema actual

El código expresa hoy dos conjuntos de roles que **no coinciden**:

- `src/components/feature/Header.tsx` colorea 5 roles: `SuperUsuario`, `Admin`,
  `Operaciones`, `Chofer`, `Cliente`.
- `CONTEXTO_PROYECTO_TMS.md` §4 define 4: Superusuario, Admin, Cliente,
  Operaciones.

`Chofer` es adicional en el código y no aparece en la documentación. Los 4 roles
del OMS de la sección anterior son un conjunto **distinto y aún no
representado** ni en la tabla `roles` ni en el código.

## Prioridades de programa y precondiciones no resueltas

- **MVP del programa**: **Liquidación y Tracking**. El OMS es un "mini-proyecto
  dentro del proyecto", con dueño **Eduardo**.
- **Dependencia crítica declarada del OMS**: que los catálogos maestros estén al
  día. `CONTEXTO_PROYECTO_TMS.md` §2.1 dice que **no lo están**: faltan las
  rutas de Venezuela, la data real de transportistas, choferes y vehículos, y
  las coordenadas de clientes de Venezuela sin confirmar.
- **Precondición de datos no resuelta**: falta definir a qué tablas del lago de
  datos se conecta el OMS y de qué sistema exacto sale la data — pendiente de
  Ana y del equipo de datos. La vía acordada mientras tanto es avanzar la
  Regla 1 **con datos mock**, que es exactamente lo que hace el prototipo.
- **Contexto de plataforma divergente**: la arquitectura objetivo
  (`CONTEXTO_PROYECTO_TMS.md` §3) es **PostgreSQL propio sobre Docker en
  servidor propio**; el código actual corre sobre **Supabase gestionado**; el
  estándar organizacional apunta a **serverless-first sobre AWS con SAM**. La
  distancia entre el repositorio y ese destino es grande y no está planificada en
  ningún artefacto del repositorio.

## Sources

- `index.html` — nombre y idioma del producto.
- `src/pages/**` — módulos, rutas y capacidades funcionales.
- `src/pages/oms/mockData.ts` — vocabulario `alta | media | baja` del prototipo.
- `src/pages/pedidos/page.tsx` — vocabulario `high | normal | low` de
  `orders.priority`; subtítulo "Gestión de pedidos desde WMS".
- `src/pages/planificacion/page.tsx` — único punto de escritura de la cadena
  pedido → ruta → guía.
- `src/components/feature/Header.tsx` — mapa de 5 roles.
- `CONTEXTO_PROYECTO_TMS.md` §1, §2, §2.1, §2.2, §2.4, §3, §4 — dominio,
  reposicionamiento del OMS, roles, arquitectura objetivo, estado de catálogos.
- `PLAN_MODULO_OMS.md` §1, §2, §4, §6.1-§6.3, §7.0, §8, §9 — alcance, reglas,
  modelo propuesto, estado del prototipo.
- `aidlc/spaces/default/knowledge/documents/2026-08-26-reunion-oms-roles.md`,
  **Adenda 2026-08-26** — hecho vigente sobre automatización total, ausencia de
  paso de aprobación y cierre de los 4 roles. **Supera** a
  `CONTEXTO_PROYECTO_TMS.md` §2.4 y `PLAN_MODULO_OMS.md` §7.0.

## Assumptions & Open Questions

- Número de niveles de prioridad a homologar entre WMS, EPA/Cofersa y Mayoreo —
  pendiente con Antonio / "Toño".
- Identidad de la tercera regla de priorización mencionada pero no detallada —
  `[verificar]` en la fuente.
- Tablas del lago de datos y sistema de origen de la data del OMS — pendiente de
  Ana y del equipo de datos.
- Nombre exacto del cliente registrado como "Cofersa" — `[verificar nombre]` en
  la fuente.
- Cifra de puntos de entrega de Costa Rica — `[verificar cifra]` en la fuente.
