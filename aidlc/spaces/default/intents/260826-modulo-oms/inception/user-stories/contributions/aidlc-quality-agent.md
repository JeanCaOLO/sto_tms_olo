**Collaborator:** aidlc-quality-agent

## Contribution

Revisado el story map (33 historias, 9 épicas) contra `requirements.md` v2 (FR1–FR14,
NFR1–NFR9) desde testabilidad, cobertura y casos negativos. El mapa está bien
estructurado y usa Given/When/Then consistente. Hallazgos concretos para que el lead
los integre:

### (a) Testabilidad — historias ambiguas o no verificables

Estas cinco no tienen criterio de pase/fallo comprobable como están; sugiero afinar
el Then:

- **US12** — "dispara la acción correspondiente" no es verificable (no dice qué acción
  para qué clase). Concretar al menos el caso de 1ª entrega: `Then clasifica la
  observación y, si es "retira", marca el pedido como cliente-retira`. Lo demás queda
  como salida futura, sin criterio ahora.
- **US25** — "veo los KPIs de la operación del día" no es testable (KPI no enumerado).
  Nombrar al menos un indicador con dato esperado (p. ej. % override, nº generados hoy).
- **US11** — "suben de prioridad" sin referencia: `Then su número de prioridad
  disminuye respecto a la corrida anterior` (prioridad invertida → subir = número menor).
- **US10** — el segundo G/W/T ("prioridad 1 vs 2, el 1 se atiende antes") prueba orden,
  no el cálculo del score; falta un criterio que verifique la ponderación (cliente
  retira pesa más que fecha → menor número).
- **US23** — modo mixto: falta el criterio de **borde exacto de la hora de corte**
  (intervención justo en el minuto de corte → ¿aplica o espera?). Definirlo evita un
  test indeterminado.

### (b) Cobertura — FR/NFR sin criterio de aceptación

- **FR3.4 (umbral de inyección) — HUECO.** Es requisito funcional y **no aparece en
  `traceability.json` ni en ninguna historia**. El motor "solo prepara hasta cierta
  prioridad; el resto espera" no tiene G/W/T. Depende de OQ-5 pero el comportamiento
  (cortar por umbral) es modelable ahora aunque el valor quede parametrizable. Añadir
  historia en E2, p. ej. **US-nuevo**: `Given un umbral U y pedidos con prioridad > U,
  When el motor corre, Then esos pedidos NO se generan y esperan`. Sin esto, NFR4
  (~80 en proceso) queda sin verificación.
- **NFR6 (auditoría solo-lectura) — parcial.** US27 la describe como solo-lectura pero
  no hay criterio **negativo** que lo verifique: `Given un registro de auditoría, When
  un usuario intenta editarlo/borrarlo, Then la acción se deniega`.
- **NFR5 (aislamiento multi-compañía)** — cubierto por US30 con G/W/T claro. AGREE.
- **NFR7 (no modificación de fechas)** — cubierto como invariante verificable en US7 y
  US9. Bien planteado (es un assert directo: fecha antes == fecha después). AGREE.
- **NFR2 (costo IA < $1/mes)** — sin historia. Es NFR de operación, aceptable diferirlo
  a performance-validation, pero conviene una nota explícita de que se valida allí y no
  en User Stories, para que no se pierda.

### (c) Casos borde / negativos faltantes

Además del umbral (arriba) y la auditoría solo-lectura:

- **Pedido sin fecha de entrega (FR2.5, fallback por ruta)** — es el caso real de
  Cofersa hoy (OQ-3), no un borde teórico. US7 solo cubre el camino con fecha. Falta:
  `Given un pedido sin fecha de expedición planificada, When el motor corre, Then aplica
  el fallback por día de ruta para decidir el T-1`. Es el caso más probable en 1ª
  entrega — debería tener criterio, no solo listarse como dependencia.
- **Override con motivo vacío** — US14 exige "motivo obligatorio" pero no hay criterio
  negativo: `Given un override sin motivo, When intento guardarlo, Then se rechaza`.
  Es el par natural de US15 (sin permiso).
- **Pedido sin ruta / sin hora de corte definida** — US8 asume que la ruta tiene corte;
  falta el degradado: qué hace el motor si la ruta no tiene calendario/corte cargado.
- **Re-simular sobre prioridades ya asignadas** — mencionado en US19 pero sin criterio
  de que no corrompa las prioridades vigentes hasta aplicar.

### (d) Trazabilidad US→FR

Correcta y sin huecos **salvo FR3.4** (ver arriba): ningún `traces_to` lo referencia.
Observaciones menores:
- La granularidad a FR de primer nivel está bien documentada en el `trace_granularity_note`.
- FR6.4 (Regla 4) y FR6.5 (Regla 5) sin historia — correcto, están fuera de alcance y
  así se declara. No es hueco.
- Sugerencia: cuando se añada la historia de umbral, actualizar `fr_coverage.FR3` para
  incluirla.

### Nota de estrategia de test (para build-and-test)

El invariante NFR7 (no-fechas) y el aislamiento NFR5 son los dos candidatos naturales a
**test de invariante barato**: un assert de igualdad de fecha pre/post y un assert de
que ninguna query cruza `compañía`. Recomiendo marcarlos como tests obligatorios del
motor desde la 1ª entrega.

## Positions

- AGREE: NFR7 (no-fechas) como invariante en US7/US9 — es un criterio verificable y
  directo, bien planteado.
- AGREE: NFR5 (aislamiento) cubierto por US30 con G/W/T claro y testeable.
- AGREE: dejar Regla 4/5 sin historia — correcto, están fuera de alcance y declarado.
- OBJECT: FR3.4 (umbral de inyección) sin historia ni traza — es un FR, no un NFR
  diferible; su ausencia deja NFR4 sin verificación y es modelable ahora.
- OBJECT: fallback por ruta (FR2.5) sin criterio en US7 — es el caso real de Cofersa en
  1ª entrega, no un borde diferible; necesita G/W/T propio.
- OBJECT: falta criterio negativo para auditoría solo-lectura (NFR6) y para override sin
  motivo (US14) — ambos son pares negativos baratos de historias ya presentes.
