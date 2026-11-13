# 08 — Pruebas reales pendientes de la auditoría

**Estado:** pendiente por verificar. Corte: 2026-11-12.

## Qué falta y por qué

Las suites locales y las capturas autenticadas de solo lectura no verifican escrituras concurrentes, permisos de otros roles, dispositivo móvil ni despliegue. Las cuatro capturas del 12 de noviembre están completadas; no volver a pedir conexión como si T8 no se hubiera realizado. La paginación integrada posteriormente aún requiere lectura real con PostgreSQL.

## Escenarios para el usuario en un entorno de prueba autorizado

1. Recibir parcialmente una devolución y verificar actor/fecha/cantidad. Intentar recibir la misma línea desde dos sesiones; no duplicar ni sobrescribir una recepción ya confirmada.
2. Crear dos formularios con conjuntos disjuntos. Intentar asignar simultáneamente la misma devolución; una operación debe fallar sin formulario parcial. Verificar esquema disponible antes del ensayo.
3. Con `TMS_RETURNS_GATE` ya configurado por su responsable, comprobar bloqueo de emisión con devoluciones pendientes y liberación después de recibir. No activar flags ni escribir en AWS desde el agente.
4. Validar país seleccionado, scopes, recepción/rechazo históricos, adjuntos y comprobante con roles autorizados de empresas diferentes. Probar teclado, foco, Escape y lector de pantalla; la heurística DOM no certifica accesibilidad.
5. En la app correcta, probar contracamión offline con foto, reintento y recepción. Para el futuro v2, añadir firma, parciales y eventos tardíos sin convertir una cola offline en recogida confirmada.
6. Probar APK nuevo: manifiesto con `allowBackup=false`, actualización, login/refresh/logout y conservación de acciones pendientes. El APK antiguo no demuestra cambios de configuración.

Registrar estado inicial, fixtures identificados, resultado y limpieza limitada a esos datos por su responsable. No enviar correo real ni crear solicitudes, recepciones o liquidaciones durante navegación de solo lectura.

Los escenarios heredados de Tarifas/Tracking y el resto de casillas de los bloques 1–6 se conservan en [el anexo](10-anexo-pendientes-previos.md). Su inclusión no representa ejecución ni aprobación.
