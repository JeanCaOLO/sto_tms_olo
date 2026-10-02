# 2026-09-24 — i18n de toda la app (ES/EN) y gating de acciones en pantallas operativas

Cierra los follow-ups que quedaban de
`2026-09-24-gating-botones-catalogos-i18n-puntos-entrega.md`: i18n del resto de
pantallas y `can()` en las pantallas operativas con acciones mutables. No queda
pendiente incremental de estos dos frentes.

## What changed
- **i18n (ES/EN) en toda la app.** Además de los módulos ya traducidos (menú,
  DataTable, comunes, Puntos de Entrega), se agregaron los 7 catálogos (países,
  zonas, transportistas, vehículos, conductores, licencias, clientes) y las
  operativas y OMS (dashboard, pedidos, planificación, tracking, configuración,
  y las seis pantallas OMS: panel, cola, reglas, simulador, rutas, auditoría).
  Total: 21 módulos × 2 idiomas.
- **Gating de acciones en pantallas operativas.** `useModulePermissions` aplicado en
  devoluciones (crear + aprobar/rechazar/completar = edit), guías (crear + editar),
  liquidaciones (crear + select de estado = edit + eliminar), tracking (cambio de
  estado de ruta = edit) y reglas-tarifa (crear/editar/eliminar, superpuesto al RBAC
  simulado que ya tenía la pantalla).

## Why
"Terminá todo lo pendiente, no dejes tandas." Los dos frentes eran incrementales
por volumen (20+ pantallas). Con la infraestructura i18next y el hook de permisos ya
en su sitio, era trabajo mecánico y repetitivo: cada pantalla sigue el mismo patrón.

## How
- i18n: un archivo por módulo en `src/i18n/local/{es,en}/<modulo>.ts` (glob
  `./*/*.ts`, sin índice que tocar), claves planas con prefijo; `useTranslation()` en
  cada `page.tsx` reemplazando los textos visibles. Plurales i18next donde hay conteos.
- Gating: `useModulePermissions(<permKey>)` → `{canCreate,canEdit,canDelete,canExport}`,
  condicionando botones de header, acciones de fila y controles de cambio de estado.
- El grueso se delegó a sub-agentes en paralelo por grupos de pantallas; la
  verificación (type-check, tests, revisión de shadowing de `t`) la hizo el que
  esto escribe. Se encontró y corrigió un shadowing real en la tabla de Tipos de
  `vehiculos/page.tsx` (parámetro `t` de callback ocultaba la `t` de traducción).

## Promoted knowledge
El patrón de i18n (archivo por módulo + `useTranslation`) y `useModulePermissions`
son ya el estándar del frontend para pantallas nuevas. Conviene reflejarlo en el
README del frontend cuando se retome.

## Follow-ups
- [ ] None de i18n/gating de pantallas — quedó cubierto. (Textos de datos compartidos
      en `oms/types.ts` y algunos labels de dominio quedan sin traducir a propósito:
      son datos, no chrome de página.)
