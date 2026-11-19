# Entrega a Planificación: recolectas directas en Aurora

Fecha: 2026-11-17. Rama local: `dylan-tarifas`, base `d380e497`, entrega preparada para commit local
sin push. **Implementado y probado localmente de nuestro lado; consumidor pendiente
del equipo de Planificación.** Las migraciones están preparadas, no aplicadas.

## 1. Qué está resuelto y qué implementan ustedes

Se eliminó el transporte de reclamar/lease/acuse/reintento y la dependencia del
outbox al crear solicitudes. No se requiere usuario técnico ni llamadas HTTP entre
Devoluciones y Planificación. La aprobación comercial no se reutiliza como estado
de evaluación o asignación.

De nuestro lado están preparados: persistencia directa, consultas de elegibilidad,
evaluación durable, asignación completa transaccional, cancelación futura, vínculo
con ejecución al iniciar desde web/móvil, resultados/evidencias/entrega, seguimiento
y gate. **No se modificó `backend/planning`.** Ustedes deben consultar elegibles,
elegir el viaje compatible y llamar a las operaciones descritas aquí.

El usuario confirmó este contrato y autorizó renumerar: 75/76/77 reemplazan las
preparaciones locales de Devoluciones que colisionaban con 71/72/73. No se tocan
las migraciones de Planificación ni los SQL60–74 ya aplicados.

## 2. Estado real de Aurora y orden para Jean

Inspección propia a través del túnel, `2026-11-17T12:37:24Z`, en transacción
`READ ONLY`, Aurora PostgreSQL 17.7:

- SQL69 y SQL70 están registradas; 71 vehículos, 72 corridas, 73 coordenadas y
  74 retención también. Ninguno de los tres paquetes siguientes está aplicado.
- No existen outbox, orígenes operativos ni tablas de asignaciones/resultados del
  contrato nuevo; tampoco existe la tabla de resolución de Novedades.
- Hay 10 solicitudes aprobadas, 18 pendientes de asignación y 4 rechazadas, todas
  `legacy`. No se convirtieron ni se modificaron esas filas.

Jean debe revisar el preflight `preflight_recolectas_bd_v2.sql` y aplicar en orden:

| Orden | Preparación | Dependencia y efecto |
| --- | --- | --- |
| 1 | `sql/75_return_incident_resolutions.sql` | Requiere SQL70; resoluciones auditadas y guards de salida de revisión |
| 2 | `sql/76_return_request_origin_balance.sql` | Origen inmutable, línea/presentación y función `return_balance_76` |
| 3 | `sql/77_return_collection_contract.sql` | Requiere 76 y el esquema vigente de planes/Tracking; contrato directo descrito abajo |

Cada archivo tiene su `_rollback.sql`. El 77 rechaza un ambiente que contenga
`tbl_return_request_outbox`: no sobrescribe un contrato v1 inesperadamente aplicado.
Si el preflight cambia respecto a este corte, detener y reconciliar antes de aplicar.
No usar `--force` ni reescribir checksums de migraciones ya registradas.

Publicación por Jean: esquema, backends admin/Tracking/móvil/Tarifas y web compatibles;
después el consumidor de Planificación. No publicar estos escritores/lectores antes
de 77. El APK conserva su payload de ejecución `schema_version:1`; es distinto de
`collection_contract_version=2` en la BD. El cliente antiguo que no conoce resultados
correlacionados conserva su rechazo `collection_version_required`, no una recogida inventada.

## 3. Reglas de negocio ya cerradas

- Recogida: punto autorizado del cliente final del pedido, conservado en snapshot.
- Retorno: almacén del pedido capturado; no el domicilio de la empresa ni otro
  almacén elegido por el navegador.
- Peso/volumen: por línea y presentación del pedido. Los fixtures usan exclusivamente
  valores MOCK aislados; no se insertaron valores falsos ni lotes en Aurora.
- Magnitud desconocida permanece `null`, nunca cero. Sin datos completos, no hay
  asignación automática. No se completan históricos por inferencia.
- Solicitud completa pendiente en un solo viaje. Un reintento posterior comprende
  solo cantidades no recogidas; no reserva de nuevo mercancía en tránsito.
- Tiempo previsto: cinco minutos por parada, conforme a la regla existente.
  Tiempo real: geocerca existente de 150 m; salida con histéresis de 200 m y filtros
  GPS existentes. No confundir estimación con permanencia medida.

## 4. Consulta de candidatos y alcance obligatorio

