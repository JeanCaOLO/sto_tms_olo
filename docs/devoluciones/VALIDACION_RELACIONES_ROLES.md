# Roles de Devoluciones — validación técnica T01

**Fecha: 2026-11-12. Resultado: relaciones técnicas comprobadas; implementación funcional pendiente.** Base local: `dylan-tarifas`, integración `b48928c`, con cambios locales ya existentes. Este documento concreta las decisiones D01–D05 sin desplegar, aplicar migraciones ni modificar datos reales.

## Fuentes y alcance de comprobación

- Grafo existente consultado con `customer store warehouse scope organization`, presupuesto aproximado de 850 tokens. Solo orientó la búsqueda; no se reconstruyó.
- Código vigente de solicitudes, usuarios, scopes, permisos y vínculo móvil guía/pedido.
- Aurora sandbox de cuenta `758837481569`, región `us-east-2`: catálogos, claves foráneas y **conteos agregados**, en `BEGIN READ ONLY`, `transaction_read_only=on`, con ROLLBACK. No se extrajeron nombres, correos, identificadores de usuarios ni filas de negocio.
- Túnel SSM temporal cerrado al terminar; no se insertaron datos de prueba.
- [Evidencia saneada de esquema y conteos](auditoria/2026-11-12/relaciones-roles.json). Script local repetible: `.test/devoluciones/auditar-relaciones-roles.mjs`, requiere túnel y variables locales; no imprimir el archivo de entorno.

La fotografía de datos refleja únicamente este sandbox a esta fecha; no certifica otros ambientes ni impide que se agreguen registros incompatibles después. Los controles deben ejecutarse en cada petición.

## D01 — Una empresa asignada por Cliente

**Relación existente:** usuario autenticado → `tbl_app_users.auth_user_id` → `tbl_app_users.customer_id` → `tbl_customers.id`.

- La FK `fk_app_user_customer` ya existe. `tbl_customers` representa las compañías operativas y tiene `organization_id`, `warehouse_id` y `country_id`.
- `admin_users._customer_for_role` exige empresa al rol Cliente y verifica su existencia; para otros roles elimina esa asignación del payload. No es un campo genérico de asignación del operador Devoluciones.
- `admin_return_requests._caller` ya obtiene organización/empresa desde el usuario autenticado; `tbl_return_requests.customer_id` conserva la empresa al crear la solicitud.
- En el sandbox hay **1 usuario Cliente**, con empresa existente y sin discrepancia de organización en la relación comprobada.

**Concreción para implementar:** reutilizar esa asignación para el destino fijo acordado en D01. No crear selector, catálogo paralelo de destinatarios ni otra tabla de asignaciones por la sola existencia de este plan. Validar en backend que la empresa sigue existiendo y corresponde a la organización autorizada; la comprobación actual de mera existencia no prueba por sí sola esa pertenencia.

Mantener el `customer_id` guardado en la solicitud como destino histórico. No redirigir solicitudes antiguas por cambiar el usuario. Esto identifica el destino operativo asignado al Cliente; no certifica propiedad de un producto real que todavía se captura manualmente.

**Fuentes:** [asignación por rol](../../backend/admin/src/admin_users.py), [identidad de solicitudes](../../backend/admin/src/admin_return_requests.py), [SQL de solicitudes](../../backend/admin/src/admin_return_requests_sql.py), `sql/64_devoluciones_solicitudes_cliente.sql`.

## D04 — Cada Cliente ve solo lo creado por él

El listado actual `MINE_SQL` ya combina `organization_id`, `customer_id` y `requested_by = app_user_id`. La ampliación a detalle y evidencias debe reutilizar esa autorización, no confiar en una llave S3 o en un ID enviado por el navegador.

La bandeja interna es una autorización distinta: un operador Devoluciones puede atender solicitudes dentro de su alcance aunque no sea su autor. Nunca reutilizar el filtro de autor del Cliente como filtro de la bandeja ni quitarlo de la vista Cliente para habilitar la bandeja.

No se concede acceso de un Cliente a otros autores de su misma empresa. La organización siempre se valida independientemente de la empresa y del permiso de acción.

## Alcance del operador Devoluciones

**Relación existente:** `tbl_user_scopes.app_user_id` → asignación con `customer_id`, `warehouse_id` y/o `country_id`; un scope con todos esos campos nulos es global explícito. Sin scopes, el resolver operativo existente deniega acceso.

- `backend/context/src/scopes.py` ya contiene la jerarquía país → almacén → compañía y las funciones `resolve_scopes`, `resolve_chain`, `covers` y `authorize`.
- `tms_common.permissions` valida el módulo/acción y países del rol; no contiene por sí mismo el alcance de empresa/almacén del usuario.
- En los datos comprobados hay **2 operadores Devoluciones**, con **3 scopes**: 2 por país y 1 global; ninguno sin scope. No hay scopes por empresa o almacén en esa muestra. Esto es configuración existente, no una autorización para asignar scopes nuevos automáticamente.
- `admin_returns._scope` filtra países del rol; no aplica `tbl_user_scopes` por empresa/almacén. Es una brecha funcional que debe cerrarse en los endpoints del alcance nuevo.

**Regla concreta del contrato:** permiso de acción **y** misma organización **y** países permitidos por el rol **y** cobertura por al menos un scope operativo asignado. Un scope global explícito no autoriza cruzar organizaciones ni anula una restricción de países del rol. No tener scope nunca equivale a global.

Reutilizar las tablas y semántica de scopes; el helper de acceso dentro de admin puede consultar esas relaciones sin importar código de otra Lambda que no esté incluido en su paquete. No cambiar la configuración real de los operadores durante las pruebas.

