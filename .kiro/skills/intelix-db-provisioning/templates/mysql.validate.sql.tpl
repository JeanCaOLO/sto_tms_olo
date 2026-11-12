/* ============================================================
   VALIDACION MYSQL/MARIADB - {{COMPANIA}}/{{AMBIENTE}}/{{APLICATIVO}}
   Cada consulta devuelve estado 'OK' o 'FALTA'.
   Recordatorio: en MySQL cada ESQUEMA es una BASE DE DATOS.
   ============================================================ */

-- 1) ROLES (en MySQL 8.0+ un rol es una fila en mysql.user)
SELECT 'ROLE' AS objeto, x.nombre,
       CASE WHEN EXISTS (SELECT 1 FROM mysql.user WHERE user = x.nombre)
            THEN 'OK' ELSE 'FALTA' END AS estado
FROM (SELECT '{{ROLE_RO}}' AS nombre UNION ALL SELECT '{{ROLE_RW}}'
      UNION ALL SELECT '{{ROLE_DDL}}' UNION ALL SELECT '{{ROLE_ADMIN}}') AS x;

-- 2) USUARIOS
SELECT 'USER' AS objeto, x.nombre,
       CASE WHEN EXISTS (SELECT 1 FROM mysql.user WHERE user = x.nombre)
            THEN 'OK' ELSE 'FALTA' END AS estado
FROM (SELECT '{{USR_REPORT}}' AS nombre UNION ALL SELECT '{{USR_APP}}'
      UNION ALL SELECT '{{USR_DEPLOY}}' UNION ALL SELECT '{{USR_DBA}}') AS x;

-- >>> PER_SCHEMA_BEGIN <<<
-- 3) BASE DE DATOS (= ESQUEMA) {{SCHEMA_NAME}}
SELECT 'DATABASE' AS objeto, '{{SCHEMA_NAME}}' AS nombre,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.schemata
                         WHERE schema_name = '{{SCHEMA_NAME}}')
            THEN 'OK' ELSE 'FALTA' END AS estado;

-- 4) TABLAS de ejemplo en {{SCHEMA_NAME}}
SELECT 'TABLE' AS objeto, CONCAT('{{SCHEMA_NAME}}.', x.nombre) AS nombre,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema = '{{SCHEMA_NAME}}'
                           AND table_name = x.nombre)
            THEN 'OK' ELSE 'FALTA' END AS estado
FROM (SELECT 'tbl_clientes' AS nombre UNION ALL SELECT 'tbl_ventas') AS x;
-- >>> PER_SCHEMA_END <<<
