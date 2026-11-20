# Solicitud a ePRAC: lo que le falta al API General eFlow WMS v1.0.0

> Para: ePRAC. De: equipo TMS/OMS (OLO). Fecha: 2026-11-20.
> Sobre: documento "ePRAC - 158 - OLO - API proyecto TMS-OMS" v1.0.0 (2026-11-12).

## Contexto en una línea

Probamos el API en QA (`10.17.224.224:87`) en modo lectura: funciona y cumple el documento. Para que el TMS deje de
leer la base de eFlow directamente y use solo el API, hace falta lo siguiente.

## A. Datos que faltan

### A1. Agregar campos a `GET /api/Expediciones/ObtenerExpediciones`

| Campo sugerido | Origen en eFlow | Para qué |
|---|---|---|
| `ruta` | `EXPEDICIONESCABECERA.RUTA` | Agrupar pedidos por ruta al armar viajes |
| `pesoTotal` | `EXPEDICIONESCABECERA.PESOPEDIDO_TOTAL` | Capacidad del camión |
| `volumenTotal` | `EXPEDICIONESCABECERA.CUBICAJEPEDIDO_TOTAL` | Capacidad del camión |
| `costoTotal` | `EXPEDICIONESCABECERA.COSTO_TOTAL` | Valor de la carga |
| `fechaCierre` | `EXPEDICIONESCABECERA.FECHACIERRE` | Excluir pedidos cerrados |
| `tipoExpedicion` | `EXPEDICIONESCABECERA.TPEXPE` | Excluir Cross Docking |
| `cantidadLineas` | conteo de `EXPEDICIONESDETALLE` | Tamaño del pedido |
| `direccionCliente` | `CLIENTES.DIRECCIONLARGA` | Dirección de entrega |
| `latitud`, `longitud` | `CLIENTES.LATITUD`, `CLIENTES.LONGITUD` | Ubicar el pedido en el mapa y rutear |

### A2. Nuevo endpoint: detalle (líneas) de una expedición

Por llave (`idAlmacen`, `idCompania`, `idSucursal`, `idExpedicion`), idealmente en lote de hasta 100. Por línea:

| Campo sugerido | Origen en eFlow |
|---|---|
| `linea` | `EXPEDICIONESDETALLE.IDEXPEDICIONLINEA` |
| `idArticulo`, `descripcion` | `IDARTICULO`, `ARTICULOSGESTION.DESCRIPCIONLARGA` |
| `presentacion`, `lote` | `IDPRESENTACION`, `LOTEEXPECIFICO` |
| `unidadesPedidas`, `unidadesPreparadas`, `unidadesCargadas`, `unidadesAnuladas` | columnas `UNIDADES*` |
| `peso`, `volumen` | `PESOPEDIDO`, `CUBICAJEPEDIDO` |
| `guiaFiscal`, `fechaCaducidad` | `GUIAFISCAL`, `FECHACADUCIDAD` |
| `estado`, `situacion` | `TPEXES`, `TPEXSI` |

### A3. Consultar expediciones por llave

Un GET (o POST de consulta) que reciba una o varias llaves y devuelva esas expediciones, sin rango de fechas. Lo usamos
para refrescar pedidos puntuales.

## B. Filtros de la consulta

**B1.** Hoy `FechaInicio` y `FechaFinal` filtran por `fechaExpedicion` (fecha de creación). Lo comprobamos contra la
base. Necesitamos filtrar por **`fechaExpedicionPlanificada`** (fecha de entrega), o poder elegir el campo de fecha.

**B2.** Confirmar si la consulta excluye los pedidos cerrados (`FECHACIERRE` con valor) o con viaje asignado
(`NUMEROVIAJEWMH` con valor). Si no los excluye, un filtro opcional para hacerlo.

## C. Preguntas sobre las escrituras

**C1. Liberar el pedido (paso a `GENE`).** El OMS necesita pasar la situación de `DISP` a **`GENE`** para que eFlow
arranque el picking. El API no tiene un endpoint para eso; `GenerarAcciones` la deja en `SOAC` ("Solicitud de Acciones").

Lo que vimos en QA (2026-11-20) con la expedición `0001/0109/0001/C11-00004145-N` (DISP/DISP):
- `GenerarAcciones` respondió `success: true`, `idActividad 1974155` (X-Correlation-ID
  `e0208bb6-82b8-46bc-ac2a-eba66a4d87b2`). Justo después, la cabecera estaba en `DISP/SOAC`.
- El monitor de eFlow procesó la actividad (`MONITORACTIVIDADES`, `TPTRAB = GEEX`) unos 2 minutos después. La cabecera
  pasó sola a **`DISP/GENE`**; la línea del detalle siguió en `DISP/DISP`.

Preguntas:
- ¿El paso `SOAC` → `GENE` lo hace **siempre** el monitor de eFlow? ¿Cuánto tarda como máximo y qué pasa si el monitor
  está detenido?
- ¿En qué casos se queda en `SOAC` o falla? ¿Cómo nos enteramos?
- Que el documento lo explique: hoy dice que la situación queda en `SOAC` y no menciona que después pasa a `GENE`.

**C2. Número de viaje.** El TMS crea sus propios números de viaje (ejemplo: `202611190109005`).
- ¿`AsignarNumeroViajeWMH` acepta un número que todavía no existe en WMH? ¿Lo crea?
- ¿O hay que crear el viaje antes? ¿Con qué endpoint?
- ¿Qué pasa con la unidad de transporte de ese viaje?

**C3. Prioridad 0.** ¿`CambiarPrioridadExpedicion` acepta `prioridad = 0`? La usamos para marcar un pedido ya liberado.

**C4. División de pedido.** Se pidió en la reunión del 21-oct y no aparece en la v1.0.0. ¿Va en otra versión?

## D. Ambientes y datos de prueba

**D1.** URL y credenciales del API de **producción** (CR).

**D2.** URL y credenciales de QA de **Venezuela**.

**D3.** Pedidos de prueba completos en QA. De los 21 pedidos DISP/DISP que hay hoy, solo 2 tienen peso y solo 4 de
18 clientes tienen coordenadas. Necesitamos pedidos con peso, volumen, ruta, coordenadas y líneas.

**D4.** Visto bueno para probar en QA las escrituras (prioridad, acciones, viaje, bajada) sobre esos pedidos.

## Resumen

| # | Qué falta | Tipo |
|---|---|---|
| A1 | Ruta, peso, volumen, costo, cierre, tipo, líneas, dirección y coordenadas en la consulta | Campos nuevos |
| A2 | Endpoint de detalle (líneas) por expedición | Endpoint nuevo |
| A3 | Consulta por llave | Endpoint nuevo |
| B1 | Filtro por fecha planificada | Cambio de filtro |
| B2 | Excluir cerrados y con viaje | Confirmar o agregar |
| C1 | Paso a `GENE`: confirmar que `SOAC` → `GENE` es siempre automático, en cuánto tiempo y cómo detectar fallos | Pregunta y documentación |
| C2 | Viaje creado por el TMS | Pregunta |
| C3 | Prioridad 0 | Pregunta |
| C4 | División de pedido | Pregunta |
| D1–D4 | Producción, QA VE, datos de prueba, permiso para probar escrituras | Ambientes |
