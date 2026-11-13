# 06 — Motor de ruteo: fases 5 a 7

**Estado:** pendiente por implementar

**Dónde estamos (2026-11-13):**

| Fase | Estado |
|---|---|
| 1. Aislar la interfaz (`motor_ruteo.asignar_y_ordenar`) | Hecha |
| 2. OSRM propio (stack `dev-tms-osrm`, `matriz_distancias.py`) | Hecha. Mapas de Costa Rica (:5000) y Venezuela (:5001) |
| 3. Motor con OR-Tools (`motor_ortools.py`) detrás de `MOTOR_RUTEO` | Hecha |
| 4. Comparación en sombra (`{"accion": "comparar_motores"}`) | Hecha: 23 días de Cofersa, −9,4 % km, mismos viajes, ningún día peor |
| Activación en el sandbox (`MotorRuteo=ortools`) | **Hecha (2026-11-13).** El replan horario ya arma con OR-Tools |
| Venezuela (sede por almacén, mapa y flota por país) | Hecha en el motor; faltan datos e ingesta: ver [07](07-venezuela-ruteo.md) |
| 5. T-n con tiempo real de carretera | Pendiente |
| 6. Costos por tipo de camión y transportistas terceros | Pendiente |
| 7. Auditoría de corridas y cerrar ADR-005 | Pendiente |

Volver a la heurística: `MotorRuteo=heuristico` en `backend/planning/samconfig.toml` (dev) y
`python scripts/sandbox/deploy_backend.py planning`. Repetir la comparación:
`{"accion": "comparar_motores", "dias_atras": 45}` en la Lambda de planning.

**Qué falta:**

5. **T-n con tiempo real de carretera** en vez de 70 km/día en línea recta
   (`ruta_geo.lead_time_dias`). Coordinar con el OMS: mueve `dispatch_date`, que es lo que usa
   para liberar. En Venezuela importa más: las distancias son mayores.
6. **Costos y terceros:** costo/km por tipo de camión (tablas de costeo) en lugar de
   `motor_ortools.COSTO_FIJO_VIAJE_KM = 300`, y transportistas terceros como segunda opción
   (hoy, sin flota propia del país, responde 409).
7. **Auditoría de corridas** (guardar entrada y resultado de cada corrida, como pide el
   ADR-005) y pasar el ADR-005 de "Propuesto" a "Aceptado".

**Por qué:** el orden de paradas y el reparto ya usan carreteras y el solver; el T-n, los costos
y la trazabilidad todavía no. Análisis completo: `analisis-motor-de-ruteo-tms.pdf` (raíz del
repo, 2026-11-13).

**Cómo:**
- Todo motor nuevo cumple el contrato de la cabecera de `motor_ruteo.py`:
  `asignar_y_ordenar(pedidos, flota, sede)` → viajes (`zona`, `veh`, `pedidos` en orden de
  visita, `peso`, `volumen`, `lead`). `plan_builder.py`, `replan.py` y la persistencia no cambian.
- La sede (`ruta_geo.Sede`) trae el depósito del almacén y la región del mapa.
- El motor debe ser determinista: el replan corre cada hora y no debe reordenar viajes que no
  cambiaron.
- El frontend tiene su propia heurística en `src/pages/planificacion/` (`plan-automatico.ts`,
  `optimize-stops.ts`, `tiempo-cluster.ts`), con reglas algo distintas. Retirarla cuando el
  cálculo quede solo en el backend.

**Sueltos del OSRM propio:**
- **Frontend sigue en el OSRM público.** El propio solo es alcanzable desde las Lambdas. Para
  que el mapa y la matriz del frontend lo usen hace falta exponerlo por HTTPS: una ruta del
  backend que haga de puente (`/api/v1/planificacion/osrm/...`) o un dominio con certificado.
  Archivos: `src/pages/planificacion/osrm-config.ts`, `src/pages/tracking/route-osrm.ts`.
- **Mapas sin actualización automática.** Renovarlos exige reemplazar la instancia.
- **QA y producción:** Intelix debe decidir dónde vive el OSRM y pasar `OsrmUrl` al stack
  `planning`; sin eso el backend usa línea recta.
- **Desarrollo local:** `npm run api:local` no llega al OSRM del sandbox (el SG no abre al
  bastión). Usar el compose y `OSRM_URL=http://localhost:5000`, o línea recta.
- **Por verificar:** primer encendido y apagado por schedule (2026-11-13 17:00 y 2026-11-16
  04:45).

**Sueltos del solver:**
- **Zona como frontera dura.** El solver no mezcla zonas en un camión. Mezclarlas puede
  ahorrar más, pero cambia el significado de `plan_trips.delivery_zone`, las recolectas
  (`recolectas.elegir_viaje`) y los días de anticipo por zona. Decisión de negocio.
- **Sin metaheurística.** La búsqueda se detiene en el óptimo local para que el replan sea
  determinista. `GUIDED_LOCAL_SEARCH` da mejores rutas pero corta por reloj; usarla exige no
  re-resolver los días cuyos pedidos no cambiaron.
- **Camiones de los viajes congelados.** El motor recibe la flota completa y no sabe qué camiones
  ya usan los viajes liberados del mismo día: puede asignar uno de esos camiones a un viaje nuevo
  (visto el 2026-11-16: 10 viajes con 9 camiones). Pasar a `asignar_y_ordenar` los camiones
  ocupados (`viajes_liberados.plan_vigente`) para que el solver los cargue con `usos` iniciales.
- **Sin ventanas de tiempo ni jornada del chofer**, igual que la heurística: en 6 de 23 días
  hay más viajes que camiones (hasta 2,7 por camión) y nadie verifica que quepan en un día.
- **Paquete de la Lambda:** 178 MB de 250 MB. `numpy` y `pandas` (unos 100 MB) vienen como
  dependencias de OR-Tools y el ruteo no las importa; se pueden excluir si hace falta espacio.
- **QA y producción:** el `sam build` de Intelix debe poder instalar `ortools` (ruedas
  `manylinux_2_28`); el parámetro `MotorRuteo` queda en `heuristico` por defecto fuera de dev.

**Sueltos de los datos (comparación):**
- **EPA sin coordenadas.** Sus pedidos no tienen latitud ni longitud, y sus 9.711 puntos de
  entrega tampoco: ningún motor puede ordenarlos. Geocodificar los puntos de EPA (el
  planificador ya toma las coordenadas del punto de entrega cuando el pedido no las trae).
- **Peso y volumen incompletos.** 20 % de los pedidos de Cofersa sin peso y 51 % sin
  volumen; ocupación de peso por viaje ≤ 7 %. La capacidad nunca limita, así que el solver no
  puede ahorrar viajes, solo km. Completar esos datos en la ingesta.
- **La comparación mide recorridos planificados, no kilómetros manejados.** Contrastar con las
  posiciones GPS de Tracking (`tbl_tracking_positions`) cuando haya viajes ejecutados con el
  solver activo.
