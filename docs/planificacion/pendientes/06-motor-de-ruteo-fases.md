# 06 — Motor de ruteo: lo que queda

**Estado:** pendiente por verificar

**Dónde estamos (2026-11-16):** todas las fases construidas y encendidas en el sandbox por
decisión del usuario. Detalle: `docs/work/2026-11/2026-11-16-motor-ruteo-activacion.md`.

| Pieza | Estado en el sandbox (`backend/planning/samconfig.toml`, dev) |
|---|---|
| Motor OR-Tools | Encendido (`MotorRuteo=ortools`) |
| OSRM propio, Costa Rica y Venezuela | Encendido; el frontend también lo usa (ruta `/api/v1/planificacion/osrm/...`) |
| T-n por carretera | Encendido (`TnModo=carretera`, 135 min por día, tope `TnMaxDias=3`) |
| Costos por tipo de camión | Encendido (`CostosModo=reales`) |
| Terceros con tarifa del tarifario | Encendido (`UsarTerceros=si`), solo cuando la flota propia ya salió |
| Una vuelta por camión propio | Encendido (`PropiosUnaVuelta=si`) |
| Una vuelta por camión de tercero | Encendido (`TercerosUnaVuelta=si`, 2026-11-16) |
| Registro de corridas | Encendido, con retención de 90 días |

Volver atrás: cambiar el interruptor en `samconfig.toml` y `python scripts/sandbox/deploy_backend.py planning`.

## Por verificar con datos reales
- **Faltan camiones en los días grandes.** Con una vuelta por camión (propios y terceros,
  decisión del 2026-11-16) y los 3 terceros de prueba, en 34 días quedarían 347 pedidos sin
  camión, en 6 días: 2026-11-12 (165 de 332), 2026-11-13 (137 de 275), 2026-11-06 (39 de 159)
  y 1 a 4 en otros tres. Un pedido sin camión queda en la bandeja sin número de viaje, el OMS no
  lo libera y el replan de cada hora lo reintenta; queda en
  `tbl_routing_runs.parametros->'informe'->'sin_camion'`. Hace falta cargar más transportistas
  (con camiones y tarifa) para cubrir esos días.
- **Tarifas de terceros de prueba.** Los transportistas de Costa Rica con vehículos son datos
  de prueba (2026-11-16, confirmado por el usuario). Sin `rate_type`, el motor usa su tarifa
  fija o la tabla zona × camión. Revisar con las tarifas reales.
- **"TIENDA 001 CD" de EPA sin coordenadas** (el usuario indicó "la misma que la de cliro": por
  confirmar a qué punto se refiere).

## Mejoras que quedan
- **Jornada en horas.** La regla de una vuelta resuelve la jornada de los propios; el motor no
  limita la duración de un viaje (ya la estima: manejo + 15 min por parada, en el registro).
- **"Mismo día" por fecha de salida.** `plan_builder.usos_del_dia` cuenta los viajes del camión
  por fecha de entrega, no de salida.
- **Tarifa de terceros completa.** El motor traduce la regla BASE del tarifario (km, fija, por
  parada, por volumen, tabla zona × camión); no aplica recargos, descuentos ni reglas con
  condiciones. TENDERING usa la tarifa fija.
- **Costos de Venezuela.** Las tablas de costeo son solo de Costa Rica.
- **Zona como frontera dura y sin metaheurística** (decisiones de diseño; ver ADR-005).
- **QA y producción:** ver `docs/guides/motor-ruteo-qa-produccion.md`.
- **Heurística del frontend** (`plan-automatico.ts`, `optimize-stops.ts`, `tiempo-cluster.ts`):
  sigue en el código; retirarla cuando nadie use la pestaña de plan automático del navegador.

## Datos que limitan al motor
- **Peso y volumen incompletos** (20 % y 51 % de los pedidos de Cofersa): la capacidad nunca
  limita y el solver solo ahorra km, no viajes.
- **Almacén OLO-CR sin coordenadas:** Costa Rica sale de un punto fijo de San José.
- **La comparación mide recorridos planificados**, no km manejados: contrastar con el GPS de
  Tracking (`tbl_tracking_positions`) cuando haya viajes ejecutados con el motor.
