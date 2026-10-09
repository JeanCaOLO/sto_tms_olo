# Registro — Ronda 2, Fase D (rol Liquidador: vista simple + lectura de la configuración)

Fecha: 2026-10-08. Desarrolladores = **SuperUsuario** y **SuperAdministrador** (admins por código en `tms_common/permissions.py`, ven y hacen todo; no requieren filas). El rol **Liquidador** lo creó el usuario en Configuración → Roles.

## Filas de la matriz de permisos que debe marcar para «Liquidador»
| Módulo | Acciones |
|---|---|
| `tarifas` (Liquidaciones) | Ver, Crear, Editar, Exportar |
| `tarifas.config` (Costos Flota, Reglas Tarifa) | **Solo Ver** (+ Exportar si quiere bajar tablas) |

Con eso: ve todo el menú de Liquidaciones (siempre en vista simple), y en Costos Flota y Reglas lee sin poder cambiar nada.

## Código
- `liquidaciones/hooks/useLiquidadorVista.ts`: `puedeConfigurar = can('tarifas.config','edit')`. Con solo «Ver» no hay interruptor ni vista extendida (tampoco por una preferencia guardada).
- `reglas-tarifa/parts/TabNavigation.tsx`: sin permiso de edición se ocultan **Probador del motor** y **Alerta de auditoría**; quedan Reglas, Tarifarios y Bitácora.
- `RulesSection`: sin permiso de edición aparece el botón «Ver» (ojo) en cada regla.
- `RuleModal`: modo solo lectura (título «Ver regla», campos deshabilitados con `<fieldset disabled>`, sin «Guardar», botón «Cerrar»). El enlace `?regla=` también abre en lectura. Con permiso, el DOM no cambia (snapshots intactos). «Guardar» queda deshabilitado si no hay permiso.
- Botones de escritura que antes se veían habilitados y ahora se deshabilitan sin edición: «Guardar parámetros» (`StructureMetaForm`), «Importar una hoja suelta» (`TemplateToolbar`), «Importar planilla» (`RateRowsCard`).
- Backend sin cambios: ya rechaza escrituras sin `tarifas.config` create/edit/delete (`backend/tarifas/src/app.py`, probado en `backend/tests/test_tarifas.py`).

## Pruebas nuevas
- `reglas-tarifa/parts/readOnlyAccess.test.tsx` (4): pestañas por permiso, «Ver» en vez de Editar/Eliminar, la vista extendida solo con `edit`.
- `reglas-tarifa/components/RuleModal.readonly.test.tsx` (2): lectura vs edición.

## Pendiente de verificar a mano
Con un usuario real del rol Liquidador, una vez marcadas las filas.
