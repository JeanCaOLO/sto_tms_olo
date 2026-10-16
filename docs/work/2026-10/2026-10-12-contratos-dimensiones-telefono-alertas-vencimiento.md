# 2026-10-12 — Contrato de transportista, dimensiones de vehículo, teléfono de punto y alertas de vencimiento

## What changed (frontend — mi parte)

Cuatro features pedidas por el usuario. El frontend quedó listo; lo que depende
de columnas/infra de BD se le pidió a Claude por `.agents/CANAL.md` (su terreno).

- **Punto de entrega — teléfono de contacto:** campo `contact_phone` en
  `DeliveryPointModal`, en el payload (`delivery-point-payload.ts`, POST+PATCH)
  y en el `LIST_SELECT` de `/tiendas`.
- **Vehículos — dimensiones del contenedor:** campos ancho/alto/largo
  (`container_width/height/length`) + unidad `container_unit` (cm/in/ft) en
  `VehicleModal`.
- **Transportistas — vencimiento de contrato:** campo de fecha `contract_expiry`
  en `CarrierModal` + columna "Contrato" en la lista con badge Vencido/Por
  vencer (vía `src/lib/expiry.ts`). Nota en el modal de que la carga del PDF
  llega después (espera infra de Claude).
- **Conductores — alerta de licencia:** la alerta visual **ya existía**
  (`license_expiry` + badge "vence pronto"/"vencida" + KPI). No requirió cambio.
- **Helper nuevo `src/lib/expiry.ts`** (+ test, 8 casos): `expiryStatus` /
  `daysUntil`, puro y reutilizable (contrato y licencia). Regla: 'due_soon' a
  ≤30 días, 'expired' si ya pasó.

## Why

Pedido del usuario: subir contrato (PDF) de transportistas con fecha de
vencimiento y alerta a 1 mes/vencido; dimensiones de contenedor con unidad;
recordatorio de licencia de chofer a 1 mes/vencida; teléfono de contacto del
punto para que el chofer llame.

## How — límites y reparto

Los formularios se escribieron **defensivos**: mandan los campos nuevos; si la
columna aún no existe en Aurora, no rompen y empiezan a guardar en cuanto Claude
las cree. Lo que **depende de backend/infra** (pedido a Claude en el canal):
- Columnas: `carriers.contract_expiry`, `vehicles.container_*`/`container_unit`,
  `delivery_points.contact_phone`.
- **Subida del PDF del contrato**: hoy NO hay mecanismo de upload de binarios en
  el repo (solo CSV/XLSX parseados en cliente). Requiere endpoint/S3 + columna
  de archivo — contrato pendiente de Claude. Por eso el PDF no se implementó
  aún (no hay dónde subirlo); el modal lo avisa.
- **Motor de alertas persistente**: hoy `use-notifications.ts` es seed en
  memoria. Las notificaciones reales de vencimiento (contrato/licencia) necesitan
  que Claude exponga los vencimientos (endpoint o tabla). Las **alertas
  visuales** (badges) sí están hechas en el front sobre la fecha.

## Verification

- type-check (`tsc --noEmit`): **0 errores**.
- `vitest run src/lib/expiry.test.ts src/pages/tiendas`: **15/15** (expiry 8 +
  payload 7 con los campos nuevos de zona y contacto).

## Follow-ups (Claude)

- [ ] Crear columnas: `carriers.contract_expiry`, `vehicles.container_width/height/length` + `container_unit`, `delivery_points.contact_phone`.
- [ ] Definir el contrato de subida/descarga del PDF del contrato (endpoint/S3 + columna).
- [ ] Exponer vencimientos (contratos + licencias ≤30 días/vencidos) para la notificación persistente.
- [ ] Confirmar si las dimensiones se normalizan a cm o se guardan valor+unidad tal cual.
