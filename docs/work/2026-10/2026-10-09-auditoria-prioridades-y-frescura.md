# Auditoría contra las prioridades de la optimización (2026-10-09)

Prioridades, en orden de conflicto: (1) datos al día, sin excepción; (2) velocidad de carga; (3) velocidad de cálculo; (4) menor gasto.
Base: código de la rama `dylan-tarifas` (`catalogLoader.ts`, `tripSettlement.ts`, `settlementsDataSource.ts`, `backend/tarifas/template.yaml`) y las mediciones de `12-reprueba-backend-nuevo-en-local.md`. No se tocó AWS: lo que depende de métricas reales de AWS queda marcado "sin medir".

## 1. Frescura de datos (la restricción crítica)

| Dato | Dónde se guarda | Vigencia | Riesgo |
|---|---|---|---|
| Catálogo (reglas, tarifarios, zonas, costos, margen) | memoria del navegador, `catalogLoader.ts:315` | 5 min; se descarta al escribir en ESTA sesión | **ALTO** (ver F1) |
| Perfil del transportista | `partiesDataSource.ts` | 5 min; igual invalidación | Medio (F2) |
| Permisos | Lambda, `TMS_PERMS_TTL_SECONDS` | 30 s | Bajo: quitar un permiso tarda hasta 30 s en surtir efecto |
| Viajes, pedidos, marcas, liquidaciones | sin caché | siempre frescos | Ninguno |
| Pestaña abierta mucho tiempo | lista cargada al abrir | hasta que se recargue | Bajo (F3) |

**F1 (alto). La liquidación se emite con un cálculo hecho con catálogo de hasta 5 min.**
`calculateTrip` usa `loadTarifasCatalog` con caché. `emitSettlement` relee solo el viaje (`settlementsDataSource.ts:333`), no el catálogo. Si otra persona cambia una tarifa o una regla, y alguien emite dentro de esos 5 min con el modal ya calculado, se paga con la tarifa vieja y queda un snapshot (`rules_used`, `trace`) que parece correcto. La re-liquidación lo corrige después, pero el pago ya pudo salir. Antes de la caché esto no pasaba. Es una regresión de frescura introducida por la optimización.
Las tablas del catálogo no tienen `updated_at` en el manifiesto, así que no hay una comprobación barata de versión.
Arreglo propuesto, sin tocar el backend: al pulsar Emitir / Re-liquidar, leer el catálogo SIN caché (2 llamadas `/batch`, ~0,5–1 s en AWS), recalcular y comparar `totalLiquidado` y `rulesUsed` con lo que ve la persona. Si difiere, no emitir: mostrar "las tarifas cambiaron, total nuevo X" y pedir confirmar. Costo: una lectura extra solo al emitir, nunca al navegar. Emitir es la única operación donde pagar una tarifa vieja es irreversible.

**F2 (medio). Perfil del transportista en caché 5 min.** Si otro usuario inactiva el perfil o cambia su estado, el cálculo sigue usando el anterior. El arreglo de F1 también lo cubre si la relectura al emitir incluye el perfil.

**F3 (bajo). Bandeja sin refresco.** No hay sondeo ni recarga al volver a la pestaña. Un viaje liquidado por otra persona sigue apareciendo hasta recargar; `emitSettlement` ya lo atrapa (relee el viaje y devuelve `blocked`), así que no hay doble liquidación. Mejora opcional: recargar la lista en `visibilitychange` si pasaron más de 60 s (1 llamada, sin costo si la pestaña no se usa).

**Qué sí protege hoy la frescura:** emitir relee el viaje y exige estado `completed` y sin liquidación vigente; la restricción única de base impide dos vigentes por viaje; re-liquidar es transaccional; el snapshot guarda `trip_info` releído.

**Decisión sugerida:** mantener TTL de 5 min para navegar (rápido) y volver obligatoria la relectura fresca al emitir (F1). Si no se quiere implementar F1 ya, bajar `CATALOG_TTL_MS` a 60 s reduce la ventana pero no la elimina.

## 2. Velocidad de carga

Medido en local (sirve para comparar, no son tiempos de AWS): modal con transportista nuevo 14–15 s → 5,0 s; ya visto 6,0 → 1,0 s; con cursor sobre "Liquidar" 0,84 s; marcar pedido 4–7 → 2,0 s; por llamada 0,6 → 0,27 s.
Todo eso exige desplegar el backend nuevo; con el desplegado, `/batch` da 404 y se cae a ~11 lecturas sueltas. Es el factor dominante y depende del despliegue del líder.
Pendiente de mejora:
- Lista de arranque ~5,5 s en local: no medible aquí (el servidor local serializa). Medir en AWS tras el despliegue.
- La caché del catálogo es por pestaña: cada pestaña/usuario paga el arranque en frío. `Cache-Control` en lecturas de catálogo no aplica porque son `POST`.
- Exportar Excel (E13) sin indicador de progreso, librería `xlsx` pesada: cargarla con `import()` bajo demanda si hoy va en el bundle inicial (sin verificar).

## 3. Velocidad de cálculo

