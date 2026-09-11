# Documentación de API — STO / TMS OLO

> Superficies de API externas e internas observadas el 2026-08-27. La superficie
> real del sistema es **PostgREST de Supabase invocado desde el navegador**; no
> hay API propia.

## Superficie de API propia

**No existe ninguna.** El repositorio no sirve un solo endpoint HTTP:

- Cero rutas de servidor, cero handlers, cero controladores.
- Cero infraestructura como código: sin `template.yaml`, sin SAM, sin CDK, sin
  CloudFormation, sin Amplify.
- Cero Supabase Edge Functions y cero `supabase.functions`.

Toda la comunicación sale del navegador hacia Supabase. En términos de contrato,
eso significa que **el esquema de la base de datos ES la API**, y ese esquema no
está versionado en este repositorio.

## Supabase PostgREST

Cliente único: `src/lib/supabase.ts`, con `@supabase/supabase-js` **2.57.4**.
Las llamadas están **dispersas directamente en los componentes de página**, sin
capa `api` ni hooks intermedios, así que no hay un catálogo de operaciones: hay
consultas repetidas con variantes por módulo.

Configuración: `createClient(VITE_PUBLIC_SUPABASE_URL, VITE_PUBLIC_SUPABASE_ANON_KEY)`
**sin genérico de tipos** — el tipo `Database` declarado en el mismo archivo no
se importa en ningún sitio.

### Tablas alcanzadas

20 tablas, ordenadas por número de referencias en el código:

| Tabla | Refs | Archivos que la tocan |
|---|---|---|
| `routes` | 16 | `tracking/page`, `rutas/page`, `rutas/components/RouteModal`, `planificacion/page`, `reportes/page`, `liquidaciones/components/SettlementModal`, `guias/components/GuideModal`, `dashboard/page`, `seed/page` |
| `carriers` | 14 | `transportistas/page`, `CarrierModal`, `conductores/page`, `DriverModal`, `vehiculos/page`, `VehicleModal`, `planificacion/page`, `liquidaciones/page`, `SettlementModal`, `seed/page` |
| `drivers` | 12 | `conductores/page`, `DriverModal`, `planificacion/page`, `liquidaciones/page`, `SettlementModal`, `GuideModal`, `transportistas/page`, `seed/page` |
| `countries` | 12 | `paises/page`, `tiendas/page`, `StoreModal`, `clientes/page`, `transportistas/page`, `CarrierModal`, `seed/page` |
| `app_users` | 12 | `hooks/useAuth`, `configuracion/components/UsersTab`, `UserModal`, `RolesTab`, `paises/page`, `tiendas/page`, `conductores/page`, `transportistas/page`, `CarrierModal`, `DriverModal` |
| `vehicles` | 8 | `vehiculos/page`, `VehicleModal`, `planificacion/page`, `transportistas/page`, `GuideModal`, `seed/page` |
| `dispatch_guides` | 8 | `guias/page`, `GuideModal`, `tracking/page`, `planificacion/page`, `dashboard/page`, `SettlementModal` |
| `route_types` | 7 | `rutas/page`, `RouteTypeModal`, `RouteTypeDeleteModal`, `RouteModal`, `planificacion/page`, `tracking/page` |
| `stores` | 6 | `tiendas/page`, `paises/page`, `seed/page` |
| `roles` | 6 | `RolesTab`, `RoleModal`, `UsersTab`, `UserModal` |
| `returns` | 6 | `devoluciones/page`, `ReturnModal`, `reportes/page`, `dashboard/page`, `SettlementModal` |
| **`orders`** | **6** | **`pedidos/page`, `planificacion/page` (x2), `reportes/page`, `dashboard/page`, `ReturnModal`** |
| `settlements` | 5 | `liquidaciones/page`, `SettlementModal` |
| `vehicle_types` | 4 | `vehiculos/page`, `VehicleTypeModal`, `VehicleTypeDeleteModal` |
| `customers` | 4 | `clientes/page`, `CustomerModal` |
| `tracking_events` | 3 | `tracking/page` |
| `contracts` | 3 | `contratos/page`, `ContractModal` |
| `contract_documents` | 3 | `DocumentsList` |
| `organizations` | 2 | `configuracion/page` |
| `rates` | 1 | `SettlementModal` |

`orders` es la tabla que el OMS va a poblar y solo tiene 6 referencias, ninguna
de ellas con filtro por `organization_id`.

### Contratos de datos embebidos

Los joins PostgREST embebidos son el contrato de lectura de facto. Los
observados:

| Contrato de lectura | Consumidores |
|---|---|
| `orders → customers`, `orders → stores` | `pedidos`, `planificacion` |
| `dispatch_guides → routes`, `→ drivers`, `→ vehicles`, `→ orders → customers` | `guias`, `tracking`, `SettlementModal` |
| `routes → drivers`, `→ vehicles`, `→ carriers`, `→ stores`, `→ route_types` | `tracking`, `rutas`, `dashboard`, `planificacion` |
| `settlements → routes → stores` | `liquidaciones`, `SettlementModal` |
| `app_users → roles` | `useAuth`, `UsersTab`, `UserModal` |
| `customers → countries` | `clientes` |

