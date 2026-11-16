# 04 — Reglas 4B trasladadas al servidor

**Estado:** corrección implementada y probada localmente; concurrencia externa y defensa adicional de esquema pendientes. Corte: 2026-11-12. La autorización posterior del usuario permitió continuar con seguridad/integridad local, sin despliegue AWS.

## Correcciones

- Marcas: solo ANULADO/DIFERIDO, motivo no vacío para ANULADO, tipo de motivo validado y actor del servidor. INSERT, PATCH, `/tx` e insert_many comparten reglas. El PATCH de solo motivo comprueba la marca efectiva dentro del UPDATE; no puede borrar el motivo de una anulación.
- Ítems: amount, proforma_id y settlement_id inmutables; state válido y motivo al excluir; DELETE rechazado. El parent debe estar Borrador/En Revisión sin fases decididas. Debe conservar al menos una liquidación incluida; anular/reiniciar mantiene su flujo específico.
- Creación de ítems: importe, país y transportista deben coincidir con su liquidación/proforma. No se acepta un importe arbitrario aunque el navegador haya hecho un cálculo previo.
- Parent: identidad financiera inmutable después de crear; total derivado de los ítems, no del valor enviado por el cliente. Se conservan campos operativos permitidos, como notes y email_sent_at.
- Decidir y editar contenido toman el mismo `FOR UPDATE` de proforma. La decisión relee padre/fases/reclamo después del lock. La edición de ítem relee su estado después de esperar, para no validar una lectura vieja.
- Total y estado de las liquidaciones se sincronizan dentro de la transacción también en operaciones sueltas. No se depende de que el cliente acompañe el PATCH del ítem con el segundo UPDATE correcto.
- Inserción agrupada: locks/fases deduplicados por padre y liquidaciones consultadas en batch. El ensayo de 100 ítems pasó de 303 consultas en una versión intermedia detectada por revisión a **7 sentencias** en la corrección final, incluyendo sincronización y total. No es una medición de costo AWS.

## Prueba primero y revisión

Los logs locales conservan 15 fallos iniciales de marcas, 20 de contenido de proformas, dos de relectura/último ítem, 11 de identidad financiera/costo del batch y dos de sincronización de estado. Luego se ejecutaron las suites correspondientes y PostgreSQL en memoria para las sentencias reales. Hubo un error de fixture al preparar el exportador SQL; quedó corregido antes de la validación final, sin cambiar expectativas de producto.

La revisión independiente detectó y ayudó a cerrar identidad financiera modificable, N+1 nuevo y falta de sincronización del estado de liquidación. No se declara probado un bloqueo entre dos conexiones por haber usado PGlite; falta esa evidencia externa.

## Pendientes conservados

- Probar con dos conexiones PostgreSQL reales la carrera de edición frente a aprobación y transacciones que tocan varios padres. Se conservan rollback y reintentos por deadlock/serialización.
- Preparar/validar CHECK adicionales de esquema con preflight de datos existentes; no aplicar restricciones a una base compartida sin revisar esas filas. Los guards de código no dependen de esa migración futura.
- D4 de 4B sigue abierto: negocio debe decidir si una marca de pedido se bloquea cuando el viaje ya tiene liquidación vigente. La decisión sobre **Novedades** no responde esa otra pregunta.
- Pruebas reales de Tarifas, correo, otras decisiones y datos de Catálogos siguen en sus pendientes. No se hicieron envíos ni escrituras reales de esta auditoría.

No se hizo commit, push, despliegue ni cambio AWS de esta corrección. El registro de scripts/suites está en `TMS/.test/integracion_2026-11-12/` y su resumen portable en Devoluciones.
