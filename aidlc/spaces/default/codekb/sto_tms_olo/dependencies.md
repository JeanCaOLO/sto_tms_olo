# Dependencias — STO / TMS OLO

> Observadas el 2026-09-30 (re-corrida por el pivote WMH).

## Internas (entre componentes del backend)

Todo stack de módulo depende de **`common-services`** vía `Fn::ImportValue`
(API id, authorizer id, `LambdaRoleArn`, `DbSecretName`) y del parámetro SSM
`/<env>/tms/common-layer-arn` para la **Layer `tms_common`**. El grafo es
acíclico: los módulos dependen de common-services; common-services no depende de
ningún módulo.

```
common-services  ← auth, data, context, eflow, admin, planning
tms_common (Layer) ← todos los módulos
```

## Externas / integraciones

| Dependencia | Tipo | Uso |
|---|---|---|
| **Aurora PostgreSQL** (`us-east-2`, `db-tms-olo`) | database | transaccional; usuario app `tms_app`. Se apaga fuera de horario hábil. |
| **Secrets Manager** | secretos | `/<env>/tms/db` (RDS), `/<env>/tms/jwt`, `/<env>/tms/eflow`. |
| **SSM Parameter Store** | config | subnets, lambda-sg, common-layer-arn. |
| **EFLOW** (WMS/WMH, SQL Server CR+VE) | integración | **mock por defecto** (`mock_source`, `mock_data.json`); **live** requiere red a EFLOW. Fuente de los pedidos del OMS. Réplica de `EFLOW_OLO` **aún no existe**. |
| **Softland** | dato de catálogo | `softland_code` en transportistas; NO hay integración de código Softland en backend. |
| **Amazon Bedrock** | — | **NO integrado**. Solo historia futura (US12: IA de observaciones). |
| **OSRM / Leaflet** | mapas/ruteo | frontend de planificación. |
| **Supabase** | — | **NO se usa en producción**. `.env` tiene claves del prototipo/Liquidador; el shim `supabase.ts` no llama a Supabase. |

## Frontend → backend

El frontend depende del API Gateway HTTP (via `VITE_API_BASE`) a través del shim
`src/lib/supabase.ts`. En dev, Vite proxya `/api` a `:4000`.

## Sources

- `backend/README.md` (secretos, SSM, EFLOW, despliegue).
- `backend/common-services/`, `backend/*/template.yaml` (Fn::ImportValue, SSM).
- `backend/eflow/src/app.py` (mock/live), `package.json` (deps frontend).

## Assumptions & Open Questions

- La réplica de `EFLOW_OLO` es una dependencia externa pendiente (bloquea el
  ingreso real de pedidos; hoy mock).
- `firebase`/`@stripe/react-stripe-js` en `package.json` sin dependientes claros.
