# Reporte de optimización Aurora del Tarifador

Fecha: 2026-10-07. Rama `dylan-tarifas`. Alcance: solo el módulo Tarifador; nada de AWS central, tablas externas ni otros módulos. Detalle técnico y decisiones en `RUNBOOK_OPTIMIZACION_AURORA.md`.

## 1. Prueba completa

| Prueba | Resultado |
|---|---|
| Frontend `npx vitest run src/lib/tarifas` | 43 archivos pasan, 641 tests pasan, 9 omitidos (los de Aurora) |
| Backend `py -m pytest tests -q` | 197 pasan |
| e2e contra Aurora real (`TARIFAS_AURORA_E2E=1`, transacción con ROLLBACK) | 7 de 7 pasan |
| Tipado `tsc` | 3 errores, todos en `src/pages/planificacion/` (otro módulo, no tocado). Ninguno en tarifas ni liquidaciones |
| Migraciones 26 y 27 en Aurora | aplicadas; 3 índices presentes; vista devuelve 28 viajes; `tms_app` conserva `select` |
| Carga CR (`aurora.cr-load`) | NO se corrió: puede hacer COMMIT en Aurora |

## 2. Qué se mejoró

| # | Mejora | Efecto |
|---|---|---|
| 1 | Caché de permisos por contenedor (30 s) | Quita 3-4 queries por request; ~60-80 por cálculo |
| 2 | Caché de catálogo en el cliente (60 s, invalidada al escribir) | ~14 llamadas HTTP por cálculo pasan a 0 en aciertos |
| 3 | Proyección `columns` en `find` | Los listados no traen los JSONB pesados |
| 4 | Listado de liquidaciones liviano; detalle bajo demanda | Menos bytes por listado y menos memoria |
| 5 | `nextNumber` trae solo `number` | Deja de traer cada liquidación completa |
| 6 | Prefiltro en bandeja de viajes (sin liquidar, no anulados) | Ya no trae todo el historial (tope 5000) |
| 7 | `withVigentes` pide solo `id` y `trip_id` | Menos datos, misma decisión |
| 8 | Número `LIQ-{PAÍS}-{NNN}` por país + índice único `(country_id, number)` | Cierra la carrera de números repetidos y numera por país |
| 9 | Migración 26: 3 índices | Número único; listado por país/fecha; filas de tarifario por tabla y estado |
| 10 | Migración 27: vista `tarifas_v_viajes` con una sola lectura de guías | Menos recorridos de `dispatch_guides` por fila |

Lo que sigue fresco, sin caché: liquidaciones, viajes, pedidos y marcas. Solo el catálogo se cachea.

## 3. Medición real (Aurora, solo lectura, 15 repeticiones)

| Consulta | Filas | Tamaño | p50 |
|---|---|---|---|
| `SELECT *` de liquidaciones (antes) | 1 | 3.0 KB | 88 ms |
| Resumen de liquidaciones (ahora) | 1 | 0.2 KB | 85 ms |
| `SELECT 1` (solo viaje de ida y vuelta) | 1 | 0 KB | 85 ms |
| Vista de viajes completa | 28 | 26 KB | 108 ms |

Hallazgos honestos:
- Estoy midiendo por el túnel SSM: cada ida y vuelta cuesta ~85 ms. Eso domina todo. La ejecución en el servidor es menor a 1 ms (la vista se ejecuta en 0.86 ms según `EXPLAIN ANALYZE`).
- Hoy hay 1 liquidación y 28 viajes. A este volumen, bajar bytes no se nota en milisegundos. El ahorro de las mejoras 3-7 y 9-10 aparece al crecer el histórico; hoy es protección, no ganancia medible.
- La ganancia real y medible hoy es **menos llamadas**: cada llamada evitada ahorra ~85 ms por el túnel (mejoras 1 y 2). Dentro de AWS, la Lambda en la VPC tendrá ~1-2 ms por llamada, así que el efecto será menor allí.
- Los 3 índices nuevos tienen 0 usos: lo esperable con una sola liquidación (el planificador prefiere recorrer la tabla). Hay que volver a mirar cuando haya volumen.
- La base está casi ociosa (CPU ~10 %, 0.56 conexiones promedio). Aurora no es el cuello de botella.

## 4. Qué más se podría hacer

Dentro del módulo, sin aprobación especial:
1. **Endpoint de lote o de catálogo en una llamada** (`backend/tarifas`): el catálogo son ~14 llamadas; en un fallo de caché cada una cuesta ~85 ms por túnel. Es la palanca que más queda. Lo descarté antes por alcance; ahora tiene evidencia de peso.
2. **Paginación por keyset** en liquidaciones y viajes (hoy tope silencioso de 5000).
3. **Métricas de la app**: duración por endpoint, llamadas por cálculo, aciertos de caché. Hoy solo hay métricas de infraestructura.
4. **Timeouts y reintentos en el cliente HTTP**, y un `q` por POST cuando el `in` lleva miles de ids (hoy va en la URL).

Requieren aprobación (DDL o tocar fuera del módulo):
5. `statement_timeout` y `lock_timeout` para el rol `tms_app` (es DDL de rol).
6. Fechas como `date` en vez de `text` (cambia estructura de tablas del módulo).
7. Eliminar índices sin uso: solo con `pg_stat_statements` y volumen real.

Fuera de alcance, solo como nota para el dueño de la BD / Intelix:
8. `pg_stat_statements` no está creado en `tms_olo`: sin él no hay evidencia de consultas lentas reales.
9. El reader (~USD 27/mes) no recibe tráfico. Es decisión de resiliencia, no de rendimiento.
10. RDS Proxy o Serverless v2 solo si la concurrencia real lo pide. Hoy no.
11. Verificación de certificado SSL (`TMS_DB_SSL_CA`) y revisión del grupo de seguridad con 5432 abierto a `0.0.0.0/0`. Lo reporto, no lo toco.

## 5. Riesgos y límites de esta prueba
- La medición es por túnel y con datos de prueba mínimos; no es carga real. Conviene repetirla tras el primer mes de uso o con una carga sintética acordada.
- El Lambda del Tarifador no está desplegado; el caché de permisos solo rinde una vez desplegado (lo hace Intelix).
- Siguen sin commitear y fuera de alcance: `aidlc/spaces/default/memory/org.md`, `.agents/tasks/`, `scripts/sandbox/aws_connectivity_check.py`.
