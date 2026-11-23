# 2026-11-23 · Ejemplo de respuesta para ePRAC y coordenadas en GitLab

## What changed

- `docs/wms-eflow/solicitud-eprac-api-v1-faltantes.md`: sección E con el JSON de `ObtenerExpediciones` que
  necesitamos (los 15 campos actuales + A1 + líneas de A2), con la expedición de QA `VAS001027-P` (commit 614404b).
- TMS-Backend (GitLab): se portó la corrección de coordenadas fuera de rango de la ingesta de eFlow (MR !3,
  `main` en 1e5b00e). Ver `docs/work/2026-11/2026-11-23-coordenadas-ingesta-eflow.md` en ese repo.
- Se relanzó en local la ingesta de eFlow cada 10 min y el replan cada hora (túnel a Aurora + ciclo local).
  Primera corrida: 193 pedidos leídos y guardados, 532 líneas.

## Why

- ePRAC necesita ver con un ejemplo concreto qué campos pedimos y con qué formato.
- GitLab debía quedar igual que GitHub: sin la corrección, una longitud sin punto decimal rompe la ingesta.

## How

- Respuesta actual del API comprobada en Postman (QA, solo lectura). Datos faltantes leídos de
  `EFLOW_OLO_QA_SAP` con consultas SELECT (cabecera + `CLIENTES` + `EXPEDICIONESDETALLE` + `ARTICULOSGESTION`).
- Backend: pytest 1222 passed, ruff limpio; MR creado y mergeado por la API de GitLab.

## Promoted knowledge

- El GET del API exige `Authorization: Bearer <token>`; sin `Bearer` responde 401.
- El login exige body raw JSON (`Username`, `Password`); como texto o form responde "El campo 'password' es
  obligatorio".
- En `VAS001027-P` el volumen total de la cabecera viene null pero una línea sí tiene volumen: el TMS debe poder
  sumarlo desde las líneas.

## Follow-ups

- Regenerar el PDF de la solicitud desde el `.md` antes de mandarlo (el de Descargas tiene el C1 viejo).
- Agregar a la solicitud las preguntas nuevas de escritura: estado de la actividad de `GenerarAcciones`, liberar en
  una llamada, quitar viaje / deshacer liberación, y que el viaje rechace pedidos cerrados.
- Corregir `api-eprac-v1-vs-necesidades.md`: todavía dice que no se llega a `GENE`.
- OLO: corregir la longitud del cliente 020301098 en eFlow.

## Ciclo de vida completo por el API de eFlow QA (planificacion-2)

### What changed

- Se trajo a `planificacion-2` la integración por API de Jean (`integracion-eflow-qa`, flag `EFLOW_API_MODE=qa`):
  ingesta por `ObtenerExpediciones`, viaje por `AsignarNumeroViajeWMH`, liberación por `CambiarPrioridadExpedicion`
  + `GenerarAcciones`. Sin líneas, peso ni coordenadas: Jean confirmó que no hacen falta para planificar.
- Se paró la ingesta SQL de producción y se borraron de Aurora los 220 pedidos de producción que seguían en la
  bandeja (DISP sin liberar) y sus 83 paradas no liberadas, para que el TMS solo escriba pedidos de QA. Respaldo en
  `backup-prod-bandeja-2026-11-23*.json` (raíz, gitignored). Decisión de Jesús: desde ahora se trabaja con el API de QA.

### Resultado (pedido de QA `0001/0109/0001/VAS001031-M`, entrega 2026-11-24)

| Paso | Resultado |
|---|---|
| Ingesta por API | 1 pedido DISP/DISP con fecha de hoy en adelante → bandeja |
| Planificación | Viaje `20261124-0109-017` armado sin peso ni coordenadas (tope de 16 paradas por camión) |
| `AsignarNumeroViajeWMH` | **Falla**: `ERROR_PROCESAMIENTO`, también con un número chico. El viaje debe existir en WMH |
| Barrido OMS | Prioridad 0 aceptada; `GenerarAcciones` OK → `SOAC` a las 11:18 → `GENE` a las 11:20 (automático) |

### Promoted knowledge

- `CambiarPrioridadExpedicion` acepta `prioridad = 0` (responde C3).
- `SOAC` → `GENE` lo hace solo el monitor de eFlow en ~2 min (segunda vez confirmado).
- `AsignarNumeroViajeWMH` no crea viajes. Según Jean, "WMH desaparece": confirmar si se deja de enviar el viaje.

### Follow-ups

- Decidir con Jean si se apaga el envío de `AsignarNumeroViajeWMH` (hoy falla y solo deja un warning).
- En QA casi no hay pedidos con entrega de hoy en adelante: pedirle a ePRAC más pedidos DISP/DISP (D3).
