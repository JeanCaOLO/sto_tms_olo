"""Dominio puro de la API genérica de datos (/api/data/{table}).

La regla de negocio central es la LISTA BLANCA: qué tablas y columnas existen y
cómo se relacionan. Ningún nombre de tabla/columna que llega del cliente entra a
una query sin validarse aquí primero. Este paquete no ejecuta SQL: `schema` mantiene
un cache de columnas que se puebla inyectando un runner (el adaptador pasa
`pg.query`); el resto (relations, table_modules, select_parser) es 100% puro.
"""
