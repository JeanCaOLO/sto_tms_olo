# Optimización de Aurora del Tarifador — auditoría, cambios y runbook

Fecha: 2026-10-06. Plan elegido: **B (Balanceado)**, por fases. Regla de frescura: el catálogo (reglas, tarifarios, zonas, estructuras de costo) puede ir en caché con vida corta; liquidaciones, viajes, pedidos y marcas se leen siempre frescos.

Nada de este documento toca infraestructura de Intelix: lo que requiere cambiar el cluster, el parameter group o el despliegue aparece como **solicitud** (sección 5).

## 1. Qué mostró la auditoría

Evidencia: CloudWatch 14 días (cuenta `tms-sandbox`, us-east-2) y lectura del repo. No se ejecutó `EXPLAIN`/`pg_stat_statements` (requiere el túnel): ver sección 6.

| Dato | Valor |
|---|---|
| Cluster | `db-tms-olo`, Aurora PostgreSQL 17.7, 2 × `db.t3.medium` (writer + reader), Multi-AZ, Standard, 61 MB |
| CPU writer | promedio 10 %, máximo 71 % |
| Conexiones | promedio 0,56, máximo 16; el reader: 0 |
| Latencia de disco | lectura 0,04 ms, escritura 0,2 ms |
| Costo instancias | ~USD 54/mes (con el horario L-V 04:45–17:00); el reader es la mitad |

**La base no es el cuello de botella.** La latencia sale de la capa de aplicación: calcular un viaje hacía ~20 llamadas HTTP y cada una cobraba 3–4 queries de permisos (~60–90 queries por cálculo), recargando el catálogo completo en cada edición.

## 2. Qué se implementó (fases A y B, en el repo)

| Cambio | Archivos | Efecto |
|---|---|---|
| Caché de permisos por contenedor, solo del tarifador (TTL 30 s desde el template; `TMS_PERMS_TTL_SECONDS=0` la apaga). La capa común `tms_common` no se toca | `backend/tarifas/src/tarifas_perms.py`, `app.py`, `template.yaml` | Quita 3–4 queries de cada request tras la primera. Un cambio de rol tarda como máximo 30 s en verse. Errores (401/403) no se guardan. |
| Proyección de columnas (`columns` en `find`) | `data/datasource.ts`, `json-datasource.ts`, `backend/tarifas/src/tarifas_sql.py` | Permite pedir solo las columnas necesarias en vez de `SELECT *` con los JSONB pesados. Validadas contra el manifiesto. |
| `nextNumber` y `withVigentes` livianos | `settlementsDataSource.ts`, `tripsDataSource.ts` | Traen una o dos columnas en vez de cada liquidación entera. |
| Caché del catálogo contra la API (TTL 60 s) | `catalogLoader.ts`, `data/writeEvents.ts`, `http-datasource.ts` | Un cálculo repetido no recarga ~14 consultas. Se descarta al instante cuando esta sesión escribe una entidad del catálogo; las ediciones de otras personas se ven en ≤ 60 s. Solo con el driver HTTP. |
| Número de liquidación sin carrera | `data/schema.ts`, `sql/26_tarifas_indices_rendimiento.sql` | Índice único `(country_id, number)`: dos emisiones simultáneas ya no repiten `LIQ-NNNN`; la segunda recibe un aviso. |
| Índices de lectura | `sql/26_tarifas_indices_rendimiento.sql` | `(country_id, settlement_date desc, number desc)` en liquidaciones y `(table_id, active)` en filas de tarifario. |
| Tabla de liquidaciones sin el cálculo | `settlementsDataSource.ts` (`listSettlementSummaries`), `liquidaciones/page.tsx` | El listado no trae `trace`, reglas, avisos, etc.; el desglose y re-liquidar leen la liquidación entera al abrir (`getSettlement`), así que siempre está al día. |
| Vista de viajes con un solo recorrido de guías | `sql/27_tarifas_vista_viajes_un_recorrido.sql` | `guide_count` y `delivered_guides` salen de una sola lectura en vez de dos subconsultas. Mismas columnas y valores (verificado: 28 filas idénticas). Solo vistas del tarifador. |
| Tests | `backend/tests/test_permissions_cache.py`, `test_tarifas.py`, `__tests__/catalogCache.test.ts` | 195 tests de backend y 634 del tarifador en verde. |