El motor `calculate()` es local, puro y sin red: el tiempo del cálculo es casi todo lectura de datos (>90 % de los 1–5 s medidos). Acciones hechas: pedidos en paralelo con perfil y catálogo, viaje reutilizado en recálculos, `structuredClone` del catálogo cacheado. Recalcular tras editar variables ya no vuelve a leer nada pesado (3 llamadas → las del viaje y pedidos).
Pendiente: `structuredClone` del catálogo en cada cálculo cuesta poco con catálogos pequeños; si crece (cientos de reglas/filas de tarifario) conviene congelar el catálogo (`Object.freeze` profundo) en vez de clonar. Sin medir con datos grandes.
Riesgo de escala: con 3 filas los índices 26/27 no muestran efecto; no hay prueba con volumen real.

## 4. Gasto

Palancas ya activas en el backend nuevo (efecto sin medir en AWS): caché de permisos (~4 consultas menos por petición), `/batch` (11 → 2 invocaciones por catálogo en frío), `columns` (menos bytes JSONB), `statement_timeout`/`lock_timeout` (una consulta colgada ya no consume los 15 s del Lambda), caché cliente (menos invocaciones).
Contra el gasto:
- El prefetch al pasar el cursor dispara 2–6 llamadas por hover. Con el TTL de 5 min un transportista se calienta una vez, pero recorrer la tabla con el mouse calienta todos. Mitigación: retardo de ~300 ms antes de disparar (el prefetch ya es idempotente).
- Aurora es compartida y funciona L–V 04:45–17:00; no hay gasto nuevo por esta rama.
Palancas sin usar (necesitan a Intelix, solo para proponer): `arm64` en el Lambda (hoy `x86_64`, `template.yaml:38`) suele costar ~20 % menos por ms; `MemorySize` 512 sin evidencia de si es mayor o menor al óptimo (hace falta ver `Max Memory Used` en CloudWatch); retención de logs 7/30 días ya es corta. Las métricas EMF nuevas (`tarifas_metrics.py`) permitirán cuantificar todo esto después del despliegue.

## 5. Conflictos entre prioridades

- Caché (más velocidad y menos gasto) vs. frescura: se resuelve con la relectura obligatoria al emitir (F1). Es la única operación con efecto de dinero.
- TTL 5 min vs. 60 s: 60 s da menos ventana pero hace que casi todo "primer cálculo" del día vuelva a costar ~9 s sin `/batch`. Con `/batch` desplegado, 60 s costaría ~1 s y es defendible.
- Prefetch (carga) vs. gasto: el retardo de 300 ms cuesta nada.

## 6. Lista priorizada

1. Relectura sin caché del catálogo y perfil al emitir/re-liquidar, con aviso si cambia el total (F1, F2). Prioridad máxima; no requiere backend.
2. Retardo de 300 ms al prefetch por hover.
3. Recargar la bandeja al volver a la pestaña tras 60 s (F3).
4. Tras el despliegue: medir en AWS (lista de arranque, `Max Memory Used`, EMF), decidir `arm64`/memoria con Intelix, y evaluar bajar el TTL a 60 s.
5. Probar con volumen real (cientos de viajes/reglas) antes de afirmar que el cálculo escala.

Sin verificar en esta auditoría: costos reales en AWS, comportamiento con volumen, efecto de los índices 26/27, métricas EMF.

## 7. Implementación y prueba (2026-10-09)

Commit `b5c22ef`. Solo frontend; `backend/` no cambia.

| Acción | Resultado |
|---|---|
| Relectura sin caché al emitir/re-liquidar (F1, F2) | Probado en el navegador con la API local: con el modal de RT-DEMO-3 abierto (total 28 224,00) se cambió la tarifa de la zona 01 en Aurora por fuera de la sesión (25 200 → 26 000). Al emitir, el modal NO emitió y mostró "Total anterior $28,224.00, total actual $29,120.00". El segundo clic emitió LIQ-CR-008 por 29 120,00, el valor nuevo. La tarifa se revirtió a 25 200 y LIQ-CR-008 se anuló. |
| Prefetch con retardo de 300 ms | Pasar el cursor por 8 botones "Liquidar" durante 60 ms cada uno: 0 llamadas. Dejar el cursor quieto sobre uno: dispara la lectura del perfil y el catálogo. |
| Recarga al volver a la pestaña | Con más de 60 s desde la última carga: relee viajes y liquidaciones (una vez). Un segundo evento inmediato: 0 llamadas. |

Pruebas automáticas nuevas: `catalogCache.test.ts` (opción `fresh`) y `recheckBeforeEmit.test.ts`. Pasan 792 pruebas del frontend.
Pendiente (no se puede hacer antes del despliegue o sin datos reales): medir en AWS (lista de arranque, memoria, EMF), decidir `arm64` y memoria con Intelix, evaluar bajar el TTL a 60 s, y probar con volumen real.
Datos tras la prueba: LIQ-CR-008 (RT-DEMO-3) quedó Anulada; el viaje vuelve a la bandeja. La tarifa FLETE_ZONA de Luis Carlos Mora, zona 01, vuelve a valer 25 200.