**El contrato de `drivers` está roto.** Cuatro variantes mutuamente excluyentes
del nombre del conductor conviven en el código:

| Variante | Ubicaciones |
|---|---|
| `drivers(full_name)` | `tracking/page.tsx:188`, `dashboard/page.tsx:31`, `planificacion/page.tsx:143`, `SettlementModal.tsx:126` |
| `drivers(name)` | `guias/page.tsx:59`, `SettlementModal.tsx:155` |
| `drivers(name, document)` | `liquidaciones/page.tsx:52` |
| `drivers(first_name, last_name)` | `reportes/page.tsx:232` |

A lo sumo una existe; las demás fallan de forma silenciosa en PostgREST.
`SettlementModal.tsx` usa **dos variantes dentro del mismo archivo** (líneas 126
y 155).

### Patrones de escritura

| Operación | Ubicación | Notas |
|---|---|---|
| `INSERT routes` | `planificacion/page.tsx:267` | `route_number` como `'RT-'` más `Date.now()`, `status` `'Planificada'` |
| `INSERT dispatch_guides` | `planificacion/page.tsx:288` | Una por pedido, `status` `'Pendiente'`; **sin transacción** |
| `UPDATE orders.status` | `planificacion/page.tsx:297` | Escribe `'Asignado'`; el listado de pedidos espera `assigned` |
| `UPDATE routes.status` | `tracking/page.tsx` | Escribe `'En tránsito'` y `'Completada'` |
| `INSERT tracking_events` | `tracking/page.tsx` | Evento de seguimiento por avance de ruta |
| `INSERT` masivo de catálogo | `CsvImportModal.tsx` | `from(tableName).insert(...)` por lote |
| `INSERT` de datos semilla | `seed/page.tsx` | 6 tablas, sin guarda de rol ni de entorno |

Las escrituras de `planificacion` se disparan con `Promise.all` **sin
transacción**: un fallo parcial deja rutas con guías incompletas y pedidos en
estado mixto, sin compensación. `route_number` y `guide_number` se generan con
`Date.now()` en el cliente, sin unicidad garantizada bajo concurrencia, y no hay
bloqueo optimista.

## Supabase Auth

6 métodos en uso:

| Método | Ubicación | Propósito |
|---|---|---|
| `auth.getSession()` | `src/hooks/useAuth.tsx` | Sesión inicial |
| `auth.onAuthStateChange()` | `src/hooks/useAuth.tsx` | Suscripción a cambios de sesión |
| `auth.signInWithPassword()` | `src/hooks/useAuth.tsx` | Inicio de sesión |
| `auth.signOut()` | `src/hooks/useAuth.tsx` | Cierre de sesión |
| `auth.getUser()` | 6 llamadas dispersas en `conductores/`, `paises/`, `tiendas/`, `transportistas/` | Resolución de usuario fuera del contexto |
| `auth.signUp()` | `configuracion/components/UserModal.tsx:103` | **Alta de usuario desde el cliente** |

`auth.getUser()` disperso y `auth.signUp()` desde el cliente son las dos
desviaciones a señalar: la primera duplica lo que ya resuelve el contexto de
sesión, la segunda coloca el alta de usuarios en el navegador.

## Superficies Supabase no utilizadas

- **Cero `supabase.rpc(...)`** — ninguna función de base de datos; toda la lógica
  de negocio vive en el navegador.
- **Cero `supabase.storage`** — no hay subida real de archivos; los documentos de
  contrato son URLs de texto libre en `contract_documents.file_url`.
- **Cero `supabase.channel`** y cero realtime — no hay suscripciones en vivo.
- **Cero `supabase.functions`** — no hay Edge Functions.

## Integraciones externas

| Integración | Naturaleza | Ubicación |
|---|---|---|
| Google Maps | **Enlace profundo**, no la API. `https://maps.google.com/maps?q=...` como `href` | `src/pages/tracking/components/MapView.tsx:92` |
| Remix Icon 4.1.0 | CSS por CDN de `cdn.jsdelivr.net`, no versionado en `package.json` | `index.html` |
| Documentos de contrato | URL como texto libre, sin almacenamiento propio | `contract_documents.file_url` |
| WMS | **No implementada.** El botón "Importar Pedidos" de `/pedidos` no tiene handler | `src/pages/pedidos/page.tsx` |

No hay librería de mapas en el proyecto (ni Leaflet, ni Mapbox, ni el SDK de
Google Maps) pese al módulo de seguimiento: `MapView` es una lista de paradas con
insignias.

## Importación de datos

`CsvImportModal` es el único mecanismo de entrada masiva implementado.

**Contrato de props**: recibe `tableName` y la definición de columnas con su tipo
esperado (`text | number | email | date | boolean`). Flujo en 3 pasos: plantilla
descargable, parseo en cliente con `FileReader` y validación por campo,
inserción por lote vía `supabase.from(tableName).insert(...)`.

