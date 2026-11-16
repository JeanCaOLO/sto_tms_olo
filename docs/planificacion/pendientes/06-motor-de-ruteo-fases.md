# 06 — Motor de ruteo: decisiones de activación y mejoras

**Estado:** pendiente por verificar (las fases están construidas; faltan decisiones de negocio)

**Dónde estamos (2026-11-13):**

| Fase | Estado | Interruptor (sandbox, `backend/planning/samconfig.toml`) |
|---|---|---|
| 1. Interfaz única (`motor_ruteo.asignar_y_ordenar`) | Hecha | — |
| 2. OSRM propio, Costa Rica y Venezuela | Hecha | `OsrmUrl` (lo pone el deploy) |
| 3. Motor OR-Tools | Hecha, **activo** | `MotorRuteo=ortools` |
| 4. Comparación en sombra | Hecha: −9,4 % km, mismos viajes | `{"accion": "comparar_motores", "dias_atras": 45}` |
| Venezuela (sede, mapa y flota por país) | Hecha; faltan datos e ingesta: [07](07-venezuela-ruteo.md) | — |
| Camiones de viajes congelados | Hecha (corrección) | — |
| 5. T-n por carretera | Hecha, **apagada** | `TnModo=linea`, `TnMinPorDia=135` |
| 6. Costos por tipo de camión y terceros | Hecha, **apagada** | `CostosModo=fijo`, `UsarTerceros=no` |
| 7. Registro de corridas (`tbl_routing_runs`) y ADR-005 aceptado | Hecha, activa | — |

Para cambiar un interruptor: editar `samconfig.toml` (dev) y
`python scripts/sandbox/deploy_backend.py planning`. Detalle y números:
`docs/work/2026-11/2026-11-13-motor-ruteo-fases-5-6-7.md`.

## Decisiones de negocio pendientes

1. **¿Activar el T-n por carretera (`TnModo=carretera`)?** Con 135 min de manejo por día
   coincide con el T-n actual en 213 de 236 viajes; 23 viajes (206 pedidos) cambian de
   fecha de salida. Mueve `dispatch_date`, que es lo que usa el OMS para liberar: coordinar
   con Eduardo (OMS) antes. Para Venezuela es casi obligatorio (70 km/día en línea recta no
   tiene base allá).
2. **¿Activar costos (`CostosModo=reales`)?** Con flota propia el plan cuesta 0,2 % menos que
   minimizando km (₡14,60 M vs ₡14,63 M en 32 días). Poco efecto hoy porque los viajes se
   cortan por zona y tope de paradas; pesa más cuando haya peso y volumen completos.
3. **¿Activar terceros (`UsarTerceros=si`)?** Con terceros, 32 de 272 viajes irían en
   camiones de terceros en vez de repetir un camión propio ese día (+₡0,77 M, +5 %, si
   repetir camión propio fuera gratis). Decide si un camión propio puede hacer 2 o 3
   vueltas en un día. Ojo: los únicos terceros de Costa Rica hoy son 3 camiones de 1.000 kg
   creados el 2026-11-13 (`MV261113-02/03/04`, "Pedro Hernández Castro"); revisar si son
   datos de prueba.

## Mejoras pendientes

- **Tarifa real de terceros.** Hoy un tercero cuesta el propio equivalente × 1,3
  (`costos.FACTOR_TERCERO`). Conectar el tarifario de cada transportista
  (`tarifas_rate_tables`, tipos km/unidad/fija/volumen/tendering).
- **Costos de Venezuela.** Las tablas de costeo son solo de Costa Rica (colones). Sin
  ellas, Venezuela minimiza km.
- **Jornada del chofer y ventanas de tiempo.** El solver no verifica que varias vueltas del
  mismo camión quepan en un día (`tbl_parametros_globales.horas_max = 16` existe).
- **"Mismo día" por fecha de salida.** `plan_builder.usos_del_dia` cuenta los viajes del
  camión por fecha de entrega, no de salida.
- **Retención de `tbl_routing_runs`** (≈ 70 filas por día hábil, con JSON de entrada y
  resultado). Definir cuánto se guarda y una limpieza programada.
- **Zona como frontera dura.** El solver no mezcla zonas en un camión. Mezclarlas puede
  ahorrar más, pero cambia `plan_trips.delivery_zone`, las recolectas y los días de anticipo
  por zona. Decisión de negocio.
- **Sin metaheurística.** `GUIDED_LOCAL_SEARCH` daría mejores rutas pero corta por reloj;
  usarla exige no re-resolver los días cuyos pedidos no cambiaron.
- **Frontend en el OSRM público.** El propio solo es alcanzable desde las Lambdas: exponerlo
  por una ruta del backend o un dominio con certificado (`src/pages/planificacion/osrm-config.ts`,
  `src/pages/tracking/route-osrm.ts`). Retirar además la heurística del frontend
  (`plan-automatico.ts`, `optimize-stops.ts`, `tiempo-cluster.ts`).
- **QA y producción.** Intelix debe decidir dónde vive el OSRM, pasar `OsrmUrl`, que el
  `sam build` instale `ortools` (ruedas `manylinux_2_28`) y aplicar sql/71 y sql/72.
- **Paquete de la Lambda:** 178 MB de 250 MB; `numpy` y `pandas` (~100 MB) se pueden excluir.
- **Checksum de migraciones con CRLF.** `scripts/run-migration.mjs` calcula el checksum del
  archivo tal cual: el mismo archivo con saltos de línea de Windows (CRLF) y de Linux (LF) da
  distinto (pasó con sql/67). Aceptar ambas formas al comparar.

## Datos que limitan al motor

- **EPA sin coordenadas** (pedidos y sus 9.711 puntos de entrega): ningún motor los ordena.
- **Peso y volumen incompletos** (20 % y 51 % de los pedidos de Cofersa): la capacidad nunca
  limita y el solver solo ahorra km, no viajes.
- **La comparación mide recorridos planificados**, no km manejados: contrastar con el GPS de
  Tracking (`tbl_tracking_positions`) cuando haya viajes ejecutados con el solver.
