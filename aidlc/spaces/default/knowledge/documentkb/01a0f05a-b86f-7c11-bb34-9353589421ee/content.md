# Resumen — Control Tower (WMH actual)

_Síntesis de los 3 documentos de `docs/wmh-actual/` que describen el sistema **Control Tower** hoy en producción (el WMH que el OMS/TMS de reemplazo debe entender y no romper). Datos extraídos en vivo de la app (`http://10.17.225.22:8080`) el 22/09/2026._

## Documentos resumidos

| Archivo | Qué aporta |
| --- | --- |
| `Documento Maestro — Control Tower.md` | **Superset**: mapeo funcional pantalla por pantalla (con capturas) + datos reales por columna. |
| `Mapeo Funcional — Control Tower (Word).md` | La mitad funcional del maestro (mismo contenido, con capturas). |
| `Datos Reales por Columna — Control Tower.md` | Muestras reales de cada tabla para definir tipos, longitudes y validaciones. |

## Qué es Control Tower

- **TMS (Transportation Management System)** de marca **WMH / Cloud Suite** (proveedor eprac.com), versión **4.18.4.4**.
- Stack actual: **Angular + Angular Material + AG Grid**; base de datos **`EFLOW_OLO`** (SQL), con **conexión por almacén** (arquitectura multi-almacén, cada almacén con su propio data source).
- Su objetivo central: **planificar y controlar viajes de distribución** — toma órdenes de despacho, las agrupa en "viajes", los asigna a unidades/choferes por ruta y zona, y monitorea la operación en tiempo real.

## Flujo operativo (lo que el OMS/TMS debe automatizar)

1. Entran órdenes desde el almacén (ERP/WMS → `EFLOW_OLO`).
2. El planificador filtra órdenes por almacén / compañía / sucursal / ruta / prioridad.
3. Selecciona órdenes y las añade a un viaje; el sistema **recalcula en vivo** rutas, líneas, clientes, peso, volumen y monto.
4. Crea el viaje → pasa a *activo/Pendiente* y aparece en el Dashboard.
5. Se monitorea el avance de preparación (%), días transcurridos y estado.
6. Se pueden **anular** o **fusionar** viajes.
7. Al cerrar, alimenta el reporte de viaje.

> **Frontera OMS ↔ TMS**: el OMS gestiona **órdenes**; el TMS gestiona **viajes**. El punto de corte es la pantalla **"Nuevo Viaje"**.

## Mapa de módulos (navegación)

- **Dashboard** (`/dashboard`) — operación en tiempo real de viajes.
- **Catálogos** — Almacenes, Bajadas, Choferes, Compañías de Transporte, Rutas, Unidades de Transporte, Zonas.
- **Documentos** — Órdenes, Órdenes Inactivas, Visor de viajes, **Nuevo Viaje** (motor de planificación).
- **Reportes** — Reporte de viaje.
- **Seguridad** — Reglas del sistema, Usuarios.

### Pantallas clave

- **Dashboard**: KPIs superiores (Viajes, Rutas, Órdenes, Líneas), tabla "Viajes activos" con acciones **Nuevo Viaje / Anular / Fusionar**, métricas **Total vs Prep.** (preparado) de peso/volumen/monto, avance % y días transcurridos.
- **Órdenes** (`/documents/orders`): requiere al menos un filtro. `Número de Orden` **admite texto libre** (ej. *"Error de KPO con picking inverso"*). `Ruta` viene vacía hasta planificar.
- **Nuevo Viaje** (`/documents/trips`) — **el núcleo a automatizar**: filtrar → seleccionar → **Añadir** (recalcula KPIs) → validar contra capacidad → **Crear**. El motor debe agrupar órdenes por ruta/zona respetando **capacidad de peso/volumen, prioridad y reglas del sistema**.
- **Reglas del sistema** (`/security/systemRules`): motor de parámetros tipo `FLOW`; el valor se guarda en "Rango alfanumérico 1". Relevantes: `USECARGACAMION`, `USEINCLINEBELT`, `PROGRESSTYPE`, `ADMPASS` (→ `OLOVIAJE2025`).

