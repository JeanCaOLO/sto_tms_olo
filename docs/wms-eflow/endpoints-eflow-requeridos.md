# Endpoints requeridos al proveedor de EFLOW (WMS)

> Tablas: `EFLOW_OLO.dbo.EXPEDICIONESCABECERA` y `EFLOW_OLO.dbo.EXPEDICIONESDETALLE`.
> Fecha: 2026-10-06.
>
> **Entornos:** los endpoints se necesitan para **Costa Rica (CR)** y **Venezuela (VE)**. Tanto las consultas (GET) como los cambios (POST) deben reflejarse en las tablas de la base de datos correspondiente a cada entorno:
> - **Pronto:** QA CR y QA VE.
> - **Posteriormente:** Producción CR y Producción VE.

## Parámetros

| Parámetro | Tipo |
|-----------|------|
| `IDEXPEDICION` | varchar(50) |
| `IDCOMPANIA` | varchar(4) |
| `IDALMACEN` | varchar(4) |
| `IDSUCURSAL` | varchar(4) |
| `TPEXES` | varchar(6) |
| `TPEXSI` | varchar(6) |
| `PRIORIDAD` | int |
| `BAJADA` | varchar(3) |

---

## 1. GET `EXPEDICIONESCABECERA`

Devuelve todos los datos de la tabla.

Parámetros: `IDEXPEDICION` (opcional), `IDCOMPANIA`, `IDALMACEN`, `IDSUCURSAL`, `TPEXES`, `TPEXSI`, `PRIORIDAD`, `BAJADA`.

---

## 2. GET `EXPEDICIONESDETALLE`

Devuelve todos los datos de la tabla.

Parámetros: `IDEXPEDICION` (opcional), `IDCOMPANIA`, `IDALMACEN`, `IDSUCURSAL`, `TPEXES`, `TPEXSI`, `PRIORIDAD`, `BAJADA`.

---

## 3. POST `EXPEDICIONESCABECERA`

**Identifican el registro a cambiar:** `IDEXPEDICION`, `IDCOMPANIA`, `IDALMACEN`, `IDSUCURSAL`.

**Campos que se cambian:** `TPEXES` (estado), `TPEXSI` (situación), `PRIORIDAD`, `BAJADA` (opcional: puede ir null o no enviarse).

```json
{
  "IDEXPEDICION": "EXP-000123",
  "IDCOMPANIA": "0109",
  "IDALMACEN": "0001",
  "IDSUCURSAL": "0001",
  "TPEXES": "DISP",
  "TPEXSI": "GENE",
  "PRIORIDAD": 1,
  "BAJADA": "A1"
}
```

**Respuesta esperada:** confirmación estándar de éxito o error, identificando el registro afectado.

```json
{
  "status": "success",
  "message": "Updated",
  "IDEXPEDICION": "EXP-000123",
  "IDCOMPANIA": "0109",
  "IDALMACEN": "0001",
  "IDSUCURSAL": "0001"
}
```

En caso de error:

```json
{
  "status": "error",
  "message": "Expedition not found"
}
```

---

## 4. POST `EXPEDICIONESDETALLE`

**Identifican el registro a cambiar:** `IDEXPEDICION`, `IDCOMPANIA`, `IDALMACEN`, `IDSUCURSAL`.

**Campos que se cambian:** `TPEXES` (estado), `TPEXSI` (situación), `PRIORIDAD`. (Sin bajada.)

```json
{
  "IDEXPEDICION": "EXP-000123",
  "IDCOMPANIA": "0109",
  "IDALMACEN": "0001",
  "IDSUCURSAL": "0001",
  "TPEXES": "DISP",
  "TPEXSI": "GENE",
  "PRIORIDAD": 1
}
```

**Respuesta esperada:** confirmación estándar de éxito o error, identificando el registro afectado.

```json
{
  "status": "success",
  "message": "Updated",
  "IDEXPEDICION": "EXP-000123",
  "IDCOMPANIA": "0109",
  "IDALMACEN": "0001",
  "IDSUCURSAL": "0001"
}
```

En caso de error:

```json
{
  "status": "error",
  "message": "Expedition not found"
}
```