También se restauró la entrada `tarifas` de `backend/tests/conftest.py`, que se había perdido en el merge con `main`.

## 3. Runbook: aplicar las migraciones 26 y 27

Dry-run de 26 y 27 ejecutado el 2026-10-06 contra Aurora: sin errores, ROLLBACK (la base no cambió). La 27 se probó además contra los datos reales dentro de una transacción revertida: la vista nueva devuelve las mismas 28 filas, idénticas a la actual.

Requisitos: túnel abierto (`scripts/tunel-aurora.ps1`), `.env.local` con `TMS_DB_ADMIN_*`, ventana con poca actividad.

1. **Revisar duplicados** (el índice único no se crea si existen):
   ```sql
   select country_id, number, count(*) from tarifas_settlements group by 1, 2 having count(*) > 1;
   ```
   Debe devolver 0 filas. Si devuelve filas, renumerar esas liquidaciones a mano antes de seguir.
2. **Dry-run** (hace ROLLBACK), uno por archivo:
   `node --env-file=.env.local scripts/run-migration.mjs sql/26_tarifas_indices_rendimiento.sql`
   `node --env-file=.env.local scripts/run-migration.mjs sql/27_tarifas_vista_viajes_un_recorrido.sql`
3. **Aplicar**: los mismos comandos con `--execute`, en orden.
4. **Validar**:
   ```sql
   select indexname from pg_indexes where tablename in ('tarifas_settlements','tarifas_rate_table_rows')
     and indexname in ('tarifas_settlements_country_number_uq','tarifas_settlements_country_date_idx','tarifas_rate_table_rows_table_active_idx');
   ```
   Deben aparecer los 3. Emitir una liquidación de prueba y comprobar que el número avanza.
5. **Rollback** (si algo falla): los tres `drop index if exists …` del inicio de `sql/26_…sql`; para la 27, volver a correr la definición de `tarifas_v_viajes` de `sql/24_…sql`. No hay cambios de datos.

Las tablas son pequeñas (61 MB en total): los `create index` tardan milisegundos. Con tablas grandes usar `create index concurrently` fuera de transacción.

## 4. Checklist de validación del front y el backend

- [ ] `npx vitest run src/lib/tarifas` y `cd backend && py -m pytest tests` en verde.
- [ ] Abrir el modal de liquidar dos veces el mismo viaje: la segunda apertura no repite las ~14 lecturas del catálogo (pestaña Red).
- [ ] Editar una regla en Reglas de Tarifa y volver a calcular el mismo viaje: el cálculo usa la regla nueva al instante.
- [ ] Emitir una liquidación y ver que aparece sin recargar ni esperar (los datos transaccionales no pasan por caché).
- [ ] Cambiar el permiso de un rol y comprobar que surte efecto en ≤ 30 s.

## 5. Solicitudes a Intelix (no se tocan desde aquí)

| Solicitud | Por qué | Costo / riesgo |
|---|---|---|
| `log_min_duration_statement = 500` en el parameter group (hoy el group es el `default`, no editable: requiere uno propio) | Ver consultas lentas reales | USD 0; sin reinicio |
| `statement_timeout` / `lock_timeout` para el rol `tms_app` (`alter role tms_app set statement_timeout = '12s'`) | Hoy una query colgada consume los 15 s de la Lambda | USD 0; probar antes |
| Variable `TMS_DB_SSL_CA` en el template del tarifador | La conexión cifra pero no verifica el certificado (`docs/decisions/0002-backend-lambdas-python-sam.md`) | USD 0 |
| `ReservedConcurrentExecutions` en la Lambda del tarifador | Acota las conexiones simultáneas contra el writer (una por contenedor) | USD 0 |
| Decidir sobre el reader (`db-tms-olo-instance-1-reader`) | 0 conexiones en 14 días; cuesta ~USD 27/mes. Da failover y Multi-AZ | Ahorro USD 27/mes frente a menos resiliencia: decisión de negocio |
| Hallazgo de seguridad: el SG `default` abre 5432 a `0.0.0.0/0` (`docs/reference/aws-inventario-tms.md`) | Exposición | Solo informar |
| RDS Proxy, Serverless v2 | Plan C. **No se justifica hoy** (CPU 10 %, 0,56 conexiones) | +USD 15–60/mes |

