# Solicitud a ePRAC: ajustes al API General eFlow WMS v1.0.0

> Para: ePRAC. De: equipo TMS/OMS (OLO). Fecha: 2026-11-23 (actualiza la del 2026-11-20).
> Sobre: documento "ePRAC - 158 - OLO - API proyecto TMS-OMS" v1.0.0 (2026-11-12).

## Contexto en una línea

Probamos en QA (`10.17.224.224:87`) todos los endpoints, lectura y escritura. Funcionan y el TMS ya hace el ciclo
completo con el API: lee la cola, planifica, prioriza, asigna bajada y libera. Los campos que trae hoy
`ObtenerExpediciones` **alcanzan**: no pedimos campos nuevos ni el detalle de líneas. Lo que sigue son ajustes y
preguntas puntuales.

## A. Consulta (`GET /api/Expediciones/ObtenerExpediciones`)

**A1. Filtro por fecha de entrega.** Hoy `FechaInicio` y `FechaFinal` filtran por `fechaExpedicion` (fecha de
creación). Necesitamos filtrar por **`fechaExpedicionPlanificada`** (fecha de entrega), o poder elegir el campo de
fecha. Mientras tanto pedimos una ventana ancha y filtramos de nuestro lado.

**A2. Consulta por llave.** Un GET (o POST de consulta) que reciba una o varias llaves y devuelva esas expediciones
sin rango de fechas ni estado/situación. Lo usamos para saber qué pasó con un pedido que salió de la cola DISP/DISP.

## B. Escrituras

**B1. Número de viaje (`AsignarNumeroViajeWMH`).** Solo acepta viajes que ya existen en WMH: con un viaje existente
(`8213`) funcionó; con un número nuevo del TMS responde `ERROR_PROCESAMIENTO`.
- ¿Hay que seguir enviando el número de viaje ahora que el OMS reemplaza al WMH?
- Si sí: ¿cómo se crea el viaje en WMH (endpoint)?
- ¿Cómo se le quita el viaje a un pedido? Con `numeroViajeWmh = 0` responde `ERROR_PROCESAMIENTO` y con `null`
  rechaza el JSON.
- Que el error diga la causa (por ejemplo "el viaje no existe") en vez de `ERROR_PROCESAMIENTO`.

**B2. `GenerarAcciones` sobre un pedido ya `GENE`.** Responde OK y lo vuelve a pasar a `SOAC` (y después a `GENE`).
¿Genera las acciones de picking dos veces? Si es así, que rechace los pedidos que ya están en `GENE`.

**B3. Validaciones.** `CambiarPrioridadExpedicion` acepta `prioridad = -1` y `AsignarNumeroBajada` acepta `bajada = -1`.
¿Son valores válidos? Si no, que los rechace.

**B4. División de pedido.** Se pidió en la reunión del 21-oct y no aparece en la v1.0.0. ¿Va en otra versión?

**B5. Documentación de `SOAC`.** El documento dice que `GenerarAcciones` deja el pedido en `SOAC`; no dice que el
monitor de eFlow lo pasa solo a `GENE` (en QA tardó unos 2 minutos). Que lo explique, con el tiempo máximo y qué pasa
si el monitor está detenido.

## C. Ambientes y datos de prueba

**C1.** URL y credenciales del API de **producción** (CR).

**C2.** URL y credenciales de QA de **Venezuela**.

**C3.** Más pedidos DISP/DISP en QA con fecha de entrega de hoy en adelante: el 23-nov había uno solo.

## Resumen

| # | Qué | Tipo |
|---|---|---|
| A1 | Filtro por fecha de entrega | Cambio de filtro |
| A2 | Consulta por llave | Endpoint nuevo |
| B1 | Número de viaje: ¿se sigue enviando?, crear y quitar viaje, mensaje de error | Pregunta |
| B2 | `GenerarAcciones` repetido sobre un pedido `GENE` | Pregunta o validación |
| B3 | Prioridad y bajada negativas | Validación |
| B4 | División de pedido | Pregunta |
| B5 | Documentar el paso `SOAC` → `GENE` | Documentación |
| C1–C3 | Producción, QA VE, datos de prueba | Ambientes |

Detalle de cada prueba: [pruebas-api-eprac-qa.md](pruebas-api-eprac-qa.md).
