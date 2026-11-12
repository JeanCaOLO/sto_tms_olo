# Flujo v2 de devoluciones

**Estado:** especificación funcional para revisión e implementación. No describe funciones ya implementadas ni autoriza migraciones compartidas o despliegues.

## Cambio respecto al flujo anterior

El rol antes llamado **Cliente** pasa a llamarse **Asesor de ventas**. La solicitud ya no se aprueba ni se rechaza en Devoluciones: al registrarse queda **en solicitud**, se entrega automáticamente a Planificación y espera una asignación de viaje. Planificación prioriza el viaje futuro elegible más cercano. Al recoger mercancía, el chofer registra cantidades y evidencias desde Tracking mobile. En almacén, el rol **Devoluciones** confirma físicamente la recepción.

Los documentos históricos que describen la aprobación/rechazo comercial (`CONTRATO_API_SOLICITUDES.md`, `ENTREGA_PLANIFICACION_RECOLECTAS.md`, `ESTADO_ACTUAL.md` y evidencias T04–T06) reflejan el diseño anterior. Se conservan por trazabilidad; esta especificación los reemplaza para el flujo futuro. No se deben interpretar como prueba de que v2 esté implementada.

## Estados visibles

| Estado | Significado y condición |
|---|---|
| **en solicitud** | Hay cantidad solicitada aún no asignada o pendiente de un nuevo viaje. Incluye solicitudes recién creadas y saldos todavía no recogidos. |
| **recolecta** | Existe asignación activa a un viaje y parada de recogida; la mercancía aún no tiene recogida confirmada por el servidor. |
| **en camino** | Se confirmó que el chofer recogió una cantidad mayor que cero y esa cantidad aún no se recibió en almacén. |
| **en almacen** | Toda la cantidad solicitada quedó recibida, acumulada por artículo. |

El estado de la solicitud es un resumen derivado del avance por artículo y cantidad, no un selector manual. Si una parte está en almacén y otra sigue sin asignación, se muestra el estado de la etapa pendiente más temprana y los contadores explican el avance. Ejemplo: de 10 unidades, 5 recogidas y recibidas y 5 aún sin recoger: estado **en solicitud**, con `5 recibidas / 5 pendientes de asignación`.

Cada artículo debe permitir consultar, como mínimo: cantidad solicitada, asignada al viaje activo, recogida confirmada, recibida acumulada y saldo sin recoger. No se permitirá recoger o recibir más que el saldo correspondiente. La historia conserva cada asignación, intento, evento móvil, recepción y corrección; un estado agregado puede avanzar o retroceder cuando cambie la etapa pendiente, pero el historial no se borra.

## Recorrido principal: recolecta

1. **Asesor de ventas** crea la solicitud para su empresa, selecciona una orden/guía original autorizada que permita identificar al cliente final y la ubicación de recogida, e ingresa productos, cantidades, motivo, descripción y evidencias. El código de producto puede seguir siendo manual mientras no exista integración con catálogo.
2. La solicitud se guarda y se hace visible automáticamente para Planificación. La confirmación de captura significa “solicitud registrada y en cola”, no “viaje asignado”. Una falla o reintento no debe duplicar solicitudes ni eventos de planificación.
3. **Planificación** selecciona un viaje futuro compatible y elegible. Si no hay candidato, conserva la solicitud en **en solicitud** con motivo consultable y la vuelve a intentar al aparecer un viaje elegible.
4. La solicitud asignada aparece como parada **recolecta** en el viaje. El chofer ve los artículos y saldos pendientes de ese intento.
5. En el lugar, el chofer reporta cantidad realmente recogida, nota/incidencia cuando corresponda, foto de la mercancía y firma. Solo una confirmación aceptada por el servidor produce el estado **en camino** para esa cantidad. Una captura aún en la cola offline no cuenta como recogida confirmada.
6. Al arribar la mercancía al almacén, **Devoluciones** registra la cantidad recibida mediante el checkbox/acción de recepción y confirma. La operación debe permitir recepción parcial, quedar auditada y mostrar el saldo faltante. El estado será **en almacen** solo cuando todo el saldo de todos los artículos esté recibido.
7. Si el viaje no recogió todo el saldo, Planificación vuelve a asignar únicamente la parte no recogida. Una cantidad que el chofer ya confirmó como recogida, aunque todavía no haya llegado al almacén, no se vuelve a buscar en el cliente.

