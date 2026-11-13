# 06 — Motor de ruteo: fases 3 a 7

**Estado:** pendiente por implementar

**Qué falta:** la fase 1 (aislar la interfaz) está hecha: `plan_builder` llama a
`motor_ruteo.asignar_y_ordenar(pedidos, flota)` y persiste lo que devuelve. El motor sigue
siendo la heurística de siempre (zona + empaque voraz + vecino más cercano en línea recta).
La fase 2 (OSRM propio) también: stack `dev-tms-osrm` en el sandbox y
`matriz_distancias.construir(puntos)` en el backend, con respaldo en línea recta. El motor
todavía no consume esa matriz. Faltan, en orden:

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
- La matriz de distancias entra como dato del motor: `matriz_distancias.construir(puntos)`
  devuelve `km`, `min` y `fuente`. `ruta_geo.py` (`haversine_km`, `DEPOT_CR`, `KM_POR_DIA`) es
  lo que se reemplaza. `DEPOT_CR` debe salir de `tbl_warehouses`.
- Si `fuente` es `haversine` (OSRM caído), el solver debe poder correr igual; decidir si en ese
  caso se usa la heurística de respaldo.
- El motor debe ser determinista (semilla fija y tiempo límite): el replan corre cada hora y
  no debe reordenar viajes que no cambiaron.
- `backend/tests/test_motor_ruteo.py` fija el comportamiento actual; sirve de base para
  comparar el motor nuevo.
- El frontend tiene su propia heurística en `src/pages/planificacion/` (`plan-automatico.ts`,
  `optimize-stops.ts`, `tiempo-cluster.ts`), con reglas algo distintas. Retirarla cuando el
  cálculo quede solo en el backend.

**Sueltos de la fase 2 (OSRM propio):**
- **Frontend sigue en el OSRM público.** El propio solo es alcanzable desde las Lambdas. Para
  que el mapa y la matriz del frontend lo usen hace falta exponerlo por HTTPS: una ruta del
  backend que haga de puente (`/api/v1/planificacion/osrm/...`) o un dominio con certificado.
  Archivos: `src/pages/planificacion/osrm-config.ts`, `src/pages/tracking/route-osrm.ts`.
- **Solo Costa Rica.** Venezuela necesita su propio mapa (otro contenedor u otra instancia).
- **Mapa sin actualización automática.** Renovarlo exige reemplazar la instancia.
- **QA y producción:** Intelix debe decidir dónde vive el OSRM y pasar `OsrmUrl` al stack
  `planning`; sin eso el backend usa línea recta.
- **Desarrollo local:** `npm run api:local` no llega al OSRM del sandbox (el SG no abre al
  bastión). Usar el compose y `OSRM_URL=http://localhost:5000`, o línea recta.
- **Por verificar:** primer encendido y apagado por schedule (2026-11-13 17:00 y 2026-11-16
  04:45), y la matriz con el tamaño real de un día (el servidor acepta hasta 1.000 puntos).