El backend debe exigir `planificacion.edit` y resolver organización, actor y scopes
desde el usuario autenticado. No confiar en esos valores enviados libremente por el
cliente. Las funciones son `SECURITY INVOKER`; no sustituyen los permisos del backend.

Con el `run` parametrizado de `tms_common.pg`, leer:

```sql
SELECT request_id, organization_id, customer_id, order_id, warehouse_id, country_id,
       snapshot, weight_kg, volume_m3, service_minutes, items
FROM vw_return_collection_candidates
WHERE organization_id=%s AND customer_id=%s AND warehouse_id=%s AND country_id=%s
ORDER BY request_id;
```

Los cuatro filtros se resuelven contra el alcance autorizado del plan. El resultado
contiene únicamente aprobadas v2 con snapshot completo, saldo positivo y sin reserva
activa. No incluye las 32 solicitudes históricas del corte ni las ya recogidas por
completo. Consultar no reclama: la operación de asignación vuelve a comprobar bajo bloqueo.

Campos relevantes:

| Campo | Uso |
| --- | --- |
| `request_id` | Identidad comercial estable; no generar otra solicitud al reintentar |
| `order_id` | Pedido original real; no fabricar uno para la devolución |
| `snapshot` | Dirección, coordenadas, punto, cliente final, almacén, país y zona capturados |
| `items` | JSON con `request_item_id`, `order_item_id`, `quantity` pendiente, `weight_kg`, `volume_m3` |
| `weight_kg`, `volume_m3` | Magnitud total del saldo elegible, no del pedido mixto completo |
| `service_minutes` | Cinco minutos estimados para la parada de esa solicitud |

Las magnitudes de `items` son cadenas decimales; los totales SQL son `numeric`.
Mantener `Decimal`, sin convertir presentaciones ni repartir un total de pedido
mixto entre productos. Para un saldo parcial, las magnitudes se prorratean desde la
línea original y se redondean hacia arriba a 0,01 kg y 0,0001 m³.

## 5. Evaluar y asignar: funciones disponibles después de 77

Todas devuelven un UUID (salvo el vínculo de una parada histórica, que devuelve NULL).
Los errores de dominio usan SQLSTATE `23514`; conflictos de unicidad `23505`.
Un mismo identificador con diferente contenido se rechaza. No tratar un error de
concurrencia/deadlock como «sin candidato»: usar el manejo transaccional del backend
para `40P01`/`40001` y conservar la clave del reintento técnico.

### Evaluación sin candidato o fallida

```sql
SELECT record_return_collection_evaluation_v2(
  %s::uuid, -- organización autorizada
  %s::uuid, -- request_id
  %s::uuid, -- app_user_id real del actor de Planificación
  %s::uuid, -- operation_id estable de esta evaluación
  %s::text, -- planning.no_candidate o planning.failed
  %s::text  -- causa no vacía, máximo 1000 caracteres
);
```

Repetir la misma clave/contenido no añade otro evento. Una evaluación nueva lleva
una clave nueva, por ejemplo un UUID derivado de solicitud y ejecución lógica de
Planificación. No usar el autor Cliente como falso actor de Planificación ni crear
un usuario técnico para un acuse que ya no existe.

### Asignación completa a un viaje futuro

```sql
SELECT assign_return_collection_v2(
  %s::uuid, -- organización autorizada
  %s::uuid, -- request_id
  %s::uuid, -- plan_trip_id futuro
  %s::uuid, -- plan_stop_id de tipo collection
  %s::uuid, -- app_user_id real del actor
  %s::uuid  -- operation_id estable: también allocation_id y evento de asignación
);
```

No recibe cantidades arbitrarias por artículo. Calcula y reserva todas las líneas
pendientes, genera `assignment_id`/`attempt_id` y devuelve `allocation_id`.
Si alguna parte falla, no queda ninguna reserva aceptada.

Secuencia requerida, dentro de una transacción:

1. Elegir viaje por organización, compañía, país, almacén y zona compatibles. Usar
   la zona/punto del snapshot, no recalcular desde la dirección original del pedido.
2. Bloquear `tbl_plan_trips` por ID y organización del plan con `FOR UPDATE OF t`.
   Rechazar viajes iniciados, cerrados o cancelados. La función también lo verifica.
3. Antes de crear la parada, comprobar si `allocation_id=operation_id` ya existe.
   Para un reenvío, reutilizar viaje/parada originales de `planned_snapshot` y llamar
   con las mismas identidades; no fabricar otra parada ni reactivar una cancelada.
