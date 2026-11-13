# 2026-11-13 — Motor de ruteo, fase 3: motor con OR-Tools detrás de un interruptor

Rama `motor-ruteo-fase3` (desde `motor-ruteo-fase2`). Sin migraciones. El interruptor queda
**apagado**: la planificación sigue saliendo con la heurística y no cambia de resultado.

## Qué cambió
- **`backend/planning/src/motor_ortools.py`** (nuevo): motor con OR-Tools 9.14, mismo contrato
  que la heurística (`asignar_y_ordenar(pedidos, flota) -> viajes`).
  - Respeta el grupo (mayoreo por zona, tienda EPA en viaje directo). Dentro del grupo decide
    qué pedidos comparten camión y el orden de visita, minimizando viajes y km de carretera
    (ida y vuelta al depósito) con la matriz de `matriz_distancias` (OSRM o línea recta).
  - Restricciones: peso 85 %, volumen 95 %, tope de 16 paradas (los mismos de la heurística).
  - Flota: un viaje por camión por vuelta; si faltan camiones, otra vuelta con la flota
    completa. A igual recorrido prefiere el camión más chico que alcance.
  - Un pedido que excede a todos los camiones va solo en el más grande. Los pedidos sin
    coordenadas ocupan capacidad y quedan al final del viaje.
  - Determinista: búsqueda local hasta el óptimo local, sin metaheurística con reloj. Tiempo
    límite de 10 s por grupo como red de seguridad; si se alcanza, la corrida se descarta.
- **`motor_ruteo.py`**: interruptor por variable de entorno `MOTOR_RUTEO` (`heuristico` por
  defecto, `ortools`). Si el solver falla por cualquier motivo (librería ausente, tiempo,
  error), ese día sale con la heurística y queda el error en el log. `estado()` informa el
  motor activo y prueba el solver.
- **`app.handler`**: la acción `estado_ruteo` ahora devuelve motor activo, solver y OSRM.
- **`template.yaml`**: parámetro `MotorRuteo` (`heuristico` | `ortools`) → `MOTOR_RUTEO`.
  `samconfig.toml` de dev lo fija en `heuristico`.
- **Dependencia:** `backend/planning/src/requirements.txt` con `ortools==9.14.6206` (también en
  `requirements-dev.txt`). `deploy_backend.py` baja las ruedas `manylinux_2_28` solo para
  `planning`; los demás stacks no cambian.

## Decisiones tomadas (revisables)
- **La zona sigue siendo frontera dura.** El solver no mezcla zonas en un camión: mantiene el
  campo `zona` del viaje, las recolectas y la regla de tienda directa. Mezclar zonas es una
  decisión de negocio pendiente.
- **Costo de abrir un viaje = 300 km equivalentes** (`COSTO_FIJO_VIAJE_KM`). Es un valor de
  arranque; se calibra con el costo real por tipo de camión en la fase 6.
- **Ruta de ida y vuelta**, recorrida empezando por el extremo más cercano al depósito.
- **Con OSRM caído el solver corre igual** sobre línea recta (no cae a la heurística).

## Verificación
- Backend: 659 → 674 tests en verde. `tests/test_motor_ortools.py` (15): agrupa por cercanía
  donde la heurística mezcla, capacidades y tope, zonas y tiendas, camión más chico, segunda
  vuelta de flota, pedido excedido, orden y sin coordenadas, determinismo, tiempo agotado, y
  el interruptor (por defecto, activo, solver que falla, librería ausente).
- Comparación sintética en local (matriz en línea recta, 5 zonas, pedidos aleatorios, misma
  flota; script puntual, no quedó en el repo). Mismos viajes en los cuatro casos:

  | Caso | Pedidos | Viajes (heur./solver) | km heur. | km solver | Ahorro | Tiempo solver |
  |---|---|---|---|---|---|---|
  | Día chico | 25 | 5 / 5 | 1.124 | 1.109 | 1 % | < 0,1 s |
  | Día medio | 80 | 10 / 10 | 2.574 | 2.338 | 9 % | < 0,1 s |
  | Día grande | 200 | 19 / 19 | 5.416 | 4.154 | 23 % | 0,1 s |
  | Pocos camiones | 120 | 13 / 13 | 3.523 | 3.041 | 14 % | < 0,1 s |

  Son datos inventados: sirven para ver que el solver funciona y no empeora, no para
  prometer un ahorro. La medición real es la fase 4.
- Sandbox: `dev-tms-planning` redesplegado (paquete de 178 MB sin comprimir, 58 MB
  comprimido; límite de Lambda 250 MB). `{"accion": "estado_ruteo"}` devuelve
  `motor: heuristico`, `ortools: ok, 9.14.6206` y `fuente: osrm`; el log muestra el solver
  resolviendo con la matriz del OSRM. Invocación en caliente: 23 ms y 103 MB de memoria.
- No se midió el arranque en frío con el paquete nuevo, ni se corrió el solver con pedidos
  reales, ni se activó el interruptor en el sandbox.

## Cómo activarlo en el sandbox (cuando se decida)
Cambiar `MotorRuteo=heuristico` por `MotorRuteo=ortools` en `backend/planning/samconfig.toml`
(dev) y correr `python scripts/sandbox/deploy_backend.py planning`. Desde el siguiente replan
los viajes no liberados se rearman con el solver; los ya liberados no se tocan.
