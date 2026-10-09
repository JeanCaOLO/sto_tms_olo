# Despliegue del backend `tarifas` al sandbox: impacto y pasos

Fecha: 2026-10-08. Estado: **pendiente de ejecutar por el usuario**. El intento desde Claude Code lo bloqueó el control de permisos del entorno (dos veces) y no se buscó otra vía.

## Qué se despliega
Solo el stack `dev-tms-tarifas` (`python scripts/sandbox/deploy_backend.py tarifas`). Cambios entre lo desplegado y el repo, todos dentro de `backend/tarifas/`:

| Archivo | Cambio |
|---|---|
| `template.yaml` | Rutas nuevas `POST /api/tarifas/batch` y `POST /api/tarifas/{table}/find` |
| `src/app.py` | Lecturas en lote, lectura por POST, paginación por cursor, métricas |
| `src/tarifas_sql.py` | Cursor `after`, cast `::date` de `settlement_date`, tope de largo de consulta |
| `src/tarifas_db.py` | `statement_timeout` 10 s y `lock_timeout` 5 s solo en la conexión de ese Lambda |
| `src/tarifas_perms.py` | Caché de permisos 30 s por contenedor |
| `src/tarifas_metrics.py` | Una línea EMF por petición (CloudWatch) |
| `src/schema_manifest.json` | `settlement_date` = `date` |

Las pruebas del backend de tarifas pasan (72) y la prueba contra Aurora confirma que el manifiesto del repo coincide con la base.

## Impacto en otros módulos: ninguno
- Los otros Lambdas (`auth`, `data`, `context`, `eflow`, `admin`, `planning`, `oms`) no se vuelven a desplegar ni importan nada de `tarifas`. La mención de "tarifas" en `backend/oms/src/app.py` es un comentario.
- Las rutas nuevas se agregan al API Gateway compartido sin tocar las de otros módulos (`/api/tarifas/*` es solo de este módulo).
- La Layer `tms_common` no cambia. El rol del Lambda viene de `common-services` y no cambia.
- Aurora: los topes de tiempo se fijan por sesión en la conexión del propio Lambda; no cambian la configuración de la base.
- El script, antes del stack, ejecuta pasos idempotentes (secretos, parámetros SSM de red, endpoint de Secrets Manager, bucket de artefactos, parámetro de la Layer): solo escriben si el valor difiere, y ya existen.
- Frontend: el cliente ya sabe usar `/batch` y `/find` y cae a lecturas sueltas si no existen, así que puede salir antes o después.
- Consumidores de `/api/tarifas`: solo las pantallas del tarifador (Liquidaciones, Compañías, Reglas de Tarifa).

## Pasos
Ninguno de base de datos. `settlement_date` quedó en `text` (migración `sql/29_tarifas_settlement_date_text.sql`, ya aplicada) y el manifiesto del backend nuevo también dice `text`: el backend anterior y el nuevo funcionan con la misma base, así que el despliegue es solo el del stack `tarifas` tras el merge.
Después, opcional: comprobar que `POST /api/tarifas/batch` responde 200 (hoy 404), emitir una liquidación de prueba y registrar el cambio en `docs/reference/aws-inventario-tms.md`.

## Rollback
- Backend: volver a desplegar el commit anterior de `backend/tarifas` (o `aws cloudformation` rollback del stack `dev-tms-tarifas`).
- Datos: no hay nada que revertir.

## Qué mejora (mediciones de antes)
- Catálogo: de ~11 lecturas sueltas (1,2 a 6,5 s cada una al encolarse) a 2 idas y vueltas.
- Primera apertura del modal por transportista: de 5–15 s a lo que cuesten 2 llamadas más el resto de la cascada (meta: 6 s o menos).
- Historial: paginación por cursor en lugar de traer todo.
