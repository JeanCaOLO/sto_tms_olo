# Pendientes por módulo

Cuando una sesión de Claude altere un módulo (Tracking, Planificación, OMS, Tarifas, etc.), **todo lo que quede sin hacer y los planes posibles** se anotan en la documentación de ese módulo, en la carpeta:

```
docs/{nombre-del-módulo}/pendientes/*.md
```

- Un archivo por tema, con prefijo numérico (`01-...md`) y un `README.md` índice con una tabla (pendiente, estado).
- Cada archivo dice: **Estado** (`pendiente por implementar`, `pendiente por verificar` o `idea`), **qué falta**, **por qué** y **cómo hacerlo** (archivos y funciones concretas).
- Se actualiza en la misma sesión que hace el cambio, antes de cerrar: lo ya resuelto se borra o se marca como hecho; lo nuevo se agrega.
- Si el módulo ya tiene una carpeta `docs/{módulo}/`, `pendientes/` va dentro. Si no existe, se crea.
- Ejemplo vigente: `docs/tracking/pendientes/`.