4. Para una asignación nueva, crear una parada de identidad estable con `trip_id`,
   `order_id` real, `stop_type='collection'`, `return_id=NULL`, `es_cliente_retira=false`,
   posición, número de solicitud, cliente final/ciudad/zona del snapshot. Conservar
   su `plan_stop_id` en los reintentos técnicos. No crear ruta/guía de ejecución.
5. Llamar a `assign_return_collection_v2` antes de COMMIT. La función fija en esa
   parada peso, volumen y coordenadas desde el snapshot y comprueba capacidad.
6. Leer hijos desde `vw_return_collection_assignments WHERE allocation_id=%s` si
   se necesitan sus IDs. No volver a generarlos al iniciar o sincronizar el móvil.

La comprobación de capacidad recorre las paradas en `stop_order,id`: carga inicial
de entregas, descarga en cada entrega y carga en cada recolecta. Usa los márgenes
vigentes 85 % de peso y 95 % de volumen del vehículo. Una parada con magnitudes
desconocidas o un tramo que exceda capacidad rechaza la operación; no se sustituye
por cero. Planificación debe respetar además su calendario y duración de viaje.

Si falla el intento de asignar, hacer ROLLBACK de toda la transacción, incluida la
parada recién creada. Registrar el resultado de evaluación en una transacción nueva.
Una clave cuyo resultado final ya es `planning.failed` no puede reutilizarse luego
para `planning.assigned`: la siguiente evaluación usa otra clave.

## 6. Replan y cancelación

```sql
SELECT cancel_return_collection_v2(
  %s::uuid, -- organización
  %s::uuid, -- allocation_id
  %s::uuid, -- actor real
  %s::uuid, -- operation_id estable del hecho de cancelación
  %s::text  -- causa no vacía, máximo 1000 caracteres
);
```

Solo acepta `planned`. Conserva evento, cabecera y artículos/intentos; libera los
vínculos operativos y elimina únicamente su parada `collection` nueva. Los IDs
originales permanecen en `planned_snapshot` y en el evento. Después puede borrarse
el viaje futuro del replan sin romper FK ni borrar la historia de recogidas.

**Antes de la eliminación actual de planes/viajes no liberados**, Planificación debe
enumerar sus cabeceras planificadas y cancelarlas dentro de la misma transacción,
en orden de viaje/solicitud. Nunca usar CASCADE para saltar estas referencias. Un viaje
con ruta o una asignación `executing`/`pickup_closed` no se cancela por este camino.
Una nueva asignación usa nuevas claves e intentos y solo el saldo que vuelve a salir
como elegible. Una Novedad del almacén no devuelve mercancía a ese saldo.

## 7. Inicio y ejecución: ya adaptados de nuestro lado

Los inicios web y móvil bloquean el viaje antes de leer sus paradas. Tras crear
cada guía `collection`, llaman en la misma transacción a:

```sql
SELECT bind_return_collection_v2(
  %s::uuid, -- organización
  %s::uuid, -- plan_trip_id
  %s::uuid, -- plan_stop_id exacto, no solo order_id
  %s::uuid, -- route_id creada
  %s::uuid, -- dispatch_guide_id creada
  %s::uuid  -- actor real
);
```

El mismo pedido puede tener entrega y recolecta en el viaje: se correlaciona por
parada exacta, no por pedido. Una segunda vinculación idéntica devuelve la misma
cabecera; otro vínculo se rechaza. La ruta/guía se guarda en la cabecera, sin mutar
las identidades de los artículos/intentos.
Una guía solo puede pertenecer a una cabecera. Una parada `collection` nueva sin
`return_id` histórico ni asignación completa rechaza el inicio: no se degrada al
recorrido antiguo para inventar su recogida. Las paradas históricas con `return_id`
conservan su recorrido.

Estados de cabecera: `planned`, `executing`, `pickup_closed`, `cancelled`.
`pickup_closed` significa que todos los intentos tienen resultado, **no entrega ni
recepción**. Los resultados positivos requieren foto/firma propias de parada y
organización. No se puede insertar una recogida con enlaces de entrega precargados.
La entrega posterior exige evento causal y devolución física coincidente en
organización, pedido, línea, artículo, guía, cantidad y foto; queda **Por recibir**.
La recepción y la resolución de Novedades siguen siendo acciones independientes.

