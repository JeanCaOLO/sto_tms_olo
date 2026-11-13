# 06 — Motor de ruteo: fases 2 a 7

**Estado:** pendiente por implementar

**Qué falta:** la fase 1 (aislar la interfaz) está hecha: `plan_builder` llama a
`motor_ruteo.asignar_y_ordenar(pedidos, flota)` y persiste lo que devuelve. El motor sigue
siendo la heurística de siempre (zona + empaque voraz + vecino más cercano en línea recta).
Faltan, en orden:

2. **OSRM propio** y usarlo desde el backend (hoy solo el frontend usa OSRM, y por defecto el
   servidor público sin SLA). Base: `infra/osrm/` (solo descarga el mapa de Costa Rica).
3. **Segundo motor con OR-Tools o PyVRP** detrás de un interruptor, con la heurística actual
   como respaldo.
4. **Comparar en sombra** con días reales de Cofersa: km, camiones usados, paradas por viaje.
5. **T-n con tiempo real de carretera** en vez de 70 km/día en línea recta. Coordinar con el
   OMS: mueve `dispatch_date`, que es lo que usa para liberar.
6. **Costos y terceros:** costo/km por tipo de camión (tablas de costeo) y transportistas
   como segunda opción (hoy sin flota propia responde 409).
7. **Auditoría de corridas** y cerrar el ADR-005 (sigue en "Propuesto").

**Por qué:** hoy nadie minimiza km ni camiones, y el orden de paradas y el T-n ignoran las
calles. El ADR-005 y la fase 8 del roadmap de arquitectura ya piden un solver. Análisis
completo: `analisis-motor-de-ruteo-tms.pdf` (raíz del repo, 2026-11-13).

**Cómo:**
- El motor nuevo va en `backend/planning/src/` y cumple el contrato documentado en la cabecera
  de `motor_ruteo.py` (viaje = `zona`, `veh`, `pedidos` en orden de visita, `peso`, `volumen`,
  `lead`). `plan_builder.py`, `replan.py` y la persistencia no se tocan.
- La matriz de distancias entra como dato del motor; `ruta_geo.py` (`haversine_km`,
  `DEPOT_CR`, `KM_POR_DIA`) es lo que se reemplaza. `DEPOT_CR` debe salir de `tbl_warehouses`.
- El motor debe ser determinista (semilla fija y tiempo límite): el replan corre cada hora y
  no debe reordenar viajes que no cambiaron.
- `backend/tests/test_motor_ruteo.py` fija el comportamiento actual; sirve de base para
  comparar el motor nuevo.
- El frontend tiene su propia heurística en `src/pages/planificacion/` (`plan-automatico.ts`,
  `optimize-stops.ts`, `tiempo-cluster.ts`), con reglas algo distintas. Retirarla cuando el
  cálculo quede solo en el backend.
