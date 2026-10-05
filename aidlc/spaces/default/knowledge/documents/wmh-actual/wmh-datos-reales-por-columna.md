Control Tower — Referencia de Datos Reales por Columna

_Documento complementario al mapeo funcional. Ejemplos reales extraídos de la app en vivo (<http://10.17.225.22:8080>) el 22/09/2026, para mostrar qué dato y formato va en cada columna. Útil para definir tipos, longitudes y validaciones del OMS/TMS._

## Observaciones de formato clave (transversales)

- Códigos con ceros a la izquierda: almacén 0001, cliente 0000475, compañía 0010, chofer 004 → usar STRING, no entero.
- Fechas en ISO 8601 UTC: 2026-09-22T00:00:00Z, 2025-07-09T16:51:05.597Z → TIMESTAMP en UTC.
- Montos con separador de miles y 2 decimales: 5,943,740.14 → DECIMAL(18,2).
- Pesos/volúmenes con 2 decimales: 1,980.32, 1,353.90.
- "Número de Orden" admite texto libre (ej. "Error de KPO con picking inverso") → STRING largo, no numérico.
- Estados/enums observados: ACTIVE/INACTIVE, DISP (bajada), FREE (chofer), Pendiente (viaje).

## 1\. Dashboard — Viajes activos (Total: 32)

| **#Viaje** | **#Muelle** | **ID Bajada** | **Avance** | **Almacenes** | **Líneas** | **Cantidad de Rutas** | **ID Ruta** | **Nombre Ruta**                                   | **Zona**  | **Órdenes** | **Monto Total** | **Monto Prep.** | **Peso Total** | **Peso Prep.** | **Volumen Total** | **Volumen Prep.** | **Estado** | **Días transcurridos** |
| ---------- | ----------- | ------------- | ---------- | ------------- | ---------- | --------------------- | ----------- | ------------------------------------------------- | --------- | ----------- | --------------- | --------------- | -------------- | -------------- | ----------------- | ----------------- | ---------- | ---------------------- |
| 8951       | PURT23      | 4             | 100        | 1             | 26         | 1                     | 15          | TURRIALBA                                         | Turrialba | 9           | 1,382,749.26    | 491,918.26      | 34.70          | 9.67           | 1,353.90          | 1,335.42          | Pendiente  | 5                      |
| 8952       | PURT17      | 1             | 98.32      | 1             | 86         | 1                     | 20          | PURISCAL RUTA 27-STA ANA-C.COLON-PURIS-ATEN-TURRU | Santa Ana | 24          | 4,115,961.57    | 3,690,588.97    | 1,146.95       | 1,083.59       | 552.68            | 489.51            | Pendiente  | 5                      |
| 8954       | PURT29      | 4             | 100        | 1             | 124        | 1                     | 33          | (vacío)                                           | (vacío)   | 6           | 4,492,785.69    | 3,810,592.69    | 1,796.58       | 1,001.90       | 33.12             | 33.11             | Pendiente  | 5                      |
| 8956       | PURT21      | 4             | 99.78      | 1             | 138        | 1                     | 34          | (vacío)                                           | (vacío)   | 5           | 5,943,740.14    | 5,250,112.14    | 1,980.32       | 1,084.18       | 1.65              | 1.61              | Pendiente  | 5                      |
| 8957       | PURT21      | 4             | 100        | 1             | 97         | 1                     | 35          | (vacío)                                           | (vacío)   | 6           | 3,234,849.20    | 2,600,229.20    | 1,212.16       | 551.32         | 3.07              | 3.05              | Pendiente  | 5                      |

Notas:

- Avance = % (0–100, hasta 2 dec): 98.32, 99.78, 100.
- Si el viaje tiene varias rutas, Nombre Ruta y Zona pueden venir vacíos.
- Métricas separadas Total vs Prep. (preparado) para peso, volumen y monto.

## 2\. Órdenes (Total: 185)

| **Número de Orden**              | **Código Almacen** | **Fecha de Pedido**      | **Ruta** | **ID de Cliente** | **Nombre del Cliente** | **ID de la Compañía** | **ID de Sucursal** | **ID de Factura** | **Referencia 1** | **Referencia 2** |
| -------------------------------- | ------------------ | ------------------------ | -------- | ----------------- | ---------------------- | --------------------- | ------------------ | ----------------- | ---------------- | ---------------- |
| 7353                             | 0001               | 2025-07-09T16:51:05.597Z | (vacío)  | 0000475           | UNILEVER               | 0010                  | 0001               | (vacío)           | (vacío)          | (vacío)          |
| Error de KPO con picking inverso | 0001               | 2025-04-15T10:55:51.81Z  | (vacío)  | 1000169           | KPO ALPHA INC, S.A     | 0010                  | 0002               | (vacío)           | (vacío)          | (vacío)          |
| CD250512082728-0000208           | 0001               | 2025-05-14T12:14:32.123Z | (vacío)  | 0000208           | AERO T1 SANT MARÍA     | 0010                  | 0003               | (vacío)           | (vacío)          | (vacío)          |
| 2000018103                       | 0001               | 2026-09-22T00:00:00Z     | (vacío)  | 005               | T005 TIBÁS             | 0029                  | 0001               | (vacío)           | (vacío)          | (vacío)          |
| 2000018104                       | 0001               | 2026-09-22T00:00:00Z     | (vacío)  | 006               | T006 DESAMPARADOS      | 0029                  | 0001               | (vacío)           | (vacío)          | (vacío)          |
| 2000018106                       | 0001               | 2026-09-22T00:00:00Z     | (vacío)  | 008               | T008 Cartago           | 0029                  | 0001               | (vacío)           | (vacío)          | (vacío)          |
| Salida Mamalucille 24-2-2025     | 0001               | 2025-02-21T10:06:23.087Z | (vacío)  | 0000327           | CEDI Automercado       | 0042                  | 0001               | (vacío)           | (vacío)          | (vacío)          |

Notas:

- Fecha de Pedido en ISO 8601 UTC (conviven 2025 y 2026).
- ID de Cliente mezcla formatos (0000475 vs 005) → STRING.
- Ruta vacía en órdenes no planificadas (se asigna al crear el viaje).
- Clientes reales: UNILEVER, KPO ALPHA, CEDI Automercado, AERO T1.

## 3\. Catálogo: Almacenes (Total: 1)

| **ID Almacén** | **Código Almacen** | **Nombre Almacen** | **Conexión**                               | **Estado** |
| -------------- | ------------------ | ------------------ | ------------------------------------------ | ---------- |
| 1              | 0001               | OLO                | \[conn\]://10.17.224.20?database=EFLOW_OLO | ACTIVE     |

Notas:

- Conexión = cadena de conexión a BD por almacén (EFLOW_OLO en 10.17.224.20).
- Confirma arquitectura multi-almacén con data source propio.

## 4\. Catálogo: Compañías de Transporte (Total: 22)

| **Compañia Transporte ID** | **Código de la Empresa** | **Nombre de la Empresa**                     | **Estado** |
| -------------------------- | ------------------------ | -------------------------------------------- | ---------- |
| 1                          | 2614                     | CHRISTOPHER EDUARTE TORRES                   | INACTIVE   |
| 2                          | 3404                     | VENTA DE CAMIONES PORTILLO S.A               | INACTIVE   |
| 3                          | 3407                     | TRANSOSA DE ALAJUELA SOCIEDAD ANONIMA        | ACTIVE     |
| 4                          | 3759                     | LUIS CARLOS MARTIN MORA CASTILLO             | ACTIVE     |
| 8                          | 3952                     | INVERSIONES ACUÑA Y SALAZAR DEL CARIBE S.R.L | ACTIVE     |
| 9                          | 3963                     | EDISON MIGUEL UREÑA UREÑA                    | ACTIVE     |

Notas:

- Mezcla personas físicas y jurídicas.
- Código de la Empresa numérico de 4 díg.
- Estado ACTIVE/INACTIVE filtra las utilizables.

## 5\. Catálogo: Rutas de Distribución (Total: 22)

| **ID Ruta** | **ID Zona** | **Código Ruta** | **Nombre Ruta**                 | **Alias Ruta**     | **Estado** |
| ----------- | ----------- | --------------- | ------------------------------- | ------------------ | ---------- |
| 1           | 1           | 01              | CASCO CENTRAL                   | CASCO CENTRAL      | ACTIVE     |
| 2           | 1           | 02              | DESAMPARADOS SAN JOSE SUR-OESTE | SAN JOSE SUR-OESTE | ACTIVE     |
| 4           | 18          | 04              | ALAJUELA                        | ALAJUELA           | ACTIVE     |
| 6           | 34          | 06              | CARTAGO                         | CARTAGO            | ACTIVE     |
| 9           | 72          | 09              | LIMÓN                           | LIMÓN              | ACTIVE     |
| 11          | 1           | 1000            | SAN JOSE                        | SAN JOSE           | ACTIVE     |

Notas:

- ID Zona es FK a Zonas (ruta 4 → zona 18 Alajuela; ruta 6 → zona 34 Cartago).
- Código Ruta STRING de longitud variable: 01, 04, 1000.

## 6\. Catálogo: Zonas de Distribución (Total: 22)

| **ID Zona** | **Código Zona** | **Nombre Zona** | **Alias Zona** | **Estado** |
| ----------- | --------------- | --------------- | -------------- | ---------- |
| 1           | 01              | San José        | San José       | ACTIVE     |
| 2           | 02              | Nicoya          | Nicoya         | ACTIVE     |
| 3           | 03              | Escazú          | Escazú         | ACTIVE     |
| 5           | 05              | Puriscal        | Puriscal       | ACTIVE     |
| 9           | 09              | Santa Ana       | Santa Ana      | ACTIVE     |

Notas:

- Código Zona de 2 díg. con cero. Nombres = cantones de Costa Rica.

## 7\. Catálogo: Bajadas (Total: 7)

| **ID Bajada** | **Estado** |
| ------------- | ---------- |
| 1             | DISP       |
| 2             | DISP       |
| 3             | DISP       |
| 4             | DISP       |
| 5             | DISP       |
| 6             | DISP       |
| 7             | DISP       |

Notas:

- Solo 2 campos. Estado DISP = disponible. Puntos/bandas de carga del muelle.

## 8\. Catálogo: Unidades de Transporte (filtrado por TRANSOSA) (Total: 10 (para TRANSOSA))

| **Unidad Id** | **Nombre de la Empresa**              | **Código Unidad** | **Unidad Descripción** | **Matrícula** | **Número de Chasis** | **Número de Motor** | **Marca Vehículo** | **Tipo Vehículo Id** | **Capacidad Peso** | **Capacidad Volumétrica** |
| ------------- | ------------------------------------- | ----------------- | ---------------------- | ------------- | -------------------- | ------------------- | ------------------ | -------------------- | ------------------ | ------------------------- |
| 12            | TRANSOSA DE ALAJUELA SOCIEDAD ANONIMA | 520               | IZUSU NPR              | CL190087      | (vacío)              | (vacío)             | IZUSU NPR          | CAMION               | 0                  | 0                         |
| 13            | TRANSOSA DE ALAJUELA SOCIEDAD ANONIMA | 766               | IZUSU NPR              | CL213786      | (vacío)              | (vacío)             | IZUSU NPR          | CAMION               | 0                  | 0                         |
| 14            | TRANSOSA DE ALAJUELA SOCIEDAD ANONIMA | 744               | NISSAN UD              | C132239       | (vacío)              | (vacío)             | NISSAN UD          | CAMION               | 0                  | 0                         |
| 18            | TRANSOSA DE ALAJUELA SOCIEDAD ANONIMA | 548               | ISUZU NPR              | CL233545      | (vacío)              | (vacío)             | ISUZU NPR.         | CAMION               | 0                  | 0                         |

Notas:

- Marca/Tipo repiten IZUSU/NISSAN, CAMION. Matrícula formato placa CR.
- CRÍTICO: Capacidad Peso y Capacidad Volumétrica están en 0 → hay que poblarlas antes de automatizar la asignación por capacidad.
- Número de Chasis y Motor vienen vacíos.

## 9\. Catálogo: Choferes (filtrado por TRANSOSA) (Total: 7 (para TRANSOSA))

| **ID del Chofer** | **Nombre de la Empresa**              | **Código del Chofer** | **ID de la Tarjeta del Chofer** | **Nombre del Chofer**       | **Estado** | **Situación** | **Numero del Chofer** |
| ----------------- | ------------------------------------- | --------------------- | ------------------------------- | --------------------------- | ---------- | ------------- | --------------------- |
| 4                 | TRANSOSA DE ALAJUELA SOCIEDAD ANONIMA | 264                   | 204300699                       | LUIS DIEGO SOLORZANO GOMEZ  | ACTIVE     | FREE          | 004                   |
| 5                 | TRANSOSA DE ALAJUELA SOCIEDAD ANONIMA | 296                   | 205400666                       | GERARDO ALONSO DURAN ALFARO | ACTIVE     | FREE          | 005                   |
| 7                 | TRANSOSA DE ALAJUELA SOCIEDAD ANONIMA | 375                   | 601730907                       | VICTOR MANUEL VEGA CHAVES   | ACTIVE     | FREE          | 007                   |
| 10                | TRANSOSA DE ALAJUELA SOCIEDAD ANONIMA | 186                   | C136919                         | OMAR ASDRUBAL VILLAGRA      | ACTIVE     | FREE          | 010                   |

Notas:

- ID de la Tarjeta del Chofer suele ser la cédula (9 díg.), con casos inconsistentes.
- Situación FREE (disponible), Estado ACTIVE. Numero del Chofer con ceros (004).

## 10\. Seguridad: Reglas del sistema (Total: 8)

| **ID Regla**   | **Tipo de regla** | **Descripción**                                                                        | **Fecha de instalación** | **Fecha de mantenimiento** | **Versión** | **Rango** | **Rango num.1** | **Rango num.2** | **Rango alfa.1** | **Rango alfa.2** |
| -------------- | ----------------- | -------------------------------------------------------------------------------------- | ------------------------ | -------------------------- | ----------- | --------- | --------------- | --------------- | ---------------- | ---------------- |
| ADMPASS        | FLOW              | Contraseña para procesos que requieran autorización.                                   | 2024-06-10T10:22:11.433Z | 2025-01-09T20:25:41.423Z   | 4.17.0.2    | A1        |                 |                 | OLOVIAJE2025     |                  |
| MECALUX        | FLOW              | Indica si el cliente usa interfaces de MECALUX.                                        | 2024-06-10T10:22:11.34Z  |                            | 4.17.0.2    | L         |                 |                 |                  |                  |
| PROGRESSTYPE   | FLOW              | Define el tipo de trabajo que determina el progreso de un viaje                        | 2024-07-31T09:04:31.07Z  |                            | 4.17.0.3    | A1        |                 |                 | CHEQDK           |                  |
| USECARGACAMION | FLOW              | INDICA SI VALIDA CARGA DE CAMION AL CERRAR VIAJE.                                      | 2026-09-18T11:21:26.52Z  |                            | 4.18.4.4    | L         |                 |                 |                  |                  |
| USEINCLINEBELT | FLOW              | Modifica el flujo de creación de viajes para pedir una bajada de cinta transportadora. | 2024-06-10T10:22:11.247Z |                            | 4.17.0.2    | L         |                 |                 |                  |                  |

Notas:

- Motor de parámetros. Tipo FLOW. Rango L (lógico) o A1 (alfanumérico).
- El valor se guarda en Rango alfanumérico 1 (ADMPASS → OLOVIAJE2025).
- Relevantes: USECARGACAMION, USEINCLINEBELT, PROGRESSTYPE, USECHEQUEO.

## 11\. Seguridad: Usuarios (Total: 11)

| **ID del usuario** | **Código del usuario** | **Nombre** | **Apellidos**   | **Email**                  | **Activo** |
| ------------------ | ---------------------- | ---------- | --------------- | -------------------------- | ---------- |
| 1                  | admin                  | Admin      | User            | (vacío)                    | (vacío)    |
| 12                 | JBonilla               | Janis      | Bonilla Picado  | <jbonilla@ologistics.com>  | (vacío)    |
| 15                 | ECardena               | Edwin      | Cardenaz        | <ecardenas@ologistics.com> | (vacío)    |
| 23                 | 6565                   | Steven     | Marin           | <smarin@ologistics.com>    | (vacío)    |
| 25                 | csaborio               | Cesar      | Saborio Vasquez | <csaborio@ologistics.com>  | (vacío)    |

Notas:

- Código del usuario = login (alias, numérico o admin).
- Correos mayormente @ologistics.com (con typos reales).
- Activo se ve vacío (probable ícono no textual).

_Datos extraídos en vivo el 22/09/2026. Reflejan el estado real de la base EFLOW_OLO en ese momento._