# eflow QA — mapa de datos (rutas, choferes, viajes)

Referencia de la base de datos QA del ecosistema eflow (WMS/TMS de OLO), usada
como fuente de la data real que alimenta los fallbacks del prototipo de
Planificación (`src/pages/planificacion/fallback-*.ts`).

## Acceso

- **Servidor:** SQL Server `10.17.224.224:1433`. Requiere red interna / VPN.
- **Credenciales:** `sa` / `*QAeFLOW2023` — en
  `AJUSTES-EFLOW/olo-aplicaciones-api/eflow_api_sap/src/config/config_dev_qa_preprod.json`
  (repo hermano, no este). La API `eflow_api_sap` usa `sequelize` + `tedious`;
  el `.env_qa` solo fija `DB_NAME`.

## Qué base tiene qué

| Base | Contenido |
|------|-----------|
| `QA_SAP_EFLOW` | Integración SAP↔WMS: expediciones, recepciones, artículos, clientes, proveedores. **Sin rutas ni choferes.** |
| **`EFLOW_WMH`** | **Base de transporte/TMS.** Tablas en inglés: `drivers`, `distribution_routes`, `distribution_zones`, `trasportation_units`, `transportation_companies`, `journeys`, `journey_orders` (asignación pedido→viaje, con `route_id`), `journey_order_transportation` (`driver_id`↔viaje). Tablas `ext_tms_*_mt` = staging de integración con el WMS. |
| `EFLOW_OLO_QA_SAP` | WMS (525 tablas). Tiene `CHOFERES`, `COSTO_RUTA`, `UNIDADESTRANSPORTE`, `RUTA_DIA_AB` / `RUTA_PROMESA_AB` (ruta + horas de promesa). **`VIEW_INS_OLO_PLANNING_AB`** = vista "insumo para OLO Planning" (por línea de entrega: cliente + dirección, capacidad requerida, artículo, cantidad, pedido, guía, **Ruta, cédula y correo del chofer**). Nota: al 2026-09-01 devolvía vacío/error en `SELECT` — confirmar si tiene data o está rota. |
| `QA_EFLOW_OLO`, `OLO_CLIRO_EFLOW` | Offline en el servidor. |

No hay ninguna tabla de devoluciones/pickups en ninguna base — el módulo de
Devoluciones aún no existe.

## Snapshot en el prototipo

Ver `MOCKING.md`. En resumen: `fallback-rutas.ts` trae las 15 rutas reales de
`distribution_routes`; `fallback-catalogos.ts` trae 9 transportistas, 12
vehículos y 18 conductores (nombres/placas/cédulas reales, capacidades
sintéticas porque QA las tenía en 0). Es una foto fija — para refrescar hay que
re-consultar QA. Los ids son `eflow-<kind>-<id>` salvo las 2 primeras rutas,
que conservan los UUID reales de Supabase.

## Para el diseño de FR16 (devoluciones/pickups)

- Modelo operativo real de rutas+choferes+viajes: `EFLOW_WMH`.
- `VIEW_INS_OLO_PLANNING_AB` muestra qué campos ya se exponen hoy para
  planificación (incluye Ruta, chofer y capacidad requerida) — referencia de
  contrato, distinta del Supabase mockeado de este repo.
