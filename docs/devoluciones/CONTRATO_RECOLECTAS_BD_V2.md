# Contrato directo de recolectas BD v2

Actualizado el 2026-11-17. El usuario confirmó el acuerdo de Planificación y autorizó
renumerar y preparar las migraciones. **Nuestro lado está implementado localmente;
consumidor de Planificación y aplicación/publicación por Jean pendientes.**
No se hizo commit, push, despliegue ni DDL compartido.

La especificación operativa, SQL parametrizado, secuencia de transacciones, replan,
compatibilidad, pruebas y orden de publicación están en
[ENTREGA_PLANIFICACION_BD_V2.md](ENTREGA_PLANIFICACION_BD_V2.md).

## Esquema y operaciones

- SQL75: resolución de Novedades. SQL76: origen/saldo y `return_balance_76`.
  SQL77: contrato directo. Son reemplazos de las preparaciones no aplicadas de
  Devoluciones 71/72/73; los SQL aplicados 60–74 no se modificaron.
- `collection_contract_version=2` identifica solicitudes nuevas; `status` y
  `approval_mode` conservan su significado comercial. Los históricos no se convierten.
- Vistas: `vw_return_collection_candidates`, `vw_return_collection_assignments` y
  `vw_return_collection_item_balances`. El consumidor siempre aplica scopes autorizados.
- Operaciones: `record_return_collection_evaluation_v2`, `assign_return_collection_v2`,
  `bind_return_collection_v2` y `cancel_return_collection_v2`; firmas y ejemplos en la entrega.
- Cabecera `tbl_return_collection_allocations` posee solicitud, plan y ejecución;
  los artículos conservan asignación e intento inmutables. Estados: `planned`,
  `executing`, `pickup_closed`, `cancelled`. Una reserva activa por solicitud.
- Eventos causales referencian hechos de negocio, no outbox. Se retiraron escritor,
  rutas y recursos SAM de reclamar/acuse/reintento, sin crear usuario técnico.

## Invariantes

Origen autorizado y almacén del pedido capturados; magnitudes por línea/presentación,
con desconocidos `null`; solicitud completa en un viaje, reintento solo del saldo
no recogido. Se reutilizan cinco minutos estimados y la medición GPS existente de
150 m, separados entre sí. Los históricos incompletos quedan fuera de asignación.

Asignar reserva todos los artículos en una transacción antes de existir ruta/guía.
La capacidad se comprueba por tramo, con márgenes vigentes 85 %/95 %. El inicio web
y móvil vincula la parada exacta una sola vez. No se regeneran intentos al iniciar.
Cancelación futura conserva eventos y referencias originales, libera reserva y
elimina únicamente su parada nueva; no admite asignaciones iniciadas.

Recogida, entrega, Por recibir, recepción y Novedad son hechos distintos. El trigger
rechaza entregas precargadas y devoluciones físicas incompatibles con la recogida.
Resultados multiartículo se serializan por cabecera. El gate activo sigue bloqueando
por mercancía en tránsito, Por recibir u otra Novedad; el flag apagado conserva su omisión.

## Evidencia y límites

Aurora se inspeccionó en READ ONLY: PostgreSQL17.7, SQL69/70 y 71–74 registradas;
10 aprobadas, 18 pendientes de asignación y 4 rechazadas, todas legacy. No existían
orígenes, outbox, asignaciones/resultados nuevos ni resolución. No se escribieron datos.

Las pruebas usan PostgreSQL16.15 desechable y fixtures MOCK aislados. La captura
no inyecta pesos/volúmenes ficticios en producción. La evidencia local no sustituye
el consumidor externo ni una aceptación de QA en el ambiente publicado.

Jean verifica el preflight antes de aplicar 75,76,77. SQL77 detiene la aplicación si
aparece un contrato outbox v1 inesperado. Los rollbacks no borran historia usada ni
solicitudes v2. Tras aceptar hechos nuevos, se conserva una versión compatible.
