# Tracking · Paradas que no se veían en el detalle + rendimiento de polling y render

Fecha: 2026-10-30. Base: logs del navegador en `.test/cambios_tracking_30-10-26/` (consola + HAR) y diagnóstico SQL en Aurora.

## Bug: "no tiene paradas" en el detalle mientras la barra decía "1 de 5"
- **Causa.** La barra del panel sale de `GET /viajes` (conteo de `dispatch_guides`) y las paradas de `GET /viajes/{id}`. Ese segundo endpoint daba **500 en el 100 % de los intentos** del viaje abierto: `_detail` firmaba una URL de S3 por evidencia y `os.environ["TRACKING_BUCKET"]` no existía en el servidor local (`KeyError`). El viaje con una parada fallida tiene evidencias, por eso fallaba solo ese. En AWS la variable sí existe.
- **Arreglo.** (1) `_evidence_url`: si firmar falla (bucket, S3 o red) la evidencia queda con `url: null` + `log.warning`, y el detalle sigue cargando. (2) `serve.py` define `TRACKING_BUCKET` por defecto en local. (3) `GUIDES_SQL` pasa de `JOIN orders` a `LEFT JOIN orders`: una guía sin pedido contaba en la barra pero no salía en la lista. (4) El panel avisa "No se pudieron cargar las paradas" si el detalle llega vacío con progreso > 0.
- **Datos reales.** Consulta de solo lectura: las 5 guías de la BD tienen pedido válido (0 sin `order_id`, 0 huérfanas). El `LEFT JOIN` es defensivo, no corrige datos existentes.

## Rendimiento (costo, velocidad, baja gama)
- **Diagnóstico** (`.test/cambios_tracking_30-10-26/explain_tracking.sql`, solo lectura): todas las consultas de tracking ejecutan en < 3 ms en la BD; cada ida y vuelta por el túnel cuesta 85-140 ms. Un poll de `/viajes?include=summary` hacía ~12 consultas secuenciales (~1.1 s de red). No hacen falta índices ni migración.
- **Polling 5 s → 10 s** (`api.ts`): el chofer reporta cada ~30 s; el 75 % de las llamadas a `/api` eran los dos polls con respuesta idéntica.
- **KPIs reutilizan la lista** (`_kpis`): si la página trae todos los viajes activos (sin búsqueda ni página siguiente), el resumen se calcula con esas filas en vez de repetir lista y lote (~5 consultas menos por poll). Solo "completados hoy" sigue siendo consulta aparte.
- **Menos re-render** (`hooks/share-structure.ts`): cada respuesta conserva las referencias de lo que no cambió; `ViajeCard` y `ParadaItem` son `memo`; el "ahora" de las antigüedades se recalcula con los datos y cada 30 s.

## Descartado
- `ETag`/304 en `/viajes`: beneficio pequeño (respuestas de ~2 KB) frente a tocar el contrato y `apiFetch` compartido.
- gzip en `/choferes`: ya se comprime solo lo que pasa de 1 KB; ahí son 284 bytes.
- 404 de `alerts/expirations` en local: `backend/alerts` no exporta `ROUTES`, registrarlo exige tocar otro módulo; el Header lo captura y en AWS existe.
- App del conductor (`TRACKING_TMS`): sin cambios. Ya bloquea acciones en viajes `planned` y usa caché offline, `staleTime` 30 s y reintentos acotados.
- Bloque de arranque (`me/context`, `countries`, `warehouses`, 6-14 s, pedido 3-4 veces): es de todos los módulos, fuera de Tracking.

## Merge con `dylan-tarifas`
Conflictos en `backend/tracking/src/app.py` y `backend/tests/test_tracking.py`; se mantuvieron ambos lados: `_evidence_url` ahora recibe la evidencia completa y firma con `evidence_bucket(storage_bucket)` (bucket de la app del chofer, sql/54) dentro del mismo `try`; `_kpis` conserva los KPI nuevos `deliveries_*` de la rama. Los tests de `/recorrido` se descartaron porque la rama quitó el replay. La migración `sql/54` ya estaba aplicada en Aurora (las columnas e índices de `tracking_evidences` aparecen en `pg_indexes`).

## Verificación
- Back: `pytest backend/tests` sin `test_realtime` (necesita `botocore`, no instalado) 483 pasan.
- Front: `tsc` sin errores, `vitest run src/pages/tracking` 64 pasan.
- Navegador (backend local + Aurora): viaje `VJ-20261029-91FD7E11` muestra 5 paradas (1 Fallido, 2 Siguiente, 3-5 Pendiente) coherentes con "1 de 5"; las llamadas a `/viajes/{id}` devuelven 200 (antes 500).
