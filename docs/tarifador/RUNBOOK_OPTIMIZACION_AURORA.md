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
| Tests | `backend/tests/test_permissions_cache.py`, `test_tarifas.py`, `__tests__/catalogCache.test.ts` | 195 tests de backend y 634 del tarifador en verde. |

También se restauró la entrada `tarifas` de `backend/tests/conftest.py`, que se había perdido en el merge con `main`.

## 3. Runbook: aplicar la migración 26

Requisitos: túnel abierto (`scripts/tunel-aurora.ps1`), `.env.local` con `TMS_DB_ADMIN_*`, ventana con poca actividad.

1. **Revisar duplicados** (el índice único no se crea si existen):
   ```sql
   select country_id, number, count(*) from tarifas_settlements group by 1, 2 having count(*) > 1;
   ```
   Debe devolver 0 filas. Si devuelve filas, renumerar esas liquidaciones a mano antes de seguir.
2. **Dry-run** (hace ROLLBACK):
   `node --env-file=.env.local scripts/run-migration.mjs sql/26_tarifas_indices_rendimiento.sql`
3. **Aplicar**: el mismo comando con `--execute`.
4. **Validar**:
   ```sql
   select indexname from pg_indexes where tablename in ('tarifas_settlements','tarifas_rate_table_rows')
     and indexname in ('tarifas_settlements_country_number_uq','tarifas_settlements_country_date_idx','tarifas_rate_table_rows_table_active_idx');
   ```
   Deben aparecer los 3. Emitir una liquidación de prueba y comprobar que el número avanza.
5. **Rollback** (si algo falla): los tres `drop index if exists …` que están al inicio de `sql/26_…sql`. No hay cambios de datos.

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

## 6. Lo que falta medir (necesita el túnel, solo lectura)

```sql
-- Consultas más costosas (pg_stat_statements ya está precargado)
select left(query, 120) q, calls, round(total_exec_time::numeric) total_ms, round(mean_exec_time::numeric, 2) mean_ms
from pg_stat_statements order by total_exec_time desc limit 20;

-- Índices sin uso (candidatos a borrar; no borrar sin esta evidencia)
select relname, indexrelname, idx_scan from pg_stat_user_indexes
where relname like 'tarifas_%' order by idx_scan asc limit 30;

-- Tamaño de tablas
select relname, pg_size_pretty(pg_total_relation_size(oid)) from pg_class
where relname like 'tarifas_%' and relkind = 'r' order by pg_total_relation_size(oid) desc;

-- Plan de la vista de viajes
explain (analyze, buffers) select * from tarifas_v_viajes where status = 'completed' order by route_date desc limit 50;
```

## 7. Siguientes pasos (aún no hechos)

1. **Listados con columnas livianas y paginación**: `listSettlements` y `listPendingTrips` siguen trayendo todo (tope 5000). Hace falta que la tabla pida solo las columnas visibles y que el detalle cargue la liquidación completa por id al abrirla.
2. **`tarifas_v_viajes`**: exponer `route_date` y `status` como columnas reales (hoy son `to_char`/`CASE`, no usan `idx_routes_date` ni `idx_routes_status`) y reemplazar las 4 subqueries correlacionadas por agregados por `route_id`. Con 28 viajes cuesta 1–3 ms; importa a escala.
3. **Un solo `/tx` al emitir** (número + inserción + auditoría) en vez de ~5 llamadas sueltas; y un endpoint que devuelva el catálogo en una sola llamada.
4. **Borrar índices individuales** de baja cardinalidad (`active`, `status`, `stage`, `scope`, `margin_status`) solo si `pg_stat_user_indexes` confirma que no se usan.
5. **Auditoría doble**: `tarifas_audit_log` (cliente) más `audit.events` (trigger) por cada escritura; decidir si se conserva una sola.

## 8. KPIs para el panel

| Capa | Métrica | Meta orientativa |
|---|---|---|
| Aurora (CloudWatch / Performance Insights) | CPU, DBLoad, conexiones, latencia R/W, créditos de CPU | CPU < 40 % sostenido, créditos > 100 |
| API | p50/p95/p99 por ruta (`/tarifas/{table}`, `/tx`), 5xx, timeouts | p95 de lectura < 300 ms |
| Cálculo | llamadas HTTP y queries por cálculo | de ~20 / ~75 a ≤ 6 / ≤ 20 (cálculo repetido) |
| Caché | tasa de aciertos del catálogo y de permisos | > 80 % |
| Negocio | tiempo de emisión de una liquidación | < 1,5 s |
| Costo | USD/mes del cluster (etiquetar por proyecto) | ≤ USD 54 hoy; ≤ USD 27 si se retira el reader |
