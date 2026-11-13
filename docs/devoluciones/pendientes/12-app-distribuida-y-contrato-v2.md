# 12 — App distribuida y diferencias con Devoluciones v2

**Estado:** topología verificada estáticamente y suites locales pasadas; dispositivo, APK y contrato v2 pendientes. Corte: 2026-11-12.

## Fuente de código comprobada

La app separada está en `TRACKING_TMS/frontend`; el backend está en `sto_tms_olo/backend/mobile`. No existe `sto_tms_olo/mobile/frontend` en este checkout. Las menciones históricas a esa ruta no autorizan crear otra app ni mover código. La documentación `docs/tracking/mobile/README.md` describe la separación.

El workflow `TRACKING_TMS/.github/workflows/apk.yml` genera APK al actualizar main o por disparo manual; declara llave de prueba y agrega el binario al repo mediante commit/push. `eas.json` también define APK/distribución interna. Eso demuestra mecanismos de distribución, no cuál APK está instalado en cada dispositivo ni la firma efectiva del binario actual. No se disparó el workflow ni se construyó APK.

## Funciones existentes

- Contracamión: `src/components/return-button.tsx:123` encola artículos/motivo/nota y foto opcional. `src/sync/outbox.ts:71` relaciona evidencia y devolución mediante `client_id`; backend `mobile_api/stops.py:157` valida artículos.
- Evidencia: `src/sync/evidence.ts:13` limita a 5 MiB y gestiona carga/registro. La firma se captura en `src/app/firma.tsx`. Foto/firma existentes no demuestran que ambos sean obligatorios y estén correlacionados con cada intento v2.
- GPS: `src/gps/policy.ts:31` usa 30 s en movimiento, 180 s detenido y 120 s en batería baja. Sync envía lotes y conserva/reintenta pendientes. No se midió consumo físico.
- Auth: HTTP coordina refresh ante 401; sesión guarda tokens en SecureStore. `app.json` mantiene `allowBackup=false`; la prueba del plugin existe. Falta manifiesto del APK nuevo.

## Verificación ejecutada

Desde `TRACKING_TMS/frontend`, con `EXPO_NO_DOTENV=1`: `npm run typecheck` y `npm run lint` correctos; Jest `--runInBand`: **20 suites y 174 tests pasados**, sin snapshots. No se leyeron archivos de entorno, no se cambió código móvil y no se accedió a servicios externos.

## Diferencias que debe resolver P4 antes de P5/P6

Devoluciones v2 exige foto y firma por recogida, cantidad real por artículo/intento, aceptación del servidor antes de avanzar, recepción parcial y protección de eventos tardíos. El flujo contracamión actual permite foto opcional y utiliza el contrato histórico. No imponer la obligatoriedad nueva a clientes antiguos sin versionar o acordar compatibilidad.

Definir identidad/correlación de solicitud-artículo-asignación-intento-evento, reglas de parcialidad y motivo de rechazo de eventos incompatibles. Conservar `client_id`, evidencias y outbox existentes. No convertir captura offline en recogida confirmada ni reenviar cantidades ya recogidas a Planificación.

Siguen pendientes decisiones de firma/canal APK, política HTTP en release, cifrado SQLite y retención GPS. Las pruebas de batería, pantalla apagada, red inestable, foto legible/Content-Type, actualización y conservación de pendientes requieren dispositivo y APK nuevo. No cambiar historia Git, credenciales de firma, infraestructura o políticas por esta revisión.