El gate activo cuenta tanto devoluciones abiertas como recogidas sin entregar.
Entregar mercancía no libera la liquidación mientras quede Por recibir/Novedad.
La bandera apagada conserva la omisión del gate. Los IDs de acciones offline y su
orden evidencia, recogida, entrega permanecen estables; no cambiar el APK para
inventar una recogida total ni cambiar su `schema_version` por este contrato de BD.

## 8. Evitar dos caminos para la misma recolecta

Mantener el recorrido histórico de `tbl_returns`, pero excluir de esa cola las
devoluciones físicas creadas por una entrega del contrato nuevo:

```sql
AND NOT EXISTS (
  SELECT 1 FROM tbl_return_collection_results cr WHERE cr.return_id=r.id
)
```

`r` es el alias existente de `tbl_returns` en la consulta histórica. No basta filtrar
por `request_item_id IS NULL`: excluiría registros históricos ajenos a este contrato.
Las filas físicas nuevas ya fueron recogidas y entregadas; agendarlas otra vez
duplicaría la recogida. Las solicitudes nuevas entran únicamente por la vista v2.

## 9. Pruebas que deben acompañar su consumidor

Ejecutar localmente `python tests/postgres/run_local.py` con Docker iniciado, pytest
y pg8000. El runner crea un PostgreSQL desechable publicado solo en loopback, guarda
logs sin credenciales y verifica su retirada. No usar el túnel/DSN de Aurora.
Los ejemplos de `tests/postgres/test_return_contract_direct.py` son exclusivamente
MOCK: pedido de 10 cajas, 25 kg y 0,5 m³, con IDs UUID generados por ejecución.

Además de las pruebas entregadas, su implementación debe demostrar:

1. Nueva solicitud elegible visible sin reclamar/lease/acuse ni usuario técnico.
2. Históricos incompletos fuera; scopes de otra compañía/país/almacén rechazados.
3. Sin candidato y fallo persistentes, con clave idempotente y causa real.
4. Dos planificadores: una asignación completa, ninguna reserva parcial al fallar.
5. Viaje futuro sin ruta; inicio web/móvil conserva todos los intentos.
6. Cancelación/replan antes de iniciar, sin borrado de historia; viaje iniciado intacto.
7. Recogida parcial 6/10: solo cuatro pueden reprogramarse, las seis en tránsito no.
8. Entrega repetida: misma devolución Por recibir; recepción/Novedad separadas.
9. La consulta histórica no vuelve a recoger `cr.return_id` del contrato nuevo.
10. Duración prevista y capacidad por tramo compatibles con su motor y calendario.

## 10. Verificación de publicación y retirada segura

Postchecks: existencia de las vistas/funciones anteriores, solicitudes nuevas con
`collection_contract_version=2`, candidatos dentro del alcance, evento/allocación
únicos y vínculos estables al iniciar. Las 32 filas legacy no deben cambiar por la
aplicación de 75/76/77. Las rutas HTTP de reclamar/acuse/reintentar-envío no deben
estar publicadas en la nueva versión.

Rollback antes del uso, por Jean: 77, 76 y 75 en ese orden. Los scripts rechazan
historial utilizado; 77 también rechaza solicitudes v2 aunque no tengan eventos.
Después de aceptar hechos, no borrar tablas ni volver a un escritor incompatible:
suspender nuevas asignaciones y conservar lectores/ejecución del contrato v2.

Esta entrega no equivale a desplegar ni a aprobar el recorrido completo. Pendientes
externos: aplicación/publicación por Jean, consumidor de Planificación y prueba real
coordinada web/dispositivo. El commit local fue autorizado por el usuario; el push queda a su cargo.

## 11. Evidencia local de esta entrega

- PostgreSQL 16.15 desechable: 56 pruebas aprobadas, sin omisiones; salida 0 y
  contenedor retirado. Evidencia: `.test/pendientes/evidencia-postgres-20261117-134843-fcb7392f/`.
- SQL67/68/69/70/75/76/77 en PGlite: 54 aprobadas, sin omisiones.
- Baterías previas del mismo trabajo: 364 backend, 172 backend móvil (23 omisiones
  previas por referencias compartidas ausentes), 146 web, tipos y lint focal aprobados.

Estas pruebas usan datos sintéticos locales. No acreditan publicación en Aurora ni
implementación del consumidor externo. Todos los archivos de esta entrega deben
acompañar el código al preparar la entrega para Jean; este Markdown por sí solo no
instala vistas ni funciones.