En la recepción física, filtrar **líneas y conteos**, no solo permitir ver una tarjeta de viaje. Que un viaje tenga una devolución autorizada no permite revelar otras compañías del mismo viaje ni crear formularios con líneas ajenas.

**Fuentes:** [scopes operativos](../../backend/context/src/scopes.py), [permisos](../../backend/common-services/layers/tms_common/tms_common/permissions.py), [filtro actual](../../backend/admin/src/admin_returns.py), [editor de scopes](../../src/pages/configuracion/components/ScopeEditor.tsx).

## D05 — Empresa receptora del contracamión

**La empresa no puede deducirse del viaje completo ni del almacén como regla general.**

| Comprobación agregada | Resultado |
|---|---|
| Almacenes operativos | 6: 1 sin compañía, 1 con una y 4 con varias |
| Viajes con guías | 75: 4 de una sola compañía y 71 con varias |
| Viajes con pedidos sin compañía en la relación comprobada | 0 |
| Devoluciones comprobadas | 29; todas con pedido, empresa del pedido y guía coherentes |
| Diferencias entre organización de devolución, pedido y compañía en esa muestra | 0 |

La relación inequívoca existente es **por devolución**:

`tbl_returns.dispatch_guide_id → tbl_dispatch_guides.order_id` y `tbl_returns.order_id → tbl_orders.customer_id → tbl_customers.id`.

Comprobar que ambas referencias de pedido coinciden, que la guía pertenece al viaje y que las entidades pertenecen a la misma organización. Obtener almacén/país operativos de la compañía/pedido para evaluar el scope autorizado; no confundir `tbl_stores` (sede del viaje) con `tbl_warehouses` (almacén operativo). Ambas tablas existen y `tbl_stores.warehouse_id` las relaciona.

**Ruling:** concretar D05=A mediante el pedido de la guía del viaje, a nivel de devolución; no elegir una compañía común al viaje/almacén. Motivo: la operación existente ya muestra `company_name` por pedido y los conteos demuestran viajes/almacenes multicompañía. Costo si se aplicara mal: exponer o recibir mercancía de otra empresa. Por eso falta/ambigüedad/inconsistencia debe impedir resolver un destino automático y generar un resultado controlado, sin inventar datos ni activar una selección manual no autorizada.

Esta concreción conserva la opción automática A del usuario, usando la relación operativa con mayor detalle. No usa el código simulado del producto ni la empresa transportista y no garantiza que un código capturado manualmente pertenezca a un catálogo real.

**Fuentes:** [guías móviles con compañía por pedido](../../backend/mobile/src/mobile_api/sql.py), [acceso a guía](../../backend/mobile/src/mobile_api/stops.py), `backend/admin/src/admin_returns_sql.py`, evidencia de FKs y conteos enlazada arriba.

## Estados y límites del contrato de roles

| Dimensión | Contrato para implementar |
|---|---|
| Aprobación de solicitud | Conservar el estado inicial histórico `pendiente_asignacion` como pendiente de revisión en UI; ampliar con `aprobada` y `rechazada`. Una decisión atómica sobre toda la solicitud, rechazo con motivo y auditoría. No reescribir estados históricos para preparar pruebas. |
| Transporte | Asignación, recogida/no realizada y reasignación son responsabilidad de Planificación/Tracking, manteniendo identidad de solicitud y artículos. No devolver a revisión comercial una solicitud por un intento de recogida fallido. |
| Recepción física | Registrar lo que efectivamente llega en devoluciones vinculadas. No marcar received por aprobar o asignar. Los faltantes de unidades dentro de una recogida son un caso separado: no cambiar automáticamente su regla de cierre/bloqueo. |
| Contracamión | Mantener el origen móvil sin exigir solicitud Cliente previa. Resolver compañía por guía/pedido y aplicar la autorización operativa. |

No hace falta añadir una relación de empresa paralela a la actual para la opción A. Sí siguen pendientes los estados/metadatos de decisión, los vínculos de recolecta y la lógica de acceso/recepción previstos en T03–T07.

## Invariantes para las pruebas siguientes

1. Cliente sin empresa, con empresa inexistente o de otra organización: solicitud rechazada de forma controlada, sin crear datos.
2. Cliente de la misma compañía pero distinto autor: no puede ver detalle ni evidencias de otra solicitud.
3. Operador con scope por compañía/almacén/país: accede únicamente a las líneas cubiertas; sin scope, denegado; global explícito, dentro de organización y límites del rol.
4. Un viaje con empresas A/B y operador autorizado solo a A: no expone líneas, totales ni formularios de B.
5. Dos devoluciones del mismo viaje con pedidos de compañías diferentes resuelven cada una su compañía, sin depender de que compartan sede.
6. Falta de pedido/compañía, contradicción guía/pedido o cruce de organización: no resolver un destino por defecto.
7. Aprobar/rechazar es atómico, auditable e idempotente según el contrato de T04; no equivale a recogida ni a recepción.

## Resultado T01 y siguiente tarea

**Actualización posterior del 2026-11-12:** T02 ya fue ejecutado y verificado: backend 83, frontend 59, tipos sin errores y build correcto; [evidencia](auditoria/2026-11-12/t02-verificaciones.json). El siguiente párrafo conserva el cierre original de T01. La próxima tarea vigente es T03 en `.test/pendienteCodex.md`.

T01 queda **verificado técnicamente**, no como aceptación humana ni como funcionalidad implementada. La evidencia permite pasar a **T02: recuperar una base verificable** (503 sin bucket y configuración/dependencias del chequeo de tipos). Después se preparará el esquema y la API local con estas relaciones, sin tocar el despliegue ni datos de negocio reales.
