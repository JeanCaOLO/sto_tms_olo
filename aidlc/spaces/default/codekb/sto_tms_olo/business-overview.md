# Visión de negocio — STO / TMS OLO

> Ingeniería inversa **re-corrida el 2026-09-30** contra el código REAL de la
> rama `oms` (backend Python/Lambdas/SAM + frontend React 19), tras el pivote de
> reemplazo del WMH. Reemplaza el análisis previo, que estaba anclado al
> prototipo React+Supabase (ya NO es el target). Cada afirmación se sostiene en
> código leído.

## Qué es el sistema

`sto_tms_olo` es un **TMS (Transportation Management System) multi-país** para
O Logistics (OLO), sobre **Aurora PostgreSQL** en AWS (`us-east-2`,
`db-tms-olo`). El sistema tiene módulos interdependientes que comparten un
núcleo de datos (pedido, ruta, transportista, vehículo, conductor) y se
organizan alrededor del ciclo de vida del pedido.

Módulos de negocio presentes hoy (evidencia: `src/pages/` y
`backend/data/src/table_modules.py`):

- **OMS (Order Management System)** — `src/pages/oms/`: panel, cola de
  priorización, motor de reglas, simulador, rutas-despacho, auditoría, con un
  **motor de priorización** en `src/pages/oms/engine/priorityEngine.ts`. Los
  módulos de permiso existen como `OMS_MODULES = (oms.panel, oms.cola,
  oms.reglas, oms.simulador, oms.rutas, oms.auditoria)`.
- **Planificación** — `src/pages/planificacion/` (motores de armado de viaje) +
  `backend/planning/` (endpoint de insumo).
- **Tarifas / Liquidación** — `src/pages/reglas-tarifa/`,
  `src/pages/liquidaciones/`, `src/lib/tarifas/`, `src/lib/liquidador/`.
- **Catálogos / maestros** — países, zonas, transportistas, vehículos,
  conductores, licencias, clientes, puntos de entrega, contratos.
- **Administración** — usuarios, roles, matriz de permisos, auditoría
  (`backend/admin/`, `src/pages/configuracion/`).

## El pivote: OMS + Planificación reemplazan el WMH

Decisión firme (`project.md` `## Decided`, 2026-09-29): el **OMS y Planificación
reemplazan al WMH (Control Tower) desde la salida**, no de forma progresiva. El
WMH actual (Control Tower v4.18.4.4, Angular/AG Grid, BD `EFLOW_OLO`) está
especificado en `docs/wmh-actual/` (indexado en DocumentKB). Su función central
—planificar y controlar viajes de distribución, motor "Nuevo Viaje"— se reparte
entre el OMS (órdenes) y Planificación (viajes).

## Posicionamiento OMS ↔ Planificación (ciclo del pedido)

Confirmado en `backend/planning/src/app.py` y `backend/README.md`:

1. **Ingreso**: los pedidos entran desde el WMS/EFLOW (o su réplica cuando
   exista). El reemplazo del WMH NO cambia el ingreso.
2. **OMS**: lee los pedidos, aplica reglas (fecha T-1, observaciones/IA, cliente
   retira), calcula prioridad numérica invertida por score, y deja el pedido
   **"alistado"** — situación `GENE` sin viaje WMH asignado — en la tabla
   staging `wms_expediciones` (Aurora). El OMS **no escribe fechas**: lee
   `fecha_planificada` (fecha de entrega comprometida) del WMS.
3. **Planificación**: consume el alistado vía
   `GET /api/v1/planificacion/pedidos?fecha_entrega=YYYY-MM-DD` (default =
   mañana, hora Costa Rica), agrupa por destino y arma viajes asignando
   vehículo. Con el pivote y el mandato de Jean Carlo, evoluciona a **ruteo
   dinámico multi-fuente** ("la ruta manda").

## Actores (roles del OMS/TMS)

Del RBAC real (matriz módulo×acción, `sql/15`, `backend/admin/`): roles
administradores (SuperAdministrador, SuperUsuario, Administrador, Admin) con todo
por código; roles operativos con permisos `view/create/edit/delete/export` por
módulo y países visibles. En el dominio del OMS: Responsable del OMS (monitorea
el motor, ejerce el override manual —única intervención humana sobre el
cálculo—), Administrador de Módulo (configura el catálogo de reglas),
Jefe de Almacén (visibilidad/reportería), Operador de Despacho.

## Multi-país / multi-compañía

El aislamiento es por **scope país → almacén → cliente** (RBAC con
`user_scopes`), no por compañía. Cofersa y EPA son **clientes** (`customers`) de
un almacén, no silos de despliegue. Todo se filtra por el scope del usuario
(fail-closed). Ver `architecture.md` § Multi-tenancy y el DECIDED de
multi-compañía (SUPERSEDE, 2026-09-29): reglas con scope
CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL en Lambdas compartidas.

## Fuera de alcance / a futuro

- Integración Bedrock para observaciones (IA): **no está en el código**, es una
  historia futura (US12).
- EFLOW en vivo: hoy en modo mock; live requiere red a los SQL Server de EFLOW.
- Motor de reglas en backend: hoy la lógica madura vive en TS de frontend
  (`src/lib/tarifas/`, `priorityEngine.ts`); portarla al backend es pendiente
  (decisión C2, abierta).

## Sources

- `backend/README.md` — pivote, mapa Express→Lambda, EFLOW mock, planificación.
- `backend/planning/src/app.py` — posicionamiento OMS→Planificación,
  `wms_expediciones`, gap peso/volumen.
- `backend/data/src/table_modules.py` — módulos de negocio y OMS_MODULES.
- `src/pages/oms/`, `src/pages/planificacion/`, `src/lib/tarifas/` — módulos.
- `aidlc/spaces/default/memory/project.md` (`## Decided`) — pivote D1–D5,
  mandato de Jean Carlo, multi-compañía por scope.
- `docs/wmh-actual/` (indexado en DocumentKB) — el WMH que se reemplaza.

## Assumptions & Open Questions

- La réplica de `EFLOW_OLO` aún no existe (dependencia externa). El ingreso real
  de pedidos depende de EFLOW live.
- El reparto fino WMH → módulos (qué pantalla/función a cada uno) es tarea de
  diseño (D2), a cerrar en requirements/domain-design.
