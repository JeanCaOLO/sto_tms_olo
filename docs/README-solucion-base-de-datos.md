# Solución de Estándares de Base de Datos — INTELIX

Marco de gobierno, nomenclatura y aprovisionamiento de bases de datos para
proyectos que parten de la plantilla `template_base`. Estandariza **cómo se
nombran, crean y validan** los objetos de base de datos según la **naturaleza**
del repositorio de datos.

> Directriz vinculante (Capa 1) en el steering
> `.kiro/steering/estandares-base-de-datos.md`. Este README es la guía práctica
> de uso; el detalle normativo vive en los docs fuente de verdad enlazados abajo.

---

## 1. Idea central: la naturaleza decide el estándar

Antes de nombrar un objeto o generar SQL, identifica la naturaleza de la base de
datos. **No se mezclan convenciones entre naturalezas.**

```
¿Naturaleza de la base de datos?
├── TRANSACCIONAL (OLTP)   → aplicativos, escritura, integridad, normalizado
│      motor: cualquiera (PostgreSQL, MySQL/MariaDB, SQL Server, Oracle)
│
├── ANALÍTICA (Lago de datos)  → consolidación multi-fuente, lectura BI
│      motor: PostgreSQL (extensible)
│      capas: bronze → silver → gold(dwh, viewbi) → ssot
│
└── INTERMEDIA (Bridge / Interface)  → puente origen→destino (ODS/integración)
       motor: cualquiera; una BD por par origen-destino
```

---

## 2. Naturaleza Transaccional (OLTP)

Aplicativos con escritura frecuente, integridad referencial y modelo
normalizado.

- **Nomenclatura:** `{compania}_{ambiente}_{aplicativo}_{tipo}_{nombre}`.
- **Objetos:** `db`, `sch`, `tbl`, `vw`, `mvw`, `sp`, `fn`, `trg`, `idx`,
  `uidx`, `seq`, `pk`, `fk`, `uq`, `ck`.
- **Roles/usuarios:** `ro/rw/ddl/admin_{app}` (herencia `admin > ddl > rw > ro`);
  `usr_{app}_{report|app|deploy|dba}`.
- **Motores:** PostgreSQL, MySQL/MariaDB, SQL Server, Oracle.

Se automatiza con la skill **`intelix-db-provisioning`** (genera scripts SQL de
creación + validación; **no se conecta** a las bases).

Detalle: `docs/estandares-base-de-datos-oltp-intelix.md`.

---

## 3. Naturaleza Analítica (Lago de datos)

Capas = **esquemas** dentro de **una sola BD** del lago. Nombre de la BD
**parametrizable** (`datalakeprd`, `datalakeqa`, `datalakedev`). Nombre canónico
de capa = **color**; el nombre funcional se conserva como concepto.

| Capa (esquema) | Funcional | Patrón de tabla | Ejemplo |
|---|---|---|---|
| `bronze` | raw / staging | `{tipo_fuente}_{sistema}_{clase}_{entidad}[_{pais}]` | `xls_khai_fact_consolidado` |
| `silver` | refined / sor | `{sistema}_{clase}_{entidad}[_{pais}]` (cae `tipo_fuente`) | `khai_fact_consolidado` |
| `dwh` (en gold) | estrella/copo | `dim_` · `fact_` · `br_` · `agg_` | `dim_commodity`, `fact_embarque` |
| `viewbi` (en gold) | perspectivas BI | `vw_` · `mvw_` | `vw_venta_mensual` |
| `ssot` | fuente oficial certificada | `mvw_` · `vw_` · tablas certificadas | `mvw_venta_oficial` |

- `tipo_fuente` ∈ `xls csv txt gsh api db json xml` (**solo en bronze**).
- `clase` ∈ `dim` / `fact` / `master`.
- Sufijo `_pais` (ISO alpha-2) válido en todas las capas.
- **No toda entidad recorre todas las capas** hasta SSoT.
- **Ambientes:** por instancia/servidor distinto (opcional sufijo de esquema si
  conviven).

Detalle: `docs/estandares-lago-de-datos-intelix.md` y, para el modelo
dimensional, `docs/estandares-datawarehouse-intelix.md`.

---

## 4. Naturaleza Intermedia (Bridge / Interface)

Base "puente" que desacopla un **origen** de un **destino** (patrón ODS /
integración), con alta fidelidad al origen.

