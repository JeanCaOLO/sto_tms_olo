# Optimización de Aurora del Tarifador — auditoría, cambios y runbook

Fecha: 2026-10-06. Plan elegido: **B (Balanceado)**, por fases. Regla de frescura: el catálogo (reglas, tarifarios, zonas, estructuras de costo) puede ir en caché con vida corta; liquidaciones, viajes, pedidos y marcas se leen siempre frescos.

**Reglas de este módulo (2026-10-07):** no se toca nada del AWS central ni su estructura; solo se consumen y guardan datos del tarifador. No se alteran tablas externas al módulo ni otros módulos. La optimización vive en una capa entre Aurora y el módulo (backend del tarifador y front), nunca en AWS.

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

## 3. Migraciones 26 y 27: NO APLICADAS (referencia)

**Estado: no se aplican.** Crean índices y redefinen una vista en Aurora, y la regla del módulo es no tocar la estructura de AWS. Quedan en `sql/` como referencia por si el dueño de la base decide aplicarlas. Consecuencia: el número de liquidación sigue sin índice único en Aurora (dos emisiones simultáneas podrían repetir `LIQ-NNNN`; riesgo bajo, baja concurrencia). El resto de las mejoras (cachés, columnas livianas) no dependen de ellas.

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

## 5. Nota informativa — FUERA DE ALCANCE, no se ejecuta ni se solicita desde este módulo

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

## 7. Estado de los pendientes

1. **Viajes por liquidar: hecho.** La bandeja pide al servidor solo los viajes sin liquidación vigente y no anulados (`settlement_id is null`, `status <> cancelled`), en vez de traer todo el historial (hasta 5000) y descartar en el cliente. Es un prefiltro: lo que decide si un viaje está liquidado sigue siendo `withVigentes`, así que el resultado no cambia con el driver JSON.
2. **Un solo `/tx` al emitir: descartado.** Ahorra una llamada, pero meter la bitácora dentro de la transacción cambia el contrato actual (una bitácora caída ya no tumba una liquidación guardada) y con el caché de permisos el ahorro es mínimo. Un endpoint de "catálogo en una llamada" tampoco hace falta mientras rija el caché de 60 s.
3. **Auditoría doble: se conserva, no es redundante.** `tarifas_audit_log` (módulo) guarda el hecho de negocio con usuario, rol y **motivo** (por qué se re-liquidó, por qué se anuló un pedido); `audit.events` (trigger del AWS central) guarda el cambio de fila. Quitar la del módulo perdería los motivos; el trigger es del AWS central y no se toca. No se cambia nada.
4. **`route_date` y `status` indexables: fuera de alcance.** Exige un índice sobre `routes`, que es de otro módulo.
5. **Borrar índices individuales: fuera de alcance** (estructura de Aurora) y sin evidencia con tablas pequeñas.

## 8. KPIs para el panel

| Capa | Métrica | Meta orientativa |
|---|---|---|
| Aurora (CloudWatch / Performance Insights) | CPU, DBLoad, conexiones, latencia R/W, créditos de CPU | CPU < 40 % sostenido, créditos > 100 |
| API | p50/p95/p99 por ruta (`/tarifas/{table}`, `/tx`), 5xx, timeouts | p95 de lectura < 300 ms |
| Cálculo | llamadas HTTP y queries por cálculo | de ~20 / ~75 a ≤ 6 / ≤ 20 (cálculo repetido) |
| Caché | tasa de aciertos del catálogo y de permisos | > 80 % |
| Negocio | tiempo de emisión de una liquidación | < 1,5 s |
| Costo | USD/mes del cluster (etiquetar por proyecto) | ≤ USD 54 hoy; ≤ USD 27 si se retira el reader |
