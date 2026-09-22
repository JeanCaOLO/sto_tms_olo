# ADR-004 — Patrón Adapter para integraciones (WMS, ERP, Mapas)

**Estado:** Propuesto

## Contexto

`server/db.mjs` habla directamente con `mssql` (EFLOW), sin interfaz
intermedia. No hay ninguna integración con EPRAC/Softland ni con un
proveedor de mapas. Construir estas integraciones con el mismo patrón
acoplado repetiría el problema y dificultaría el desarrollo con mocks.

## Decisión

Definir interfaces de dominio (`WMSProvider`, `ERPProvider`, `MapProvider`,
`CarrierProvider`, `NotificationProvider`, `AIProvider`) con al menos una
implementación `Mock*` y una implementación real por proveedor
(`EflowWMSProvider`, `SoftlandERPProvider`, `GoogleMapsProvider`, etc.),
seleccionadas por configuración (§13 de `02-to-be.md`), nunca importadas
directamente por el dominio de negocio.

## Consecuencias

- Se puede desarrollar y probar el 100% del sistema contra mocks antes de
  tener una sola credencial real — que es, de hecho, el estado actual del
  OMS, solo que sin la interfaz formal.
- Cambiar de proveedor de mapas (o agregar un segundo país con otro WMS) no
  requiere tocar el dominio, solo la configuración y una nueva
  implementación del adapter.
- Costo: una capa de indirección adicional sobre cada integración nueva.

## Alternativas rechazadas

- **Acoplar directamente cada integración real** (patrón actual de
  `server/db.mjs`): rechazado — ya demostró ser difícil de testear sin la
  base QA real disponible.