- **Una BD por par:** `{compania}_brg_{origen}_{destino}_db`.
- **Dirección = esquema:** `inbound` (del origen) / `outbound` (al destino).
- **Tabla:** `{stg|hist}_{tipo_fuente}_{sistema}_{clase}_{entidad}[_{pais}]`
  (`stg_` transitoria, `hist_` histórica). Conserva el prefijo de fuente.
- **Motor:** cualquiera (según origen/destino).
- Término canónico `bridge`; `interface` es sinónimo documentado.

Ejemplos: `inbound.stg_xls_khai_fact_consolidado`,
`outbound.hist_db_softland_fact_asiento`.

Detalle: `docs/estandares-bridge-intelix.md`.

---

## 5. Reglas transversales (todas las naturalezas)

1. Minúsculas, `snake_case`, sin acentos ni ñ, sin caracteres especiales.
2. `entidad` en singular.
3. Sin creación manual en consola: scripts versionados y trazables, con ROLLBACK.
4. Mínimo privilegio; prohibido control total por defecto.
5. Secretos fuera del repositorio (CI/CD).
6. Aprobación humana para ejecutar en ambientes compartidos (QA/PROD).

---

## 6. Herramientas incluidas

### 6.1 Skill `intelix-db-provisioning` (OLTP)

Genera scripts SQL de provisioning y validación multi-motor.

```bash
cd .kiro/skills/intelix-db-provisioning

# Dependencia opcional (solo si usas config.yaml):
pip install -r requirements.txt

# Editar config.yaml (compania, ambiente, aplicativo, schemas, passwords) y:
python generate.py --engine all           # o --engine postgresql|mysql|sqlserver|oracle
python validate.py --engine all

# CI/CD (secretos, sin versionar contraseñas):
python generate.py --engine all --from-env
```

Salida en `output/`: `<motor>_provisioning.sql` y `<motor>_validation.sql`.
Revisar, ejecutar en el motor y confirmar que la validación muestra `OK`.

### 6.2 Skill `intelix-datalake-naming` (validador)

Linter de nomenclatura por capa/naturaleza (solo librería estándar).

```bash
# Validar archivos o un directorio
python .kiro/skills/intelix-datalake-naming/validar_sql.py --dir ./output
python .kiro/skills/intelix-datalake-naming/validar_sql.py archivo.sql

# Verificación interna del propio validador
python .kiro/skills/intelix-datalake-naming/validar_sql.py --self-test
```

Detecta: mayúsculas, acentos/ñ, no-snake_case, `tipo_fuente` fuera de bronze,
`clase` inválida, prefijos dimensionales en `dwh`, vistas `vw_/mvw_`, volatilidad
`stg_/hist_` en bridge, y placeholders `{{...}}` sin reemplazar. **Reporta, no
bloquea.**

### 6.3 Hook `db-naming-validator`

`PostFileSave` sobre `*.sql`: ejecuta el validador automáticamente al guardar un
archivo SQL y reporta observaciones (no bloquea). Definido en
`.kiro/hooks/db-naming-validator.json`.

---

## 7. Instalación

La skill OLTP se registra en el instalador de skills:

```bash
# Windows
install-skills.bat        # elegir la opción "intelix-db-provisioning"

# Linux/macOS
./install-skills.sh
```

`intelix-datalake-naming` no requiere instalación (usa solo la librería estándar
de Python). El hook queda activo al iniciar la próxima sesión de Kiro.

---

## 8. Índice de documentos

| Documento | Contenido |
|---|---|
| `.kiro/steering/estandares-base-de-datos.md` | Router vinculante + reglas transversales |
| `docs/estandares-base-de-datos-oltp-intelix.md` | Estándar transaccional (OLTP) |
| `docs/estandares-lago-de-datos-intelix.md` | Estándar lago de datos (capas medallion + SSoT) |
| `docs/estandares-datawarehouse-intelix.md` | Estándar dimensional (esquema `dwh`) |
| `docs/estandares-bridge-intelix.md` | Estándar intermedia (bridge/interface) |
| `docs/observaciones-merge-estandares-bd.md` | Notas para el responsable del merge |

---

## 9. Flujo de trabajo recomendado

1. Identificar la **naturaleza** de la base de datos.
2. Consultar el doc fuente de verdad correspondiente.
3. OLTP: generar con `intelix-db-provisioning`; analítico/bridge: escribir los
   scripts siguiendo la nomenclatura por capa.
4. Validar la nomenclatura con `intelix-datalake-naming` (o dejar que el hook lo
   haga al guardar).
5. Revisar, aprobar y ejecutar (con las puertas de calidad del proyecto).
