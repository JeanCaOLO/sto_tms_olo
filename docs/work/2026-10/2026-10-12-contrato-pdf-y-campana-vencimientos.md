# 2026-10-12 — PDF del contrato del transportista + campana de vencimientos (frontend)

> Cierra la parte frontend de 2 de las 4 features del día (ver
> `2026-10-12-contratos-dimensiones-telefono-alertas-vencimiento.md`), ya con el
> backend de Claude desplegado (stacks `dev-tms-documents` y `dev-tms-alerts`).

## What changed

**(a) PDF del contrato** (`src/pages/transportistas/`):
- `carrier-contract.ts` (nuevo): `uploadCarrierContract` (presigned POST a S3 en
  3 pasos: pedir formulario → subir directo a S3 sin Authorization → confirmar
  con `PUT .../contract`), `openCarrierContract` (GET → `window.open`),
  `removeCarrierContract` (DELETE), `validateContractFile` (solo PDF, ≤10 MB).
- `CarrierModal.tsx`: input `accept="application/pdf"`; la subida va **después**
  de guardar el carrier (capturo el id del insert con `.select('id').single()`);
  botones Ver/Quitar si ya tiene `contract_file_key`. Fallo de subida avisa sin
  revertir el guardado (reintentable).
- `page.tsx`: `contract_file_key` en interface/LIST_SELECT.

**(d) Campana de vencimientos** (`src/hooks/use-notifications.ts`):
- Reemplazado el SEED en memoria por `GET /v1/alerts/expirations`. Mapea cada
  alerta a notificación (ícono/color por tipo y estado; detalle con "vence en N
  días"/"venció hace N"). id `exp:<type>:<entity>:<fecha>` → el "leído"
  (localStorage) sobrevive mientras la fecha siga vigente y re-avisa al renovar.
  Firma del hook intacta. Degrada en silencio si el endpoint falla.

## Why

El usuario pidió contrato PDF con alerta de vencimiento y recordatorio de
licencia, en app Y por correo. El correo diario lo maneja el backend (Claude);
el front cablea la subida del PDF y la campana (alertas en la app).

## Verification

- type-check (`tsc --noEmit`): **0 errores**.
- `vitest run src/hooks/use-notifications.test.ts src/pages/transportistas`:
  **9/9** (notifications 5 con mock del endpoint; carrier-contract 4 de
  validación). Los badges de vencimiento en listas ya existían (conductores) o
  se agregaron antes (transportistas con `src/lib/expiry.ts`).

## Follow-ups

- [ ] Claude: verificar `jbonilla@`/`rperez@` en SES (correo diario), y desplegar.
- [ ] Deuda preexistente (no de este cambio): `src/pages/liquidaciones/page.tsx`
      225 líneas > `max-lines` 200 → eslint falla. Partir a componente/hook.
      Pendiente de que el usuario lo priorice (refactor en módulo sensible).