**Consumidores (5 catálogos)**: `conductores`, `paises`, `tiendas`,
`transportistas`, `vehiculos`.

**No lo usan** `pedidos` ni el OMS: la entrada masiva de pedidos, que es la vía
natural de alimentación del OMS, no está implementada.

## APIs del módulo OMS

**Ninguna.** Las 5 pantallas de `src/pages/oms/` leen exclusivamente de
`src/pages/oms/mockData.ts` y hacen **cero llamadas a Supabase**.

Estado de las interacciones del prototipo:

| Interacción | Estado real |
|---|---|
| Botón "Recalcular" (`oms/cola/page.tsx`) | **Sin handler `onClick`** |
| Override manual de prioridad (`oms/cola/page.tsx:26-34`) | Solo muta `useState`; se pierde al recargar |
| Alta de regla (`oms/reglas/page.tsx:22-34`) | Solo muta `useState`; se pierde al recargar |
| Toggle activa/inactiva de regla | Solo muta `useState` |
| Simulador | Un único cambio codificado: `BOOST_RULE_LABEL = 'Producto perecedero'`, `BOOST_POINTS = 25` |
| `priority_score` | **Precomputado** en el mock; no hay motor de cálculo |
| Condición de regla | **Texto libre** (`condition: 'SI cliente.tier = VIP → +30 puntos'`), no estructura evaluable |

El override manual del prototipo es coherente con el hecho vigente del negocio:
la única intervención humana prevista es que el "Responsable del OMS" altere la
prioridad de un pedido puntual. **No hay** —ni debe haber— endpoint, pantalla ni
paso de aprobación previa al alistamiento; el cálculo de prioridad es 100 %
automático.

## Campos del esquema real relevantes para el OMS

**Reutilizables** por el OMS, ya presentes:

- `orders.priority` con `high | normal | low` según
  `src/pages/pedidos/page.tsx:53-57` — tres niveles ya existentes, **distintos**
  de los `alta | media | baja` del prototipo.
- `orders`: `delivery_date`, `order_date`, `total_weight`, `total_volume`,
  `total_amount`, `status`, `route_type_id`, `customer_id`, `store_id`,
  `delivery_zone`, `delivery_city`, `delivery_latitude`, `delivery_longitude`,
  `invoice_number`.
- `customers`: `delivery_zone`, `country_id`, `latitude`, `longitude`.
- `route_types`: `id`, `name`, `status`.
- `stores`: `is_origin`, `delivery_zone`, `store_type`.

**Vacíos del esquema real frente a lo que la Regla 1 exige** — sin estas tres
piezas la Regla 1 **no es implementable** contra el esquema actual:

1. No existe tabla ni columna que exprese **días de salida por ruta**, ni
   **excepciones por cliente**.
2. No existe la relación explícita **cliente ↔ ruta**; el código relaciona
   pedido ↔ `route_type_id`, no cliente ↔ ruta.
3. No existe `ready_to_prep_date` ni equivalente.

## Sources

- `src/lib/supabase.ts` — cliente único y tipo `Database`.
- `src/hooks/useAuth.tsx` — 4 de los 6 métodos de Auth.
- `src/pages/configuracion/components/UserModal.tsx:103` — `auth.signUp()`.
- `src/pages/planificacion/page.tsx:143,169,243-300` — consultas y escrituras de
  la cadena pedido a ruta a guía.
- `src/pages/tracking/page.tsx:188` y
  `src/pages/tracking/components/MapView.tsx:92` — join de conductor y enlace a
  Google Maps.
- `src/pages/guias/page.tsx:59`;
  `src/pages/liquidaciones/page.tsx:52`;
  `src/pages/liquidaciones/components/SettlementModal.tsx:126,155`;
  `src/pages/reportes/page.tsx:232`;
  `src/pages/dashboard/page.tsx:31` — variantes del join de `drivers`.
- `src/pages/pedidos/page.tsx:44-49,53-57` — vocabulario de estado y de
  prioridad.
- `src/components/feature/CsvImportModal.tsx` — contrato de importación.
- `src/pages/oms/` (8 archivos) — ausencia total de API en el prototipo.
- Barrido transversal: cada `.from('<tabla>')` y cada uso de
  `supabase.auth|rpc|storage|channel` en `src/`.
- `PLAN_MODULO_OMS.md` §6.2 — modelo de datos propuesto para el OMS.
- `aidlc/spaces/default/knowledge/documents/2026-08-26-reunion-oms-roles.md`,
  Adenda 2026-08-26 — ausencia de paso de aprobación.

## Assumptions & Open Questions

- El esquema real de la base de datos **no está versionado**; los nombres de
  columna citados se infieren de las consultas del código y pueden diferir de la
  base real. Ese es exactamente el mecanismo por el que existen las cuatro
  variantes del join de `drivers`.
- Cuál de las cuatro variantes de nombre del conductor es la correcta no puede
  decidirse sin acceso al esquema.
- No se pudo verificar la existencia ni el contenido de políticas RLS; el
  contrato de autorización efectivo es indeterminado desde este repositorio.
