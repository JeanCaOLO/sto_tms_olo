# Captura de recolectas para el contrato directo de BD

Fecha de captura: 2026-11-16. Actualizado el 2026-11-17: el usuario confirmó el
acuerdo de Planificación y autorizó reservar/renumerar las preparaciones SQL75–77.
Este documento describe la captura implementada y los requisitos de su consumidor.
El código local ya sustituyó HTTP; no está publicado ni las migraciones aplicadas.
La entrega ejecutable para su consumidor está en `ENTREGA_PLANIFICACION_BD_V2.md`.

## Reglas confirmadas

- Recoger en el punto autorizado del cliente final relacionado con el pedido.
- Retornar al almacén del pedido. El cliente no puede cambiarlo en el payload.
- Usar peso y volumen existentes de los productos en su presentación del pedido.
- Asignar la solicitud completa a un solo viaje. Una recogida parcial o fallida
  permite reprogramar exclusivamente el saldo no recogido.
- Estimar cinco minutos por parada antes del viaje, conforme a la regla existente,
  decisión confirmada por el usuario al aprobar el plan. El consumidor externo
  debe conservar esa estimación separada de la duración real.
- Medir permanencia real desde la entrada al radio de 150 metros. Esa lógica ya
  existe: Tracking/móvil calculan entrada, salida y permanencia por las horas de
  posiciones GPS válidas. La salida usa 200 metros de histéresis y se descartan
  pasadas breves conforme a las reglas existentes. No se modificó ese comportamiento.

## Persistencia implementada

La creación conserva organización, empresa y autor del servidor. Después de bloquear
el pedido autorizado, toma sus líneas con `FOR SHARE`, consulta el saldo consolidado
y crea solicitud, origen, artículos y adjuntos en la transacción existente.

`tbl_return_request_origins.snapshot` conserva sus claves anteriores y añade
`planning`. No requiere columnas nuevas ni renumerar una migración para esta parte.
El origen sigue siendo inmutable por el trigger existente. Los reintentos ya
aceptados devuelven la solicitud anterior sin recalcular ni alterar su snapshot.

Ejemplo sintético: se solicitan 4 cajas de una línea de 10 cajas que pesa 25 kg y
ocupa 0,5 m³. Los identificadores siguientes son exclusivamente de ejemplo.

```json
{
  "planning": {
    "assignment_policy": "whole_request",
    "return_warehouse_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "capacity_source": "order_items",
    "capacity_complete": true,
    "weight_kg": "10.00",
    "volume_m3": "0.2000",
    "items": [{
      "order_item_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "product_code": "ART-1",
      "presentation": "CAJA",
      "source_quantity": 10,
      "requested_quantity": 4,
      "source_weight_kg": "25.00",
      "source_volume_m3": "0.5000",
      "weight_kg": "10.00",
      "volume_m3": "0.2000"
    }],
    "missing_data": []
  }
}
```

Las magnitudes se transportan como cadenas decimales para conservar precisión.
La fuente es `tbl_order_items.weight`, `.volume`, `.quantity` y `.presentation`,
importadas por `backend/planning/src/ingest_items.py` desde el detalle eFlow.
`weight` y `volume` son totales de esa línea: se multiplica por la cantidad solicitada
y se divide por su cantidad original. No se divide el peso total de un pedido
mixto ni se agrupan presentaciones distintas por compartir código de producto.

Se usa `Decimal`, redondeando hacia arriba a la precisión de las columnas de origen:
0,01 kg y 0,0001 m³. Si varias filas de captura señalan la misma línea, se acumula
su cantidad antes de calcular para evitar doble redondeo. El total suma las líneas.

Una magnitud ausente, no finita o no positiva permanece `null`; la cantidad de
origen debe ser entera positiva y la presentación debe existir. `missing_data`
identifica línea y campos pendientes. Cada total desconocido permanece `null`,
aunque su otra magnitud sea conocida. `capacity_complete=false` significa que
ese snapshot no acredita capacidad suficiente; no significa cero carga.

Los datos incompletos no impiden registrar la solicitud comercial, pero el consumidor
directo no debe asignarla automáticamente mientras falten datos operativos válidos.
No se recalculan silenciosamente snapshots históricos: su corrección requiere un
procedimiento acordado con trazabilidad, pendiente de ese contrato.

## Contrato de asignación que falta integrar

La captura registra `whole_request`; SQL77 implementa la reserva completa y las
rutas HTTP v1 se retiraron del código. El consumidor externo debe usar las
operaciones y consultas exactas de la entrega. Sus obligaciones son:

1. Validar organización, empresa, país, punto y almacén contra el alcance autorizado.
2. Bloquear pedido y solicitud en orden estable; calcular todos los saldos y verificar
   ausencia de otra asignación activa antes de reservar la solicitud completa.
3. Asignar todas sus líneas pendientes a un mismo viaje/parada planificados, con
   cantidades calculadas por el servidor. Rechazar repartos planificados entre viajes.
4. Mantener solicitud, artículo, asignación e intento estables. Una ruta o guía real
   no es requisito para el viaje futuro; se vincula al iniciar, una sola vez.
5. Reintentar únicamente el saldo no recogido, sin volver a reservar lo recogido que
   sigue en camino al almacén ni reabrir recogidas por una Novedad de recepción.
6. Registrar evaluaciones reales y causas de falta de candidato o fallo. La aprobación
   comercial o este snapshot no acreditan que Planificación haya evaluado o asignado.
7. Mantener recogida, entrega al almacén, estado **Por recibir**, recepción y resolución
   como hechos separados con identidad, evidencia e idempotencia persistentes.

La duración GPS medida después de llegar no sustituye la estimación anterior al
viaje. El usuario confirmó reutilizar cinco minutos por parada. La forma de aplicar
esa estimación al viaje futuro está descrita en la entrega a Planificación; no se
introduce un tiempo cero ni otro valor nuevo.

## Dependencias para sustituir HTTP

Los identificadores se renumeraron a 75/76/77 con autorización expresa del usuario.
El esquema/registro efectivo se inspeccionó en solo lectura. La colisión anterior está documentada en
`docs/work/2026-11/2026-11-16-reconciliacion-numeracion-sql-devoluciones.md`.

SQL77 ya no crea outbox ni referencia su transporte: conserva causalidad entre
hechos, asignación completa, vínculo planificado→ejecución y lectores. El código
dejó de llamar `enqueue` y se retiraron sus rutas SAM. Jean aplica/publica el nuevo
esquema y código antes de activar el consumidor externo; no se modificó Aurora.

La validación local no acredita publicación ni aceptación en Aurora, web o APK.
La tarea 10 conserva pendiente la integración con el consumidor externo y el
recorrido publicado; los fixtures del contrato local ya están preparados. La tarea
11 permanece sin reclamar. El consumidor de `backend/planning` sigue fuera del alcance.
