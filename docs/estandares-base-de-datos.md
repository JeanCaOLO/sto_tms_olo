# Estándar de Base de Datos INTELIX — Router de naturalezas (obligatorio)

Todo diseño, nombrado y aprovisionamiento de bases de datos en este proyecto
DEBE cumplir el estándar corporativo INTELIX. Es una directriz **vinculante**:
si una decisión de diseño o una porción de SQL la contradice, corrígela o
justifícalo explícitamente antes de continuar.

**La naturaleza de la base de datos determina qué estándar aplica.** Antes de
nombrar cualquier objeto o generar SQL, identifica la naturaleza y enruta al
estándar correcto. No mezcles convenciones entre naturalezas.

## Árbol de decisión

```
¿Naturaleza de la base de datos?
├── TRANSACCIONAL (OLTP)   → aplicativos, escritura, integridad, normalizado
│      motor: cualquiera (PostgreSQL, MySQL/MariaDB, SQL Server, Oracle)
│      estándar: docs/estandares-base-de-datos-oltp-intelix.md
│      skill:    intelix-db-provisioning
│
├── ANALÍTICA (Lago de datos)  → consolidación multi-fuente, lectura analítica/BI
│      motor: PostgreSQL (extensible a otros)
│      capas (esquemas en 1 BD): bronze → silver → gold(dwh, viewbi) → ssot
│      estándar: docs/estandares-lago-de-datos-intelix.md
│      modelo dimensional (esquema dwh): docs/estandares-datawarehouse-intelix.md
│      skill:    intelix-datalake-naming
│
└── INTERMEDIA (Bridge / Interface)  → puente origen→destino (patrón ODS/integración)
       motor: cualquiera (según origen/destino)
       una BD por par: {compania}_brg_{origen}_{destino}_db
       estándar: docs/estandares-bridge-intelix.md
       skill:    intelix-datalake-naming (valida esquemas inbound/outbound)
```

Si la naturaleza no está clara, **pregunta** antes de nombrar o generar SQL.

## Reglas transversales (aplican a TODAS las naturalezas)

1. **Formato:** minúsculas, `snake_case`, sin acentos ni ñ, sin espacios ni
   caracteres especiales. `entidad` en singular.
2. **Sin creación manual en consola:** los objetos se crean con scripts
   versionados y trazables (kit de provisioning para OLTP; scripts revisados
   para analítico/bridge). Nada creado "a mano" en la consola del motor.
3. **Mínimo privilegio:** cada rol/usuario recibe solo lo necesario. Prohibido
   otorgar control total por defecto.
4. **Secretos fuera del repo:** contraseñas y credenciales se gestionan como
   secretos del pipeline (CI/CD); nunca se versionan.
5. **Rollback y revisión:** todo script de creación incluye su ROLLBACK y se
   revisa antes de ejecutar. Ejecuciones en ambientes compartidos (QA/PROD)
   requieren **aprobación humana**.
6. **Sufijo país** (cuando aplique): ISO-3166 alpha-2 en minúsculas.

## Resumen por naturaleza (referencia rápida)

### Transaccional (OLTP)
- Nombres: `{compania}_{ambiente}_{aplicativo}_{tipo}_{nombre}`.
- Objetos: `db`, `sch`, `tbl`, `vw`, `mvw`, `sp`, `fn`, `trg`, `idx`, `uidx`,
  `seq`, `pk`, `fk`, `uq`, `ck`.
- Roles: `ro/rw/ddl/admin_{app}` (herencia `admin > ddl > rw > ro`);
  usuarios `usr_{app}_{report|app|deploy|dba}`.
- Ambientes por stack: DEV↔`develop`, QA↔`qa`, PROD↔`master`.

### Analítica — Lago de datos (PostgreSQL)
- Capas = esquemas en 1 BD (nombre de BD **parametrizable**: `datalakeprd`,
  `datalakeqa`...). Canónico = color; funcional documentado.
- Patrón por capa:

  | Capa | Patrón | Ejemplo |
  |---|---|---|
  | `bronze` (raw/staging) | `{tipo_fuente}_{sistema}_{clase}_{entidad}[_{pais}]` | `xls_khai_fact_consolidado` |
  | `silver` (refined/sor) | `{sistema}_{clase}_{entidad}[_{pais}]` | `khai_fact_consolidado` |
  | `dwh` (en gold) | `dim_`/`fact_`/`br_`/`agg_` | `dim_commodity` |
  | `viewbi` (en gold) | `vw_`/`mvw_` | `vw_venta_mensual` |
  | `ssot` | `mvw_`/`vw_`/tablas certificadas | `mvw_venta_oficial` |

- `tipo_fuente` (`xls csv txt gsh api db json xml`) **solo en bronze**.
- `clase` ∈ `dim`/`fact`/`master`.
- `ssot` = fuente única certificada y oficial; no toda entidad recorre todas
  las capas. Ambientes por instancia/servidor distinto.

### Intermedia — Bridge / Interface (cualquier motor)
- Una BD por par origen–destino: `{compania}_brg_{origen}_{destino}_db`.
- Dirección = esquema: `inbound` (del origen), `outbound` (al destino).
- Tabla: `{stg|hist}_{tipo_fuente}_{sistema}_{clase}_{entidad}[_{pais}]`
  (`stg_` transitoria, `hist_` histórica). Conserva el prefijo de fuente.
- `bridge` es el término canónico; `interface` es sinónimo documentado.

## Herramientas de apoyo

- **Provisioning OLTP:** skill `intelix-db-provisioning` (genera scripts SQL
  multi-motor; no se conecta a las bases).
- **Validación de nombres:** skill `intelix-datalake-naming`
  (`python validar_sql.py --dir ./output`) revisa nomenclatura por capa y
  naturaleza. Es el motor del hook `db-naming-validator` (PostFileSave sobre
  `*.sql`), que reporta violaciones al guardar. El hook **reporta, no bloquea**.

## Fuentes de verdad (detalle completo)

- OLTP: [docs/estandares-base-de-datos-oltp-intelix.md](estandares-base-de-datos-oltp-intelix.md)
- Lago de datos: [docs/estandares-lago-de-datos-intelix.md](estandares-lago-de-datos-intelix.md)
- Datawarehouse (dimensional): [docs/estandares-datawarehouse-intelix.md](estandares-datawarehouse-intelix.md)
- Bridge / Interface: [docs/estandares-bridge-intelix.md](estandares-bridge-intelix.md)
