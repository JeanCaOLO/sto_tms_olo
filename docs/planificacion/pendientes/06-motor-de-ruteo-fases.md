# 06 — Motor de ruteo: activar el solver y fases 5 a 7

**Estado:** pendiente por implementar

**Qué falta:** la fase 1 (aislar la interfaz) está hecha: `plan_builder` llama a
`motor_ruteo.asignar_y_ordenar(pedidos, flota)` y persiste lo que devuelve. El motor sigue
siendo la heurística de siempre (zona + empaque voraz + vecino más cercano en línea recta).
La fase 2 (OSRM propio) también: stack `dev-tms-osrm` en el sandbox y
`matriz_distancias.construir(puntos)` en el backend, con respaldo en línea recta.
La fase 3 (motor con OR-Tools) también: `motor_ortools.py`, elegido con la variable
`MOTOR_RUTEO=ortools` y con la heurística como respaldo. **El interruptor está apagado** en
el sandbox: nadie lo usa todavía.
La fase 4 (comparación en sombra) también: en 23 días reales de Cofersa el solver arma los
mismos viajes con los mismos camiones y 9,4 % menos km de carretera, ningún día peor y sin
errores (`docs/work/2026-11/2026-11-13-motor-ruteo-fase4-comparacion.md`). Para repetirla:
invocar la Lambda con `{"accion": "comparar_motores", "dias_atras": 45}`. Faltan, en orden:

- **Decidir y activar el solver** en el sandbox: `MotorRuteo=ortools` en
  `backend/planning/samconfig.toml` (dev) y `python scripts/sandbox/deploy_backend.py planning`.
  Desde el siguiente replan, los viajes no liberados se rearman con el solver. Volver atrás es
  el mismo cambio con `heuristico`.
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
- Con OSRM caído (`fuente: haversine`) el solver corre igual sobre línea recta. Revisar en la
  fase 4 si conviene más caer a la heurística.
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

**Sueltos de la fase 3 (motor con OR-Tools):**
- **Zona como frontera dura.** El solver no mezcla zonas en un camión. Mezclarlas puede
  ahorrar más, pero cambia el significado de `plan_trips.delivery_zone`, las recolectas
  (`recolectas.elegir_viaje`) y los días de anticipo por zona. Decisión de negocio.
- **Costo fijo por viaje sin calibrar.** `motor_ortools.COSTO_FIJO_VIAJE_KM = 300` es un valor
  de arranque. Sale de las tablas de costeo en la fase 6.
- **Sin metaheurística.** La búsqueda se detiene en el óptimo local para que el replan sea
  determinista. `GUIDED_LOCAL_SEARCH` da mejores rutas pero corta por reloj; usarla exige no
  re-resolver los días cuyos pedidos no cambiaron.
- **Depósito fijo** (`ruta_geo.DEPOT_CR`) y **sin ventanas de tiempo ni jornada del chofer**:
  igual que la heurística.
- **Paquete de la Lambda:** 178 MB de 250 MB. `numpy` y `pandas` (unos 100 MB) vienen como
  dependencias de OR-Tools y el ruteo no las importa; se pueden excluir del empaquetado si
  hace falta espacio o el arranque en frío molesta. No se midió el arranque en frío.
- **QA y producción:** el `sam build` de Intelix debe poder instalar `ortools` (ruedas
  `manylinux_2_28`); el parámetro `MotorRuteo` queda en `heuristico` por defecto.

**Sueltos de la fase 4 (comparación):**
- **EPA sin coordenadas.** Sus pedidos (41 en 9 días) no tienen latitud ni longitud: ningún
  motor puede ordenarlos ni medirlos. Revisar de dónde salen las coordenadas de las tiendas
  (`tbl_final_customers` / puntos de entrega) en la ingesta.
- **Peso y volumen incompletos.** 20 % de los pedidos de Cofersa sin peso y 51 % sin
  volumen; ocupación de peso por viaje ≤ 7 %. La capacidad nunca limita, así que el solver no
  puede ahorrar viajes, solo km. Completar esos datos en la ingesta (`ingest_orders.py`,
  `ingest_items.py`) antes de calibrar la fase 6.
- **Más viajes que camiones** en 6 de 23 días (hasta 2,7 por camión), con los dos motores.
  Agregar jornada del chofer (ventanas de tiempo) al solver o revisar el tope de 16 paradas.
- **La comparación mide recorridos planificados, no kilómetros manejados.** Contrastar con las
  posiciones GPS de Tracking (`tbl_tracking_positions`) cuando haya viajes ejecutados con el
  solver activo.
