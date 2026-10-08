# Registro — Ronda 2, Fase E (menús con palabras clave, máx. 3 palabras)

Fecha: 2026-10-08. Casi todos los rótulos ya tenían ≤3 palabras; se acortaron a la palabra clave de lo que se trabaja y se alinearon los nombres entre menú, pestaña y título.

| Antes | Ahora | Dónde |
|---|---|---|
| Reglas de Tarifa | **Reglas Tarifa** | Sidebar (`sidebar-nav-items.ts`, i18n `menu.reglasTarifa`), título de la página |
| Transportistas a Liquidar (título) | **Flota Externa** | Título de Costos Flota → Flota Externa (igual que su pestaña) |
| Alerta de auditoría | **Alerta Margen** | Pestaña y tarjeta de `/reglas-tarifa` |
| Probador del motor | **Probador Motor** | Pestaña y ayuda |
| Viajes por liquidar | **Por Liquidar** | Pestaña de Liquidaciones |
| Listos para liquidar | **Listos** | Tarjeta de resumen y filtro |
| Incompletos (auditoría) | **Incompletos** | Filtro |
| (nuevo) | **Estructura del país** | Sección de Costos Flota → Flota Propia |

Se conservan: Liquidaciones, Costos Flota, Flota Propia, Flota Externa, Reglas, Tarifarios, Bitácora, Historial, Todos, Vista simple/extendida.
Pruebas actualizadas: `sidebar-nav-items.test.ts`, `readOnlyAccess.test.tsx`. 916 pasadas.
