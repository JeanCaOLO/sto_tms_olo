# Data mock compartida: Liquidaciones + Devoluciones + Tracking

Los tres módulos leen **los mismos viajes** de la data mock (países "Costa Rica MOCK" / "Venezuela MOCK"). Una devolución que el
chofer registra en Tracking es la misma que se recibe en Devoluciones y la que bloquea o libera el viaje en Liquidaciones.
Todo es dato de **prueba** (se borra con `cargar.mjs --reset --execute`). Fuente única: `scripts/mock-tarifas/generar.ts`
(+ `flujo.ts` para Tracking/Devoluciones) → `docs/tarifador/demo-data/mock-tarifas.json` → Aurora (`cargar.mjs`).

## Usuarios de prueba
| Usuario | Rol | Para qué |
|---|---|---|
| `chofer.mock-1@demo.tms.local` | Chofer (Costa Rica MOCK) | App del chofer: ve el viaje `R-20261009-06-05` en curso |
| `chofer.mock-2@demo.tms.local` | Chofer (Venezuela MOCK) | App del chofer: viaje `VE-20261008-ZUL-17` |
| `devoluciones.mock@demo.tms.local` | Devoluciones (ambos países MOCK) | Recibir devoluciones y armar formularios |

La clave **no está en el repo**: se define con la variable de entorno `MOCK_USER_PASSWORD` y se aplica con
`MOCK_USER_PASSWORD=... node --env-file=.env.local scripts/mock-tarifas/cargar.mjs --credenciales --execute`
(o al cargar la mock, si la variable ya está definida). Sin ella los usuarios existen pero no pueden iniciar sesión.
Con `--solo-choferes` la clave se pone únicamente a los dos choferes (el usuario de Devoluciones queda sin clave). Verificado el 2026-11-05: ambos choferes inician sesión en la API móvil local, ven su viaje en curso y `GET /paradas/{id}/articulos` devuelve los artículos del pedido.

## Escenarios (misma historia en los 3 módulos)
| # | Viaje | Devoluciones | Tracking | Devoluciones (módulo) | Liquidaciones |
|---|---|---|---|---|---|
| A | `R-20260925-16-02` (TRANSOSA) | 2 pendientes | recorrido terminado, 2 eventos `return` | "2 por recibir" | **bloqueado** ("tiene 2 devoluciones sin recibir") |
| B | `R-20261006-09-05` (ACUÑA) | 1 pendiente + 1 aprobada | idem | "2 por recibir" | bloqueado |
| G | `VE-20260916-CAR-11` (ANDINA-VE) | 1 pendiente + 1 **recolecta** aprobada (parada `collection`) | parada de recolecta | insignia "Recolecta" | bloqueado |
| C | `R-20260916-04-01` (flota propia) | 2 recibidas (Bueno / Incompleto) + formulario | recorrido | "Listo para liquidar" + formulario | por liquidar (o ya liquidado según su plan) |
| D | `R-20260922-08-06` (TRANSOSA) | 1 recibida Dañado + formulario | recorrido | listo | liquidable |
| E | `R-20260914-02-06`, `R-20260905-08-06` | recibidas, con la misma factura que declara su liquidación (FAC-88231, FAC-90017) | recorrido | listo | ya liquidados, con devoluciones informadas |
| H | `R-20260912-09-05` (ACUÑA) | 1 rechazada + 1 recibida | recorrido | no cuenta como pendiente | liquidable |
| F | `R-20261009-06-05` (CR) y `VE-20261008-ZUL-17` (VE) | 1 pendiente registrada por el chofer (contracamión) | **en ruta**: camión en el mapa, 4 paradas hechas, chofer en línea | aparece "por recibir" | no aparece (no está completado) |

Los números de viaje salen del JSON; si regeneras la mock pueden cambiar de transportista pero los escenarios se mantienen.

## Guion de prueba de punta a punta
1. **Tracking**: elige "Costa Rica MOCK". Abre el viaje en curso: ves la posición del camión, "4 de 10 paradas" y la última señal (hace unos minutos: la posición se fecha al momento de cargar).
2. **App del chofer** (con `chofer.mock-1`): ve su viaje en curso; al entregar la última parada el viaje pasa a `Completada`.
3. **Devoluciones** (con `devoluciones.mock` o tu usuario): en "Por recibir" están A, B, G y los viajes en ruta. Abre A, pulsa **Recibido** en cada línea (o "Recibir todas") y genera un formulario.
4. **Liquidaciones**: antes de recibir, A aparece en "Incompletos/Por liquidar" con el botón apagado y el aviso "no se puede liquidar el viaje … porque tiene 2 devoluciones sin recibir". Tras recibirlas pasa a liquidable y se puede liquidar.

## Qué se carga por módulo
- **Tracking**: sede de origen con coordenadas, pedidos con dirección/factura/coordenadas, guías con horas planificadas y reales, 2 viajes `En tránsito` (última posición, presencia en línea), recorrido de 10 viajes (511 posiciones, 99 visitas a paradas, 132 eventos).
- **Devoluciones**: 15 devoluciones (tipos `contracamion` y `recolecta`, estados pendiente/aprobada/recibida/rechazada, condiciones `Bueno`/`Dañado`/`Incompleto`), 5 formularios (`DEV-2026-10-9001…9005`, fuera del rango real) con sus secciones por cliente.
- **App del chofer (devolución contracamión)**: `tbl_order_items` (336 líneas) en las paradas de los viajes rastreados, para que `GET /paradas/{id}/articulos` ofrezca artículos reales; incluyen el producto de cada devolución mock con cantidad suficiente.
- **Liquidaciones**: sin cambios (44 liquidaciones, 17 proformas).
- Los marcadores `@NOW-<n>m`, `@TODAY` y `@ROLE:<rol>` del JSON se resuelven al cargar: lo "en vivo" lo es el día de la demo.

## Límites
- **Fotos de devolución desde la app: bloqueadas en Aurora hasta aplicar `backend/mobile/sql/m08_photo_return.sql`.** La restricción `ck_tracking_evidence_kind` de la BD compartida todavía no admite `photo_return` (verificado el 2026-11-05 con un INSERT revertido). Es la migración del pendiente `docs/devoluciones/pendientes/01-despliegue-contracamion.md`; la mock no la aplica.
- **Fotos y firmas**: no hay archivos reales en S3; `photo_url` queda vacío y no se simulan evidencias (Tracking/Devoluciones muestran "sin foto").
- Las devoluciones abiertas (pendientes/aprobadas) aparecen en la Bandeja de Planificación como filas de recolección de devolución (consecuencia natural del flujo; se van con el reset).
- El módulo Devoluciones no filtra por el selector de país de la barra superior: muestra todos los viajes que el usuario puede ver (incluidos los reales).
- Operar la mock (entregar, recibir, liquidar) la modifica: se restaura con `--reset --execute` y volviendo a cargar.
- La bitácora del tarifador (`tbl_tarifas_audit_log`) es append-only y deja filas huérfanas al borrar.