## Modelo de datos inferido

```
ZONA (1) --< RUTA (N)
RUTA (1) --< ORDEN (N)
ALMACEN (1) --< ORDEN (N)        [conexión BD propia por almacén]
CLIENTE (1) --< ORDEN (N)
ORDEN (1) --< LINEA (N)
COMPANIA_TRANSPORTE (1) --< CHOFER (N)
COMPANIA_TRANSPORTE (1) --< UNIDAD (N)   [capacidad_peso, capacidad_volumen]
VIAJE (1) --< ORDEN (N)
VIAJE -- ligado a: RUTA(s), ZONA, BAJADA/MUELLE, UNIDAD, CHOFER
VIAJE: avance%, peso/vol/monto (total y prep.), estado, días
REGLA_SISTEMA / USUARIO
```

Volúmenes reales observados: 185 órdenes, 32 viajes, 22 compañías de transporte, 22 rutas, 22 zonas, 7 bajadas, 1 almacén (OLO).

## Formatos clave (para el diseño de datos)

- **Códigos con ceros a la izquierda** (almacén `0001`, cliente `0000475`, chofer `004`, compañía `0010`) → **STRING, no entero**.
- **Fechas ISO 8601 UTC con milisegundos** (`2025-07-09T16:51:05.597Z`) → `TIMESTAMP` en UTC.
- **Montos** con separador de miles y 2 decimales (`5,943,740.14`) → `DECIMAL(18,2)`.
- **Pesos/volúmenes** con 2 decimales.
- **`Número de Orden` admite texto libre** → `STRING` largo (riesgo de calidad de datos).
- **Enums observados**: `ACTIVE`/`INACTIVE` (estado), `DISP` (bajada = disponible), `FREE` (chofer disponible), `Pendiente` (viaje).
- **`ID de Cliente` mezcla formatos** (`0000475` vs `005`) → `STRING`.

## Puntos críticos / riesgos

- **Capacidad de flota en 0**: `Capacidad Peso` y `Capacidad Volumétrica` de las unidades vienen en `0`. **Hay que poblarlas antes de automatizar la asignación por capacidad.**
- **Datos sucios en `Número de Orden`** (texto libre) → normalizar / sanear.
- `Número de Chasis` y `Número de Motor` de las unidades vienen vacíos.
- Correos de usuarios con typos reales; columna `Activo` no textual (ícono).

## Implicaciones para el OMS/TMS de reemplazo

1. **Automatizar "Nuevo Viaje"**: motor de ruteo/consolidación que proponga viajes agrupando órdenes por zona/ruta respetando capacidad, prioridad y reglas.
2. **Motor de reglas configurable** (equivalente a "Reglas del sistema").
3. **Multi-almacén** con orígenes de datos por almacén + capa de integración/ETL hacia ERP/WMS.
4. **KPIs en tiempo real** (WebSocket/eventos con agregados cacheados).
5. **Estados de viaje** definidos: `Pendiente → En preparación → En ruta → Entregado → Cerrado/Anulado`, con % de avance sobre líneas preparadas.
6. **Trazabilidad**: Órdenes Inactivas + histórico de viajes (Visor + Reportes).
7. **RBAC**: permisos por módulo.
8. **Saneamiento de datos**: normalizar `Número de Orden` y poblar capacidades de flota.

---

_Nota de contexto para el OMS: este WMH es el sistema del cual el OMS **lee** los pedidos (nivel WMS/EFLOW) y al cual **re-escribe** estado/situación + prioridad. El OMS no toca el WMH ni las tablas intermedias; termina en "alistado" dejando la situación en `GENERADA` para que Planificación arme el viaje. Las capacidades de peso/volumen y las reglas del sistema aquí descritas son insumos directos para el motor de priorización y para Planificación._
