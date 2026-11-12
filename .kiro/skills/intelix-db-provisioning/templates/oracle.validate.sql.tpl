/* ============================================================
   VALIDACION ORACLE - {{COMPANIA}}/{{AMBIENTE}}/{{APLICATIVO}}
   Cada consulta devuelve estado 'OK' o 'FALTA'.
   Recordatorio: en Oracle cada ESQUEMA es un USUARIO PROPIETARIO.
   Ejecutar con un usuario con acceso a las vistas DBA_*.
   ============================================================ */

SET LINESIZE 160
SET PAGESIZE 200

-- 1) ROLES
SELECT 'ROLE' AS objeto, x.nombre,
       CASE WHEN EXISTS (SELECT 1 FROM dba_roles WHERE role = UPPER(x.nombre))
            THEN 'OK' ELSE 'FALTA' END AS estado
FROM (SELECT '{{ROLE_RO}}' AS nombre FROM dual UNION ALL SELECT '{{ROLE_RW}}' FROM dual
      UNION ALL SELECT '{{ROLE_DDL}}' FROM dual UNION ALL SELECT '{{ROLE_ADMIN}}' FROM dual) x;

-- 2) USUARIOS de aplicacion
SELECT 'USER' AS objeto, x.nombre,
       CASE WHEN EXISTS (SELECT 1 FROM dba_users WHERE username = UPPER(x.nombre))
            THEN 'OK' ELSE 'FALTA' END AS estado
FROM (SELECT '{{USR_REPORT}}' AS nombre FROM dual UNION ALL SELECT '{{USR_APP}}' FROM dual
      UNION ALL SELECT '{{USR_DEPLOY}}' FROM dual UNION ALL SELECT '{{USR_DBA}}' FROM dual) x;

-- >>> PER_SCHEMA_BEGIN <<<
-- 3) ESQUEMA (= USUARIO PROPIETARIO) {{SCHEMA_UPPER}}
SELECT 'SCHEMA' AS objeto, '{{SCHEMA_UPPER}}' AS nombre,
       CASE WHEN EXISTS (SELECT 1 FROM dba_users WHERE username = '{{SCHEMA_UPPER}}')
            THEN 'OK' ELSE 'FALTA' END AS estado
FROM dual;

-- 4) TABLAS de ejemplo en {{SCHEMA_UPPER}}
SELECT 'TABLE' AS objeto, '{{SCHEMA_UPPER}}.' || x.nombre AS nombre,
       CASE WHEN EXISTS (SELECT 1 FROM dba_tables
                         WHERE owner = '{{SCHEMA_UPPER}}'
                           AND table_name = UPPER(x.nombre))
            THEN 'OK' ELSE 'FALTA' END AS estado
FROM (SELECT 'tbl_clientes' AS nombre FROM dual UNION ALL SELECT 'tbl_ventas' FROM dual) x;
-- >>> PER_SCHEMA_END <<<
