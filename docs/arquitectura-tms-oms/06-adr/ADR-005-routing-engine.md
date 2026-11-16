# ADR-005 — Motor de Ruteo (Routing Engine)

**Estado:** Aceptado (2026-11-13). Implementado en `backend/planning/src/` y activo en el sandbox.

## Contexto

El prompt maestro pide generación dinámica de rutas considerando decenas de
variables simultáneas (capacidad, ventanas, licencias, costo, SLA, km
vacíos, etc.) y explícitamente prohíbe "implementar un algoritmo casero
deficiente si existe una solución robusta" (§15).

Hasta noviembre de 2026 Planificación armaba los viajes con una heurística propia:
agrupar por zona, empaque voraz por capacidad y vecino más cercano en línea recta.
El análisis completo está en `analisis-motor-de-ruteo-tms.pdf` (raíz del repo).

## Decisión

Usar **Google OR-Tools** (modelo VRP con capacidades) como motor de ruteo, con un
motor de calles propio (**OSRM**) para distancias y tiempos reales, detrás de una
interfaz única y con la heurística anterior como respaldo.

Cómo quedó (2026-11-13):

- **Interfaz:** `motor_ruteo.asignar_y_ordenar(pedidos, flota, sede, usos_previos,
  informe, costos)` → viajes. `plan_builder` solo lee, llama al motor y persiste.
- **Motores:** `motor_ortools.py` (solver) y la heurística, elegidos con `MOTOR_RUTEO`
  (`ortools` | `heuristico`). Si el solver falla, ese día sale con la heurística.
- **Matriz:** `matriz_distancias.py` contra OSRM propio (stack `dev-tms-osrm`, mapas de
  Costa Rica y Venezuela), por bloques; si OSRM no responde, línea recta.
- **Determinismo:** búsqueda local hasta el óptimo local, sin metaheurística con reloj, y
  tiempo límite como red de seguridad. El replan horario no reordena lo que no cambió.
- **Por país:** depósito del almacén, mapa y flota propia del país (`ruta_geo.Sede`).
- **Costo (fase 6):** con `COSTOS_MODO=reales` minimiza colones según las tablas de
  costeo por tipo de camión; con `USAR_TERCEROS=si` puede usar terceros. Apagados.
- **T-n (fase 5):** con `TN_MODO=carretera` los días de anticipación salen de los minutos
  de manejo (135 por día). Apagado.
- **Auditoría (fase 7):** cada corrida queda en `tbl_routing_runs` (sql/72) con entrada,
  resultado, parámetros, motor y matriz, en la misma transacción que el plan (ADR-007).
- **Ejecución:** síncrona dentro de la Lambda de planning (replan horario por Scheduler y
  armado manual). Con el volumen actual cada día se resuelve en menos de 2 s.

## Consecuencias

- Medido en 32 días reales de Cofersa: mismos viajes y camiones que la heurística, 9,4 %
  menos km de carretera y ningún día peor (`docs/work/2026-11/`).
- El paquete de la Lambda pesa 178 MB (OR-Tools + numpy + pandas) de 250 MB.
- OSRM es infraestructura propia: se opera, se apaga con Aurora y sus mapas no se
  actualizan solos. QA y producción necesitan su propio OSRM o quedan en línea recta.
- La zona sigue siendo frontera dura: el solver no mezcla zonas en un camión.
- Sin ventanas de tiempo ni jornada del chofer: un camión puede tener más de un viaje al
  día sin verificar que quepa.

## Alternativas rechazadas

- **Heurística propia (nearest-neighbor simple, sin 2-opt/3-opt)**:
  rechazada explícitamente por el prompt maestro y por buen juicio de
  ingeniería — es exactamente el tipo de "algoritmo casero deficiente" que
  se pide evitar. Se conserva solo como respaldo.
- **Google Route Optimization API**: costo por uso, caja negra y reglas propias difíciles
  de expresar; la matriz de Google costaría ~USD 1.700/mes (`docs/tracking/alternativas-mapas.md`).
- **PyVRP**: igual de viable; se eligió OR-Tools por ser el que ya nombraba este ADR.
- **Bloquear el request HTTP durante la optimización**: rechazado por
  requisitos de performance (§43). Hoy el solver cabe en la Lambda; si el volumen crece
  (días de miles de pedidos) pasar a un trabajo asíncrono.
