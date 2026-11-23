# Pruebas del API de ePRAC en QA: qué probamos y qué pasó

> API General eFlow WMS v1.0.0, ambiente QA (`http://10.17.224.224:87/api`). Pruebas del 20 y 23 de noviembre de
> 2026. Las escrituras en QA fueron autorizadas por Jesús.

## En corto

| Endpoint | ¿Funciona? | Qué vimos |
|---|---|---|
| `POST /Autenticacion` | ✅ | Da el token. El body tiene que ser JSON |
| `GET /Expediciones/ObtenerExpediciones` | ✅ | Trae bien los pedidos, pero solo 15 campos y filtra por fecha de creación |
| `POST /Expediciones/CambiarPrioridadExpedicion` | ✅ | Acepta prioridad 0 |
| `POST /Expediciones/GenerarAcciones` | ✅ | Pasa a `SOAC` y unos 2 minutos después eFlow lo pasa solo a `GENE` |
| `POST /Expediciones/AsignarNumeroViajeWMH` | ❌ | Responde `ERROR_PROCESAMIENTO` con cualquier número |
| `POST /Expediciones/AsignarNumeroBajada` | — | No se probó |

**El ciclo completo del TMS (bandeja → planificación → OMS → liberar) funciona solo con el API**, menos el número
de viaje.

## 1. Entrar al API (Postman)

| Prueba | Resultado |
|---|---|
| Login con body vacío o como texto | `"El campo 'password' es obligatorio."` |
| Login con body **raw JSON** `{"Username": "...", "Password": "..."}` | ✅ Devuelve `data.token` |
| GET con `Authorization: <token>` (sin `Bearer`) | 401 `UNAUTHORIZED` |
| GET con `Authorization: Bearer <token>` | ✅ Responde |

## 2. Leer pedidos (`ObtenerExpediciones`)

Pedido de ejemplo: `0001/0109/0001/VAS001027-P`.

- `FechaInicio=2026-11-12&FechaFinal=2026-11-12&Estado=DISP&Situacion=DISP` → ✅ trae el pedido.
- Con `2026-11-18` no aparece: **el filtro de fechas es por fecha de creación** (`fechaExpedicion`), no por la de
  entrega.
- Los 15 campos que trae coinciden con la base de eFlow QA (ya se había comprobado con los 21 pedidos DISP/DISP del
  20-nov).
- **No trae:** ruta, peso, volumen, costo, fecha de cierre, tipo de expedición, cantidad de líneas, dirección,
  coordenadas ni líneas. En la base sí están (por ejemplo: ruta `10`, peso `39.56`, 3 líneas).
- Jean (23-nov): las líneas y los datos que faltan no son necesarios para planificar. Sin peso ni volumen, el
  planificador usa el tope de **16 paradas por camión**.

## 3. Liberar un pedido (`GenerarAcciones`)

**Prueba 1 (20-nov)**, pedido `0001/0109/0001/C11-00004145-N`:

| Hora | Situación en eFlow |
|---|---|
| Antes | `DISP` |
| 10:48 | `GenerarAcciones` responde OK (`idActividad 1974155`) → `SOAC` |
| 10:51 | El monitor de eFlow procesa la actividad → **`GENE`** |

La línea del pedido siguió en `DISP/DISP`; solo cambió la cabecera.

**Prueba 2 (23-nov)**, dentro del ciclo completo, pedido `VAS001031-M`: `SOAC` a las 11:18 y `GENE` a las 11:20.

**Qué significa:** `SOAC` es "Solicitud de Acciones", un paso intermedio. El cambio a `GENE` lo hace eFlow solo, en
unos 2 minutos. No hay que llamar nada más.

## 4. Prioridad (`CambiarPrioridadExpedicion`)

| Prueba | Resultado |
|---|---|
| `VAS001031-M` con `prioridad = 0` | ✅ Aceptada (el pedido quedó con prioridad 0) |
| Un pedido que no existe en QA (`CJEP00011792-M`, de producción) | `EXPEDICION_NO_ENCONTRADA` |

## 5. Número de viaje (`AsignarNumeroViajeWMH`)

| Prueba | Resultado |
|---|---|
| `VAS001031-M` con el viaje del TMS `202611240109017` | ❌ `ERROR_PROCESAMIENTO` |
| `VAS001031-M` con un número chico, `900017` | ❌ `ERROR_PROCESAMIENTO` |

Respuesta completa (HTTP 200):

```json
{
  "success": false,
  "message": "No se pudo asignar el número de viaje WMH a las expediciones.",
  "data": { "total": 1, "procesadas": 0, "fallidas": 1, "resultados": [] },
  "errors": [{ "idExpedicion": "VAS001031-M", "code": "ERROR_PROCESAMIENTO",
               "message": "Error al asignar número de viaje WMH para la expedición VAS001031-M." }]
}
```

**Por qué creemos que falla (sin confirmar):** el número de viaje parece que tiene que existir antes en WMH. El
endpoint asigna un viaje que ya existe, no crea uno nuevo. Los números del TMS no existen en WMH.

**Pendiente con Jean / ePRAC:** Jean dijo que "WMH desaparece, el OMS ahora es el WMH". Hay que confirmar si ya no
hace falta mandar el número de viaje a eFlow, o cómo se crea antes el viaje en WMH.

## 6. Ciclo completo del TMS por el API (23-nov)

Pedido de QA `0001/0109/0001/VAS001031-M`, entrega el 2026-11-24. TMS en `planificacion-2` con
`EFLOW_API_MODE=qa` (sin SQL contra eFlow).

| Paso | Qué hizo el TMS | Resultado |
|---|---|---|
| 1. Ingesta | Lee los DISP/DISP con `ObtenerExpediciones` y los guarda en la bandeja | ✅ 1 pedido (el único de QA con entrega de hoy en adelante) |
| 2. Planificación | Arma el viaje sin peso ni coordenadas | ✅ Viaje `20261124-0109-017` |
| 3. Viaje a eFlow | `AsignarNumeroViajeWMH` | ❌ `ERROR_PROCESAMIENTO` (punto 5). El plan sigue igual |
| 4. OMS prioriza | `CambiarPrioridadExpedicion` | ✅ Prioridad 0 |
| 5. OMS libera | `CambiarPrioridadExpedicion` + `GenerarAcciones` | ✅ `SOAC` → `GENE` en 2 minutos |

## Lo que queda pendiente

1. **Número de viaje:** decidir con Jean si se deja de mandar o cómo se crea el viaje en WMH.
2. **Bajada:** probar `AsignarNumeroBajada`.
3. **Datos de prueba:** en QA casi no hay pedidos DISP/DISP con entrega de hoy en adelante (el 23-nov había uno).
   Pedirle a ePRAC que carguen más.
4. **Filtro por fecha:** el API filtra por fecha de creación; el TMS pide una ventana de ±30 días y filtra la entrega
   de su lado.

Relacionados: [solicitud-eprac-api-v1-faltantes.md](solicitud-eprac-api-v1-faltantes.md) (lo que le pedimos a
ePRAC) y [api-eprac-v1-vs-necesidades.md](api-eprac-v1-vs-necesidades.md) (análisis interno).
