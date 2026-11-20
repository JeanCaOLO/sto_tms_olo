# 2026-11-20 — `backend/` de GitHub sincronizado a TMS-Backend (GitLab)

## What changed

- `backend/` de `github/main` (281e73e) portado al layout hexagonal de TMS-Backend, en la rama
  `sync-backend-github-2026-11-19` (sin push). Detalle en
  `TMS-Backend/docs/work/2026-11/2026-11-19-sincronizacion-backend-github.md`.
- Arreglos baratos de certificación aplicados allá: HSTS y cabeceras de seguridad, R1, R4, R7, CORS y cobertura en CI.

## Why

Pedido de Jesús: llevar el backend a GitLab cumpliendo template_base para que la próxima certificación salga bien.

## How

- 1216 tests verdes, ruff y bandit limpios.
- Re-certificación: QA y PROD quedan bloqueados solo por P2 (TLS en IaC). Con P2: QA 94 % Apto, PROD 87 % Apto.
- Salidas: `intelix/certificacion/salida/{qa,prod}-backend-v2/`.

## Follow-ups

- P2: dominio propio + certificado ACM (DevOps Intelix). C12 iss/aud coordinado con el frontend.
- Push y MR de la rama de TMS-Backend.

## Cierre

- MR !1 de TMS-Backend aceptado: `main` = e70f41d. El pipeline del MR falló en `lint:ruff` con
  `pip: orden no encontrada`. El runner de Intelix es shell y no tiene pip; `main` falla igual desde el 29-oct.
  Lint, tests y bandit se corrieron en local.
- App vacía `certificacion-tms` borrada de Dokploy.
- MR !2 de TMS-Backend aceptado (`main` = 1bfd6e1): C12 (JWT con `iss`/`aud`) y COD6 (piso de 80 %, cobertura
  medida 85,6 %). Re-certificación v3: solo bloquea P2; con P2, QA y PROD quedan en 95 % Apto.
- Resumen para gestión de lo que falta para salir Apto: `docs/certificacion/que-falta-para-apto-2026-11-20.md`.

## API REST de eFlow QA (ePRAC): conexión verificada

- Jean Carlo pasó el host correcto (`10.17.224.224:87`, no `.20`). Credenciales en `.env.local` (gitignored), como
  `EFLOW_QA_HOST/USER/PASSWORD`. No pisa la conexión SQL porque `EFLOW_CR_HOST` ya existe.
- Solo lectura: `GET /api/TestConexion` → BD `EFLOW_OLO_QA_SAP`, v3.2.1.1. Login (`POST /Autenticacion`, solo emite
  el token) OK. `GET /Expediciones/ObtenerExpediciones` DISP/DISP ±30 días → 21 pedidos (0109: 15 con prioridad 5;
  0029: 6 con prioridad 0), ninguno con viaje ni observaciones.
- El cliente de la rama `integracion-eflow-qa` (`eflow_api.py`) funciona contra QA en modo `qa` con `EFLOW_API_WRITE=off`.
  No se probó ninguna escritura (prioridad, GenerarAcciones, viaje, bajada).
- Pendiente: el punto 1 de `docs/oms/pendientes/04-integracion-api-eflow-qa.md` (de esa rama) queda verificado para
  la lectura.
- Comparación API QA vs SQL: `docs/wms-eflow/comparacion-api-qa-vs-sql-2026-11-20.md`. El API lee `EFLOW_OLO_QA_SAP` (.224) y coincide 21/21 con SQL; no es la base de producción (.20, 0/21). Trae 15 de 56 columnas, sin detalle ni coordenadas.
- Verificación del API ePRAC v1.0.0 contra su documentación (PDF) en QA: cumple su contrato (campos, paginación, orden, token de 6 días); filtra por fechaExpedicion.

## Ingesta local reanudada

- Túnel Aurora levantado de nuevo (`scripts/tunel-aurora.ps1` con `AWS_PROFILE=ext-claude`; sin perfil falla con NoCredentials).
- La ingesta fallaba con `numeric field overflow`: el cliente `020301098` (0109, pedido `VS033102-O`) tiene en eFlow
  la longitud `-83943225` (falta el punto decimal; debería ser -83.943225). `ingest_orders._coord` ahora descarta
  coordenadas fuera de rango (latitud ±90, longitud ±180) en vez de tumbar toda la bandeja. Test: `test_ingest_coordenadas.py`.
- Ingesta manual 10:49: 376 leídos, 376 upserted, 42 salidos, 375 espejadas, 1437 líneas.
- Loop local en segundo plano: ingesta cada 10 min y replan cada hora (lectura de eFlow por SQL, como antes).
- Pendiente con OLO: corregir la longitud de ese cliente en eFlow (mientras, queda sin coordenadas en el TMS).
- Actualizado `docs/wms-eflow/api-eprac-v1-vs-necesidades.md` con la prueba en QA (fechas por fechaExpedicion, ambiente QA, nuevas preguntas).
- Documento directo para ePRAC con lo que le falta al API (pedido de Jean Carlo): `docs/wms-eflow/solicitud-eprac-api-v1-faltantes.md`.

## ¿El API de ePRAC puede pasar la situación de DISP a GENE? (pedido de Ana Maradey)

- Solo lectura, sin escrituras. El documento v1.0.0 no tiene endpoint para cambiar la situación; `GenerarAcciones` la deja en `SOAC`.
- Rutas probadas con GET en QA: `GenerarAcciones` y `CambiarPrioridadExpedicion` responden 405 (existen, solo POST);
  `CambiarSituacion*`, `ActualizarSituacion*`, `CambiarEstadoExpedicion`, `GenerarExpedicion(es)` y `LiberarExpedicion` dan 404.
- Situaciones en `EXPEDICIONESCABECERA` (últimos 60 días): QA `DISP 44, TERM 39, EXPA 16, ANUL 13, PREP 2, CERR 1`;
  producción `CERR 28679, TERM 1298, DISP 509, EXPA 50, ANUL 22, GENE 12, PREP 12`. `SOAC` no aparece en ninguna.
- Agregada la evidencia a la pregunta C1 de `docs/wms-eflow/solicitud-eprac-api-v1-faltantes.md`.
- Para confirmar qué hace `GenerarAcciones` falta probarlo con un pedido de QA (escritura): pendiente de autorización.
