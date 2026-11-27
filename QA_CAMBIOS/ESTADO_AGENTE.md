# Estado del agente corrector

Inicio de sesión **EN CURSO** desde 2026-11-27 17:16:02 -04:00.
Identificador de sesión: 01a21ec4-ada0-7780-bbb5-07bf97c52427.
Entorno: Windows y PowerShell, con clon TMS de Josef. Rama de código: josef (2f47c06775bfef382bf6a32b2c3b55c58b6f9525).
Canal de coordinación: origin/dylan-tarifas, base 79158744d31e76f870d03eadd8a7fa6c4e9b1137.

| ID | Estado | Responsable | Inicio real | Cambios y pruebas | Bloqueo / siguiente paso |
|---|---|---|---|---|---|
| TMS-QA-001 | EN CURSO | Corrector | 2026-11-27 17:16:02 -04:00 | Diagnóstico por IDs confirmado en Aurora. | Probador y Jean deben coordinar el retiro de acceso. Pendiente verificar S3 y obtener el helper original. |

El retest y la aprobación humana permanecen pendientes.

## TMS-QA-001 — diagnóstico del 2026-11-27 17:22:40 -04:00

- Consulta con `rtk proxy python -`, Aurora en transacción `BEGIN READ ONLY` y cierre con `ROLLBACK`, salida 0. Los dos usuarios QA siguen activos y asociados a sus credenciales. Existen dos credenciales y el chofer QA está vinculado a uno de esos usuarios.
- Una devolución coincide con el pedido, la guía y una de las líneas publicadas. Coincidencias en esa fila por ruta directa: 0. El probador confirmó en 2321bec que tbl_returns carece de route_id. El helper omite el DELETE al buscar esa columna. La devolución recibida 954aed29-67ce-439d-9f3d-03f01610f846 conserva la referencia a la línea. El error previo de `tbl_returns_order_item_id_fkey` consta en HALLAZGOS.
- Persisten tres referencias de evidencia. Las claves coinciden con el marcador, el pedido, la guía y la ruta del fixture. `aws s3api head-object` devolvió salida 253 para foto de factura, foto de devolución y firma por falta de credenciales disponibles en esta sesión. La existencia de los objetos sigue sin verificar.
- Cambios: solo `QA_CAMBIOS/ESTADO_AGENTE.md`. Sin cambios de código, datos ni objetos. El generador no se ejecutó.
- El probador debe confirmar el fin de uso de ambas cuentas. Jean debe coordinar el retiro por los IDs publicados y verificar que queden inactivas y sin sesiones utilizables.
- El probador debe compartir el helper original y su error sanitizado. El corrector preparará la regresión en BD aislada. Antes de operar sobre S3, el helper debe validar el manifiesto y descubrir dependencias por línea, guía y ruta. El retiro en BD debe respetar restricciones e historial. Tras confirmar y verificar la transacción SQL, puede ejecutarse el retiro autorizado en S3 por clave. Registrar el resultado por objeto para reintentar errores de S3 sin repetir el retiro SQL.
- Retest independiente: verificar estado de las cuentas y sesiones por ID. Reproducir en BD aislada una devolución por guía y línea omitida por ruta directa y confirmar que una dependencia bloqueante impide tocar S3. Comprobar las tres claves de evidencia con el acceso autorizado.
- Mobile: pendiente lectura y acuse en `origin/QA`. `git ls-remote` salió con 128 al pedir autenticación en TRACKING_TMS. La base `db3fc68` no está en el clon local.

## TMS-QA-001 — reanudación 2026-11-27 17:38:30 -04:00

El probador confirmó en 913c3e0 que las dos cuentas QA ya no se usan y entregó el helper sanitizado. Su consulta S3 del commit 7fed04a verificó que no quedan versiones ni marcadores de borrado para las tres claves exactas. Se retoma el retiro de acceso por los IDs publicados, la inspección de dependencias y la corrección local del helper. No se recreará el fixture ni se intervendrá la cola histórica de Tracking.
