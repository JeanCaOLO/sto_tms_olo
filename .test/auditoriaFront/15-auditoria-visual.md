# Auditoría visual en navegador (2026-10-08)

Entorno: `npm run dev` en `localhost:3000`, Chrome con la extensión de Claude, usuario SuperUsuario (Costa Rica), datos de Aurora vía API. **No se emitió ninguna liquidación** (el modal se abrió y se cerró sin emitir); todo lo hecho en la base fue lectura.

## Recorrido
| Pantalla | Resultado |
|---|---|
| Sidebar → Tarifas | Muestra Liquidaciones, **Costos Flota**, Reglas de Tarifa (ya no Flota Propia/Externa) ✅ |
| `/tarifas/costos-flota` | Pestañas Flota Propia / Flota Externa; cambia la URL (`?flota=`), carga la lista de cada una; ida y vuelta Propia↔Externa sin error ✅ |
| `/reglas-tarifa` | Pestañas: Reglas, Tarifarios, Costos, Alerta de auditoría, Probador del motor, Bitácora (sin Zonas/Plantillas/Resumen) ✅ |
| `/liquidaciones` → modal Liquidar | Selector «Forma de liquidar» visible en vista simple; al elegir «Por kilometraje» recalcula y muestra la leyenda de la forma elegida ✅ |
| Historial → detalle de LIQ-0001 | Botón «Descargar PDF» presente; desglose en vista simple ✅ |

## Bugs visuales encontrados y corregidos
| # | Dónde | Problema | Corrección |
|---|---|---|---|
| V1 | Modal de liquidar (y cualquier modal con cabecera/pie propios) | **El pie con «Total a pagar» y «Emitir liquidación» quedaba fuera de la vista** y había que desplazar el modal para verlo: el panel del `Modal` base (Fase 2 de la auditoría) no era un contenedor flex en columna, así que `flex-1 min-h-0 overflow-y-auto` del cuerpo no tenía efecto. | `components/base/Modal.tsx`: el panel pasa a `flex flex-col`. Verificado en navegador: cabecera y pie fijos, el cuerpo se desplaza. 15 snapshots regenerados; la única diferencia es el token de clase `flex-col`. |
| V2 | Historial de liquidaciones | La columna Fecha mostraba el timestamp crudo `2026-08-28T00:00:00.000Z`. | `settlements/mapToDomain.ts`: `settlementDate` se normaliza a `YYYY-MM-DD`. Verificado en navegador. |
| V3 | Detalle de una liquidación (vista simple) | Solo mostraba el resumen: no había forma de ver «todo el desglose» sin la vista extendida (que el liquidador no tiene). | Botón «Ver el desglose completo / Ver menos» bajo el desglose. El PDF siempre trae el desglose completo. |

## Observaciones sin corregir (no son defectos del código del módulo)
- **Congelamientos del renderer** (3 veces): al cambiar de pestaña en Costos Flota (1ª), al desplazar con la rueda dentro del modal (2ª) y el modal tarda ~15–20 s en cargar el cálculo (consulta a Aurora). Ninguna se reprodujo al repetir la misma acción (Propia↔Externa funcionó dos veces; el modal cargó y se desplazó con `scroll_to`). Sin bucle de red; sin errores en consola. Probable causa: latencia de las consultas a Aurora más recompilación de Vite en frío. Conviene volver a revisar con el modal abierto durante más tiempo y el perfilador de Chrome.
- **Carga en frío**: en la primera visita el menú lateral aparece vacío unos segundos y se ve brevemente «Costa Rica no está disponible en el tarifador» mientras cargan permisos y países. Un esqueleto de carga en el menú sería más claro.
- Franja de ~24 px sin oscurecer en la parte superior con un modal abierto: aparece solo en las capturas con la extensión (banner de automatización del navegador); no se reprodujo como defecto de la app.

## Pendiente de verificar a mano
- **Vista de impresión del PDF** (`Descargar PDF`): no se abrió el diálogo de impresión del navegador (bloquearía la automatización). Está cubierto por pruebas (la proforma se monta aparte y llama a `window.print`), pero falta mirar paginación y colores en la vista previa real.
- Vista con rol Liquidador (sin `tarifas.config`): cubierta por prueba del menú; falta comprobarla con un usuario real una vez aplicado `sql/26_…`.
- Responsive en móvil/tablet de las pantallas nuevas.