## 6. Medición en la base (2026-10-06, solo lectura)

| Medición | Resultado |
|---|---|
| Tamaño de las tablas `tarifas_*` | la mayor, `tarifas_settlements`, 256 kB; el resto 64–144 kB |
| Vista `tarifas_v_viajes` (28 viajes) | 1,1 ms de ejecución, 2 ms de planificación |
| Números de liquidación repetidos | 0 (el índice único se puede crear) |
| Índices con 0 usos (`pg_stat_user_indexes`) | varios de `tarifas_pricing_rules`; **no es evidencia para borrar**: con tablas de decenas de filas el planificador prefiere recorrer la tabla |
| `pg_stat_statements` | la extensión está precargada pero **no creada** en `tms_olo` (`relation "pg_stat_statements" does not exist`) |

Conclusión: con el volumen actual la base no tiene nada que optimizar por dentro; los cambios sirven para que escale. Para medir consultas hace falta `create extension pg_stat_statements;` con el rol dueño (solicitud a Intelix o al dueño de la BD) y dejar correr tráfico real. Consulta para entonces:

```sql
select left(query, 120) q, calls, round(total_exec_time::numeric) total_ms, round(mean_exec_time::numeric, 2) mean_ms
from pg_stat_statements order by total_exec_time desc limit 20;
```

Volver a revisar índices sin uso (`pg_stat_user_indexes`) cuando las tablas tengan miles de filas, antes de borrar ninguno.

## 7. Siguientes pasos (aún no hechos)

1. **Paginación** de `listPendingTrips` (viajes por liquidar): sigue trayendo todo con tope 5000. Conviene paginar por fecha cuando el volumen lo pida.
2. **Un solo `/tx` al emitir** (número + inserción + auditoría) en vez de ~5 llamadas sueltas, y un endpoint que devuelva el catálogo en una sola llamada.
3. **`route_date` y `status` indexables**: hoy son expresiones de la vista (`to_char`, `CASE`) y no usan `idx_routes_date` ni `idx_routes_status`. Indexarlas exige un índice sobre `routes`, que es de otro módulo: se deja como solicitud al dueño de esa tabla si el volumen lo justifica.
4. **Auditoría doble**: `tarifas_audit_log` (cliente) más `audit.events` (trigger) por cada escritura; decidir si se conserva una sola.
5. **Borrar índices individuales** de baja cardinalidad solo con evidencia de tablas grandes (sección 6).

## 8. KPIs para el panel

| Capa | Métrica | Meta orientativa |
|---|---|---|
| Aurora (CloudWatch / Performance Insights) | CPU, DBLoad, conexiones, latencia R/W, créditos de CPU | CPU < 40 % sostenido, créditos > 100 |
| API | p50/p95/p99 por ruta (`/tarifas/{table}`, `/tx`), 5xx, timeouts | p95 de lectura < 300 ms |
| Cálculo | llamadas HTTP y queries por cálculo | de ~20 / ~75 a ≤ 6 / ≤ 20 (cálculo repetido) |
| Caché | tasa de aciertos del catálogo y de permisos | > 80 % |
| Negocio | tiempo de emisión de una liquidación | < 1,5 s |
| Costo | USD/mes del cluster (etiquetar por proyecto) | ≤ USD 54 hoy; ≤ USD 27 si se retira el reader |
