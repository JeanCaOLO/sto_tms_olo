# Reglas: activar, desactivar y eliminar en lote

## Funcionalidad

En Reglas Tarifa → Reglas, marcando varias filas aparecen en la barra los botones **Desactivar**, **Activar** y **Eliminar**, según los permisos de la persona.

- Activar y desactivar piden una confirmación («¿Desactivar 3 reglas? Dejan de aplicarse en las liquidaciones nuevas.»).
- Eliminar abre el modal de confirmación habitual, con los códigos de todas las reglas marcadas.
- Al terminar, un aviso resume el resultado: «Se desactivaron 3 de 3 reglas.» o, si alguna falla, «Se eliminaron 2 de 3 reglas. R_X: está referenciada en liquidaciones existentes.»

## Concepto

Es el mismo cambio que se haría abriendo cada regla, repetido sobre un grupo. No hay operación de lote en el backend: se aplica regla por regla, y una que falla no detiene a las demás.

## Objetivo

Apagar o limpiar varias reglas sin abrirlas una por una, manteniendo la bitácora completa.

## Cómo se implementa

| Pieza | Archivo |
|---|---|
| Barra de acciones y permisos | `parts/RulesSection.tsx` (usa la selección de `DataTable`) |
| Ejecución y resumen | `api/bulkRules.ts` → `runBulkRules`, `bulkSummary` |
| Activar/desactivar con bitácora | `api/reglasTarifaApi.ts` → `setRuleActiveWithAudit` |
| Confirmaciones y avisos | `hooks/useRuleBulk.ts` |

Detalles que importan para el backend:

- Activar y desactivar envían **solo** `{ "active": true|false }` (un `PATCH` por regla), nunca la regla entera. No cambia `version`, porque no cambia el contenido de la regla; editar una regla desde el formulario sí la sube.
- Cada cambio deja su evento `UPDATE` o `DELETE` en `tarifas_audit_log` con la regla anterior y la nueva. Una regla que falla no deja bitácora.
- Eliminar una regla referenciada por liquidaciones devuelve 409 (`23503`); en el lote aparece en el resumen como «está referenciada en liquidaciones existentes.» y esa regla queda en el modal para decidir.
- Permisos: «Desactivar» y «Activar» requieren editar `tarifas.config`; «Eliminar», borrar. Sin ninguno de los dos no hay casillas. Con «Ver como» Liquidador, las reglas son de solo lectura y no aparecen.
- Reglas ocultas por el filtro «Activa» (que está activo por defecto) no cuentan en la selección: al desactivar, desaparecen de la vista y no se arrastran a la siguiente acción.

## Cómo se usa

1. Reglas Tarifa → Reglas.
2. Marca las reglas (o la casilla del encabezado para toda la página).
3. Elige Desactivar, Activar o Eliminar en la barra y confirma.
4. Para ver las reglas desactivadas, quita el filtro «Activa» del encabezado de la columna.

## Pruebas

- `api/bulkRules.test.ts`: desactivar escribe solo `{ active: false }` y registra cada cambio; una que falla no detiene a las demás y se informa; un error de red cuenta como fallo de esa regla.
- `parts/RulesSection.test.tsx`: la barra aparece con los botones según el permiso y entrega las reglas marcadas; sin permisos no hay casillas.
- Navegador: `herramientas/e2e/fase10-lotes.mjs`, pasos R1 y R2 (desactivar 2 reglas: «Se desactivaron 2 de 2 reglas.»; eliminar muestra los códigos).
