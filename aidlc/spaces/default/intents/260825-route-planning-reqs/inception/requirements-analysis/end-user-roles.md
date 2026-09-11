# Roles de Usuario Final — Módulo de Planificación de Rutas

> ⚠️ **PROPUESTA** — Nombres y responsabilidades son propuesta inicial a validar con el negocio (Jean Carlo / operaciones Cliro CR y San Diego-Micheleana VE). No es definitiva.

## Roles Identificados

| Rol | Responsabilidad principal | Interacción con Planificación de Rutas |
|-----|--------------------------|----------------------------------------|
| **Planificador de Rutas** | Arma rutas día a día: selecciona viajes, ejecuta bin-packing, optimiza secuencia de paradas, ajusta manualmente, genera rutas individuales | Flujo "Nueva Ruta" completo (FR-1 a FR-18). Es el usuario primario del módulo. Opera diariamente con 12–36 rutas. |
| **Coordinador de Flota** | Distribuye pedidos entre múltiples vehículos cuando un viaje excede la capacidad de un solo vehículo. Configura slots, ejecuta reparto, genera rutas en batch | Flujo "Reparto de Flota" (FR-6, FR-8, FR-21). Puede ser la misma persona que el Planificador en operaciones pequeñas. |
| **Jefe de Almacén** | Supervisa las rutas generadas, valida asignaciones antes del despacho físico, edita/elimina rutas cuando hay cambios de último minuto | Flujo "Rutas Generadas" (FR-9, FR-10, FR-19, FR-20). Visión de estado general del día. Rol ya establecido en OMS. |
| **Administrador de Módulo** | Configura catálogos base (vehículos, conductores, transportistas, rutas tipo). Gestiona permisos de acceso al módulo. No opera rutas día a día | Configuración de catálogos (FR-16 indirectamente). Rol transversal ya establecido en OMS. |

## Notas de Contexto

- **Operación actual:** almacenes Cliro (Costa Rica, GAM) y San Diego/Micheleana (Venezuela). Escala de 12–36 rutas/día.
- **Patrón OMS:** los roles Operador de Despacho, Administrador de Módulo y Jefe de Almacén ya existen en el módulo OMS de Eduardo. Se mantiene coherencia.
- **Planificador vs Coordinador:** en operaciones grandes (Cliro CR con flota mixta) podrían ser personas distintas. En operaciones pequeñas (Venezuela), una persona cumple ambos.
- **Sin rol de "Conductor"** en este módulo: el conductor es asignado a la ruta pero no interactúa con la pantalla de planificación. Su interfaz será el módulo de ejecución/tracking (futuro).

## Matriz de Acceso por Flujo

| Flujo | Planificador de Rutas | Coordinador de Flota | Jefe de Almacén | Administrador de Módulo |
|-------|:---------------------:|:--------------------:|:---------------:|:----------------------:|
| Nueva Ruta (crear) | ✅ | ✅ | ❌ | ❌ |
| Reparto de Flota | ✅ | ✅ | ❌ | ❌ |
| Rutas Generadas (ver) | ✅ | ✅ | ✅ | ✅ |
| Editar/Eliminar ruta | ✅ | ✅ | ✅ | ❌ |
| Configurar catálogos | ❌ | ❌ | ❌ | ✅ |
