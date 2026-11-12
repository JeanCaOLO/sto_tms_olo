/* ============================================================
   VALIDACION POSTGRESQL - {{COMPANIA}}/{{AMBIENTE}}/{{APLICATIVO}}
   Cada consulta devuelve estado 'OK' o 'FALTA'.
   El chequeo de DATABASE se corre conectado a 'postgres';
   los chequeos de ESQUEMA/TABLAS, conectado a {{DB_NAME}}.
   ============================================================ */

-- 1) BASE DE DATOS (ejecutar conectado a 'postgres')
SELECT 'DATABASE' AS objeto, '{{DB_NAME}}' AS nombre,
       CASE WHEN EXISTS (SELECT 1 FROM pg_database WHERE datname = '{{DB_NAME}}')
            THEN 'OK' ELSE 'FALTA' END AS estado;

-- 2) ROLES (grupos)
SELECT 'ROLE' AS objeto, x.nombre,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = x.nombre)
            THEN 'OK' ELSE 'FALTA' END AS estado
FROM (VALUES ('{{ROLE_RO}}'), ('{{ROLE_RW}}'),
             ('{{ROLE_DDL}}'), ('{{ROLE_ADMIN}}')) AS x(nombre);

-- 3) USUARIOS (login)
SELECT 'USER' AS objeto, x.nombre,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = x.nombre AND rolcanlogin)
            THEN 'OK' ELSE 'FALTA' END AS estado
FROM (VALUES ('{{USR_REPORT}}'), ('{{USR_APP}}'),
             ('{{USR_DEPLOY}}'), ('{{USR_DBA}}')) AS x(nombre);

-- >>> PER_SCHEMA_BEGIN <<<
-- 4) ESQUEMA {{SCHEMA_NAME}} (ejecutar conectado a {{DB_NAME}})
SELECT 'SCHEMA' AS objeto, '{{SCHEMA_NAME}}' AS nombre,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.schemata
                         WHERE schema_name = '{{SCHEMA_NAME}}')
            THEN 'OK' ELSE 'FALTA' END AS estado;

-- 5) TABLAS de ejemplo en {{SCHEMA_NAME}}
SELECT 'TABLE' AS objeto, '{{SCHEMA_NAME}}.' || x.nombre AS nombre,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema = '{{SCHEMA_NAME}}'
                           AND table_name = x.nombre)
            THEN 'OK' ELSE 'FALTA' END AS estado
FROM (VALUES ('tbl_clientes'), ('tbl_ventas')) AS x(nombre);
-- >>> PER_SCHEMA_END <<<
