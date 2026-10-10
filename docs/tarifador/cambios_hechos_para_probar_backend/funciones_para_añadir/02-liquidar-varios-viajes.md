# Liquidar varios viajes de una vez

## Funcionalidad

En «Por Liquidar», el liquidador marca varios viajes listos y pulsa «Liquidar N viajes». Se abre un menú con una fila por viaje (número, transportista, total calculado y estado). Cada fila se despliega y muestra **exactamente** el contenido del modal de un solo viaje: variables, base de cálculo, «Ver más» con pedidos, devoluciones y desglose, marcas de pedido, y en vista extendida todo el detalle. Al pie, un solo botón «Emitir N liquidaciones» y el total a pagar del lote.

## Concepto

El lote no es un modal nuevo con otra lógica: monta, por cada viaje, el mismo controlador que usa el modal de un viaje (`useLiquidarViajeController`) y la misma emisión (`useEmitTrip`). Por eso hereda gratis auditoría, edición de variables, devoluciones, exclusiones, base de cálculo y recálculo antes de emitir. Cada viaje conserva su propio cálculo y sus propias ediciones.

## Objetivo

Liquidar de una vez los viajes que no necesitan decisión individual, sin perder la posibilidad de revisar uno por uno el que se quiera. Todos terminan en el Historial.

## Cómo se implementa

| Pieza | Archivo | Qué hace |
|---|---|---|
| Emisión reutilizable | `hooks/useEmitTrip.ts` | Valida, recalcula si hace falta y guarda un viaje. Lo usan `LiquidarViajeModal` y cada viaje del lote. Es la extracción de lo que antes estaba dentro del modal; no cambia su comportamiento. |
| Tabla «Por liquidar» | `parts/TripsTable.tsx` | Extraída de `page.tsx` (que volvió a 197 líneas, bajo el máximo de 200). Añade la selección y el botón de la barra. |
| Menú del lote | `components/lote/LiquidarLoteModal.tsx` | Lista de viajes, interruptor de vista simple/extendida, total y emisión en tanda. |
| Fila del viaje | `components/lote/LoteViajeItem.tsx` | Resumen plegado y cuerpo desplegable. Expone `emitir()` al modal. |
| Aviso y recarga | `hooks/useLiquidacionesController.ts` → `onBatchEmitted` | Relee, avisa («3 liquidaciones emitidas (LIQ-CR-009 a LIQ-CR-011)») y pasa al Historial cuando ya no queda nada por emitir. |

Reglas del lote:

- **Qué se puede marcar:** viajes listos, es decir, sin motivo de bloqueo y con todos sus pedidos entregados. Los que tienen pedidos por decidir (anular o dejar para después) se liquidan aparte; su casilla queda deshabilitada y el tooltip dice por qué.
- **Tope de 10 viajes** (`MAX_LOTE` en `TripsTable.tsx`). Cada viaje calcula contra el backend por su cuenta y diez ya son muchos para revisar. Con 10 marcados, las demás casillas se deshabilitan con ese motivo.
- **Estados de la fila:** Calculando…, Listo, Bloqueado (con el motivo), Revisar (error), Guardando…, Emitida LIQ-….
- **Emisión:** una por una, en orden. Cada una es una emisión normal (liquidación y bitácora en una transacción). No hay operación de lote en el backend.
- **Si un viaje falla** (por ejemplo, el recálculo detecta un cambio de tarifa): los buenos se emiten, el fallido se abre solo con su mensaje y el menú no se cierra. Se corrige y se vuelve a pulsar emitir; solo se intenta lo que falta.
- **Bloqueados:** no cuentan en el botón («Emitir 2 liquidaciones»), y el pie avisa cuántos no pueden emitirse aún.
- **Monedas:** si el lote mezclara monedas (países distintos) no se muestra total, porque sumarlas no tiene sentido.

## Cómo se usa

1. Entra en Liquidaciones → Por Liquidar.
2. Marca las casillas de los viajes (o la del encabezado para toda la página).
3. En la barra pulsa «Liquidar N viajes».
4. Despliega un viaje si quieres revisarlo o editarlo; el resto se queda tal como lo calculó el motor.
5. Pulsa «Emitir N liquidaciones». Si todo sale bien, el menú se cierra y ves el Historial con la última liquidación resaltada.

## Pruebas

- `LiquidarLoteModal.test.tsx`: una fila por viaje plegadas; al desplegar aparece el cuerpo del modal de un viaje; emite los dos y cierra.
- `LiquidarLoteModal.fallo.test.tsx`: un viaje falla, el otro se emite, el fallido queda abierto con su error y el menú no se cierra.
- Navegador: `herramientas/e2e/fase10-lotes.mjs`, pasos L1 a L3 (3 viajes de CR: «3 liquidaciones emitidas»).

## Con el backend real

Cada viaje del lote hace lo mismo que un viaje suelto: lectura del catálogo, recálculo y la transacción de emisión. Vigilar la latencia de abrir un lote de 10 (diez cálculos a la vez) y la Lambda en frío; si fuera lento, bajar `MAX_LOTE`.
