# Selección múltiple en tablas

## Funcionalidad

Las tablas que lo pidan muestran una casilla por fila y una casilla en el encabezado. Al marcar filas aparece, encima de la tabla, una barra con «N seleccionados», los botones de acción de esa pantalla y «Quitar selección».

## Concepto

Es una capacidad del componente compartido `DataTable` (`src/components/base/DataTable.tsx`), activada con una prop opcional `selection`. Sin esa prop la tabla es idéntica a antes. El estado de la selección es del padre (componente controlado): la tabla solo dibuja y avisa.

## Objetivo

Que cualquier listado pueda ofrecer acciones sobre varias filas sin repetir código ni romper la regla del proyecto de que todo listado usa `DataTable`. Hoy lo usan Liquidaciones (viajes) y Reglas.

## Cómo se implementa

```ts
interface RowSelection<T> {
  selected: Set<string>;                          // ids marcados (estado del padre)
  onChange: (next: Set<string>) => void;
  disabledReason?: (row: T) => string | null;     // texto = fila no marcable, y se muestra como tooltip
  bar: (ids: string[]) => ReactNode;              // botones de la barra
}
```

- La casilla del encabezado marca o desmarca **las filas de la página visible** que se pueden marcar (salta las deshabilitadas) y queda «a medias» si solo algunas lo están.
- Las acciones reciben solo los ids **que se ven ahora**: una fila marcada que un filtro o la búsqueda esconde no cuenta. Así ninguna acción en lote alcanza algo que la persona no puede revisar.
- La columna de casillas se suma al `colSpan` de las filas vacías, de carga y desplegadas.

## Cómo se usa

En una tabla: marcar casillas, usar un botón de la barra o «Quitar selección». Para añadirla a otra pantalla:

```tsx
<DataTable
  …
  selection={{
    selected, onChange: setSelected,
    disabledReason: (row) => (row.bloqueada ? 'Motivo' : null),
    bar: (ids) => <Button onClick={() => hacer(ids)}>Hacer</Button>,
  }}
/>
```

## Pruebas

`DataTable.test.tsx` (bloque «selección de filas»): sin la prop no hay casillas; la barra aparece solo con filas marcadas y recibe los ids; la casilla del encabezado salta las deshabilitadas; una fila oculta por un filtro deja de contar.
