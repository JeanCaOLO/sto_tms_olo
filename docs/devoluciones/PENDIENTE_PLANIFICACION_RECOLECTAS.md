# Pendiente: configurar Planificación para recibir recolectas solicitadas

**Estado:** pendiente de otro módulo, por solicitud expresa del usuario. **Responsable:** Planificación; despliegue por su responsable autorizado. Devoluciones prepara el contrato y pruebas locales, sin alterar la asignación de viajes desde su módulo.

## Qué debe recibir

Una solicitud nueva autoaprobada, con organización/empresa/país, autor, referencia original de orden/guía y ubicación autorizada, artículos y cantidades, evidencia por referencias e ID estable de solicitud. El mensaje necesita identificador de evento e intento para deduplicar. No incluir URLs firmadas largas como identidad de un archivo ni confiar en organización/autor enviados libremente por el navegador.

Los nombres finales de campos/ruta se acuerdan entre los módulos antes de implementar consumidores. El acuse debe distinguir «mensaje recibido», «viaje asignado» y «sin candidato»; ninguno confirma recepción de mercancía.

## Cómo implementarlo en Planificación

1. **Entrada y permisos:** definir un consumidor interno autenticado, restringido a su organización/scopes, para el evento de solicitud autoaprobada. Reutilizar el mecanismo de integración existente si cumple ese contrato; no exponer un endpoint público sin autorización.
2. **Entrega durable:** Devoluciones persiste solicitud/artículos y un outbox en una misma transacción. Planificación registra el ID de evento recibido y devuelve el mismo resultado ante reintentos. Los fallos de transporte conservan la solicitud pendiente; no se repiten envíos mediante un bucle sin backoff.
3. **Bandeja de trabajo:** hacer visible la recolecta recibida, con saldo por artículo y causa si no existe candidato. Emitir un acuse correlacionado para que Solicitudes pueda mostrar En Planificación.
4. **Elegibilidad y asignación:** reutilizar reglas de país, empresa, almacén, zona, ubicación y capacidad; elegir viaje futuro compatible y modificable. No insertar una parada en un viaje iniciado/cerrado ni asumir que la aprobación equivale a asignación.
5. **Parada de recolecta:** crear una parada `collection` asociada a la solicitud/artículo/intento y su saldo, sin duplicar una asignación activa. Entregar esos IDs a Tracking y devolver a Devoluciones el vínculo de viaje/parada.
6. **Ejecución:** consumir eventos aceptados de Tracking y actualizar cantidades/estado por intento. Mantener distinguida la captura offline pendiente del resultado confirmado por el servidor.
7. **Reasignación:** reintentar solamente la cantidad no recogida. Lo ya recogido, aunque no esté recibido en almacén, permanece en camino. Una novedad de almacén no vuelve automáticamente a la cola de recolecta.
8. **Incidencias:** registrar sin candidato, parada cancelada, recogida parcial/negativa y evento tardío. Conservar trazabilidad y un proceso de conciliación si ya existe otra asignación; no borrar el evento ni la cola móvil.
9. **Respuesta de seguimiento:** exponer estado/acuse/IDs/fechas y cantidades autorizadas para que Solicitudes muestre Planificación, Tracking y entrega real. Evitar que la web sondee tablas internas sin un contrato.

## Archivos de referencia para el responsable

- `backend/planning/src/recolectas.py`: comportamiento actual de recolectas; revisar compatibilidad antes de reutilizarlo.
- `PLAN_PLANIFICACION_RECOLECTAS_V2.md` y `ENTREGA_PLANIFICACION_RECOLECTAS.md`: propuesta y contrato histórico; este último no debe volver a exigir una aprobación manual para el flujo nuevo.
- `backend/mobile/src/mobile_api/stops.py`: ejecución móvil existente; ampliar correlación/evidencia mediante un contrato compatible.
- `backend/admin/src/admin_return_requests*`: solicitudes y alcance; no usar el rol/empresa del transporte como propietario de la mercancía.

## Verificación necesaria antes de habilitarlo

Pruebas de evento duplicado, caída después de persistir, ausencia de candidatos, país/empresa ajenos, capacidad insuficiente, viaje no modificable, recogida parcial, reasignación, evidencia y evento offline tardío. Probar que un mismo mensaje no duplica la parada y que una cantidad recogida nunca se vuelve a asignar.

Preparar checklist de configuración, permisos mínimos, flags, esquema, métricas y rollback para el responsable. **No activar el consumidor ni desplegar infraestructura desde esta sesión.** Hasta completar este pendiente, la web debe indicar Pendiente de Planificación; no mostrar una integración inexistente como operativa.