## Contracamión

Las devoluciones que el chofer registra como **contracamión** se mantienen en la misma bandeja y en el mismo control de recepción. No requieren una solicitud previa del Asesor de ventas ni una asignación de Planificación: al confirmarse el registro físico en Tracking mobile entran directamente a **en camino**. Devoluciones registra la cantidad que llegó; si llega parcialmente, el saldo continúa abierto y se conserva la causa/incidencia. La empresa propietaria se determina por la relación coherente entre devolución, guía y orden, nunca por asumir que todo el viaje o almacén pertenece a una empresa.

## Roles y límites

| Rol | Puede hacer | No debe hacer |
|---|---|---|
| Asesor de ventas | Crear solicitudes para su empresa; consultar las propias; adjuntar evidencias. | Aprobar/rechazar, asignar viajes o confirmar recepción de almacén. |
| Planificación | Ver solicitudes pendientes dentro de sus scopes; asignar/reasignar cantidades pendientes a viajes compatibles; resolver excepciones de ruta. | Crear recepciones físicas o tratar un registro móvil pendiente de sincronizar como no realizado. |
| Chofer | Ver las paradas asignadas; informar cantidades, evidencia y resultado desde Tracking mobile. | Confirmar recepción en almacén o recoger saldos ya recogidos por otro intento. |
| Devoluciones | Ver la bandeja autorizada; confirmar cantidades que físicamente llegaron; registrar diferencias e incidencias. | Aprobar/rechazar solicitudes o planificar viajes. |

## Reglas transversales

- Respetar organización, empresa, país, almacén y scopes existentes. Un permiso de acción no concede acceso a datos fuera del scope.
- Usar identificadores estables para solicitud, artículo, asignación/parada e intento móvil. Hacer idempotentes captura, asignación, eventos y recepción.
- No fabricar una aprobación para satisfacer una regla histórica ni crear devoluciones físicas antes de una recogida positiva confirmada.
- Mantener legibles los registros históricos y separar su interpretación del nuevo flujo; decidir una reconciliación explícita antes de migrar solicitudes antiguas.
- Guardar autor y fecha para creación, asignación, ejecución, recepción y corrección. Corregir mediante evento compensatorio auditado, no borrando evidencia.
- No cambiar la compuerta de facturación/contabilidad de devoluciones físicas sin comprobar su contrato vigente.

## Criterios de aceptación del flujo

1. Una solicitud válida del Asesor de ventas queda visible para Planificación sin acción de aprobación de Devoluciones.
2. Con candidatos, se asigna al viaje futuro compatible más cercano; viajes iniciados/liberados/no modificables quedan excluidos. Sin candidato, se conserva en **en solicitud** y se reintenta sin duplicados.
3. La app del chofer presenta la parada y saldos asignados; cantidad y evidencia son obligatorias según el contrato móvil. Solo confirmación del servidor avanza a **en camino**.
4. Se puede recibir una parte, sin marcar todo **en almacen** antes de completar cantidades.
5. La cantidad ya recogida pero aún no recibida jamás vuelve a la cola de recolección.
6. Contracamión entra directamente a la misma bandeja de recepción como **en camino**.
7. Se retienen historial, aislamiento por roles/scopes e idempotencia ante reintentos y eventos móviles tardíos.

## Planes de trabajo

- [Plan del módulo Devoluciones](PLAN_DEVOLUCIONES_V2.md)
- [Plan de Planificación y recolectas](PLAN_PLANIFICACION_RECOLECTAS_V2.md)

