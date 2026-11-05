# 10 — Auditoría de fricción de la app del chofer

**Estado:** parcial. Auditoría hecha el 2026-11-05 por lectura de código (`TRACKING_TMS/frontend/src`). Se implementaron los hallazgos rápidos (tabla «Hecho»); el resto sigue pendiente por implementar.

## Por qué
La app del chofer debe ser simple: pocos toques, una mano, sin teclear de más. Esta auditoría lista los lugares donde el chofer hace pasos manuales evitables o que se pueden automatizar. No incluye lo del servidor que ya está en [08](./08-mejoras-posibles.md) (ETA, eventos `stop_arrived`/`stop_departed`, push).

## Hecho (2026-11-05)
| # | Hallazgo | Qué se hizo |
|---|---|---|
| 1 | Sin auto-arribo | Con viaje en tránsito la pantalla principal lee la ubicación cada 20 s; a ≤ 150 m (`GEOFENCE_M`) de una parada pendiente muestra «Llegaste a X» con «Abrir parada» y vibra una vez (`lib/arrival.ts`, `useHere(pollMs)`). Se limita a la app abierta: ver «Falta del auto-arribo». |
| 3 | Entregar son 3 pasos con «Siguiente» a mano | Tras guardar la foto se abre la firma solo, y al volver de la firma se pasa al paso 3 (`parada/[id].tsx`). «Siguiente» sigue ahí por si ya había evidencia. |
| 4 | El receptor se teclea siempre | Se propone el nombre de la parada; se puede editar (`parada/[id].tsx`). |
| 5 | Motivo de falla: chip y además campo de texto | El campo solo sale con el chip «Otro». |
| 8 | La agenda solo se refresca al tirar | Se vuelve a pedir al volver la app al frente (`focusManager` en `_layout.tsx`) y cada 3 min (`api/my-trips.ts`). |
| 9 | Acción rechazada: solo se podía descartar | Botón «Reintentar» (`retryOutboxItem`); reactiva las que dependían de ella. |
| 10 | Aviso de pendientes con texto técnico | Mensaje claro «Se reintenta solo» (`index.tsx`). |
| 12 (parcial) | «Salir» cierra sesión sin confirmar | Pide confirmación. Queda el mensaje claro cuando vence la sesión (ver abajo). |
| 6 | Fuera de geocerca pide motivo aunque un reintento de GPS lo resuelve | En el último paso, si falta ubicación o se está lejos, se vuelve a leer sola 3 veces cada 5 s (`parada/[id].tsx`). Sigue siendo obligatorio el motivo si el GPS no mejora; con sin ubicación sigue sin poder entregar (#7). |
| 11 | Login sin ayudas de teclado ni email recordado | El último correo viene escrito (`readLastEmail`, sobrevive al cierre de sesión), «siguiente» pasa a la contraseña y «ir» la envía. Falta biometría (módulo nativo). |
| 13 (parcial) | Foto con `quality: 1` | La toma baja a 0.85 (`CAPTURE_QUALITY`); se vuelve a comprimir a 0.75 de todos modos. Falta botón de reintento directo en el error. |
| 14 | Permisos con pantalla extra al iniciar viaje | Resuelto en [11](./11-permisos-primer-uso-verificar.md). |
| 13 (parcial) | Cámara negada sin camino a Ajustes | Abre Ajustes directo si Android ya no muestra el diálogo (`lib/capture.ts`). |

## Falta del auto-arribo (pendiente por verificar / implementar)
- **Verificar en teléfono**: que a ≤ 150 m salga el aviso, vibre una sola vez y «Ahora no» lo quite. La lectura usa `getLastKnownPositionAsync` (hasta 2 min de antigüedad), así que el aviso puede tardar ese margen si no hay puntos nuevos.
- **Con la pantalla apagada o la app en segundo plano no avisa**: hoy solo corre con la app abierta. Para avisar fuera de ella hace falta una notificación local desde la tarea GPS (`gps/task.ts`, `handleLocations`) con `expo-notifications`, que **no está instalado** (módulo nativo, APK nuevo).
- **No abre la parada sola**: solo avisa. Abrirla automáticamente puede sorprender al chofer; decidir con operación.
- **Mismo radio para todos**: 150 m fijos, sin configurar por punto (ver umbrales configurables en [08](./08-mejoras-posibles.md)).

## Pendiente por implementar
Ordenado por impacto. Esfuerzo: S pequeño, M medio, L grande.

| # | Hallazgo | Dónde | Propuesta | Esf. |
|---|---|---|---|---|
| 7 | **Sin ubicación no se entrega, ni con motivo** (bloqueo duro dentro de un almacén) | `lib/geo.ts:19`, `parada/[id].tsx:95` | Permitir entregar sin coordenadas y marcar «sin ubicación» para revisión. **Requiere decisión de negocio.** | M |
| 20 | **Actualización manual** del APK por GitHub Actions | `DEPLOY.md` §2 | OTA con `expo-updates` (EAS Update) o pantalla «Hay nueva versión» con versión mínima del servidor. | L |
| 2 | «Iniciar viaje» se toca a mano | `app/index.tsx:132-165` | Botón fijo y grande al abrir si hay un solo plan; o iniciar al primer movimiento. | S |
| 12 | Sesión vencida saca al chofer sin explicar | `auth/session.ts:179-190`, `api/http.ts:84-93` | Mensaje «Tu sesión venció» y conservar el email; agenda en solo lectura. | M |
| 15 | La pantalla se apaga durante la entrega | `parada/[id]`, `firma` | `expo-keep-awake`. **Es módulo nativo: pide APK nuevo**; no está instalado. | S |
| 16 | Batería baja solo muestra texto | `lib/battery.ts`, `app/index.tsx` | Vibración una sola vez o modo ahorro explícito. | S |
| 17 | Navegación: Waze y Google separados, WhatsApp no existe | `app/index.tsx:222-227`, `parada/[id].tsx:135-141` | Recordar la app preferida, un solo botón «Ir»; botón WhatsApp (`wa.me`) junto a «Llamar». | S |
| 18 | Al terminar el viaje no hay cierre | `app/index.tsx:210-213` | Pantalla de cierre con resumen y GPS detenido visible. | S |
| 19 | Tema fijo (`StatusBar` siempre oscuro), sin alto contraste | `app/_layout.tsx`, `theme.ts` | Modo luz solar y modo noche. | M |
| 3b | «Siguiente» sigue siendo un toque cuando ya hay evidencia previa | `parada/[id].tsx` | Saltar pasos ya completos al abrir «Entregar». | S |

## Cómo
Una cosa por vez, con su prueba en `frontend/src/__tests__`. Antes de tocar #7 hablar con negocio; #1 y #20 conviene diseñarlos aparte. Lo que añada una dependencia nativa (#15, #20) pide APK nuevo: coordinarlo con quien publica.
