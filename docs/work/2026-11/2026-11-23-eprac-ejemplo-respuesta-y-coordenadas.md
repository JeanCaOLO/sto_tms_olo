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
