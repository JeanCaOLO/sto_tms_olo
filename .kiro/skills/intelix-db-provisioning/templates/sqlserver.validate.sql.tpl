/* ============================================================
   VALIDACION SQL SERVER - {{COMPANIA}}/{{AMBIENTE}}/{{APLICATIVO}}
   Cada consulta devuelve estado 'OK' o 'FALTA'.
   ============================================================ */

-- 1) BASE DE DATOS
SELECT 'DATABASE' AS objeto, '{{DB_NAME}}' AS nombre,
       CASE WHEN DB_ID(N'{{DB_NAME}}') IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS estado;
GO

-- 2) LOGINS (nivel servidor)
USE master;
GO
SELECT 'LOGIN' AS objeto, x.nombre,
       CASE WHEN EXISTS (SELECT 1 FROM sys.server_principals
                         WHERE name = x.nombre AND type IN ('S','U'))
            THEN 'OK' ELSE 'FALTA' END AS estado
FROM (VALUES ('{{USR_REPORT}}'), ('{{USR_APP}}'),
             ('{{USR_DEPLOY}}'), ('{{USR_DBA}}')) AS x(nombre);
GO

USE {{DB_NAME}};
GO

-- 3) USUARIOS de base de datos
SELECT 'USER' AS objeto, x.nombre,
       CASE WHEN EXISTS (SELECT 1 FROM sys.database_principals
                         WHERE name = x.nombre AND type IN ('S','U'))
            THEN 'OK' ELSE 'FALTA' END AS estado
FROM (VALUES ('{{USR_REPORT}}'), ('{{USR_APP}}'),
             ('{{USR_DEPLOY}}'), ('{{USR_DBA}}')) AS x(nombre);
GO

-- 4) ROLES de base de datos
SELECT 'ROLE' AS objeto, x.nombre,
       CASE WHEN EXISTS (SELECT 1 FROM sys.database_principals
                         WHERE name = x.nombre AND type = 'R')
            THEN 'OK' ELSE 'FALTA' END AS estado
FROM (VALUES ('{{ROLE_RO}}'), ('{{ROLE_RW}}'),
             ('{{ROLE_DDL}}'), ('{{ROLE_ADMIN}}')) AS x(nombre);
GO

-- >>> PER_SCHEMA_BEGIN <<<
-- 5) ESQUEMA {{SCHEMA_NAME}}
USE {{DB_NAME}};
GO
SELECT 'SCHEMA' AS objeto, '{{SCHEMA_NAME}}' AS nombre,
       CASE WHEN SCHEMA_ID(N'{{SCHEMA_NAME}}') IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS estado;

-- 6) TABLAS de ejemplo en {{SCHEMA_NAME}}
SELECT 'TABLE' AS objeto, '{{SCHEMA_NAME}}.' + x.nombre AS nombre,
       CASE WHEN EXISTS (SELECT 1 FROM sys.tables t
                         JOIN sys.schemas s ON s.schema_id = t.schema_id
                         WHERE s.name = '{{SCHEMA_NAME}}' AND t.name = x.nombre)
            THEN 'OK' ELSE 'FALTA' END AS estado
FROM (VALUES ('tbl_clientes'), ('tbl_ventas')) AS x(nombre);
GO
-- >>> PER_SCHEMA_END <<<
