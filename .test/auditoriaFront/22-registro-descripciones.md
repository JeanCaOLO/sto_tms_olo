# Registro — Ronda 2, Fase G (descripciones al pasar el ratón)

Fecha: 2026-10-08.

## Cómo funciona
- `components/base/HintProvider.tsx` (+ `hintKey.ts`): un solo oyente en la raíz de cada pantalla del tarifador. Al pasar el ratón (espera de 350 ms) o enfocar con el teclado (inmediato) un **botón, enlace, pestaña, campo, columna o título de sección**, busca su texto (o la etiqueta del campo, o su `aria-label`) en el diccionario y muestra una burbuja corta (`role="tooltip"`, el elemento queda con `aria-describedby`). Se cierra con Esc, al salir, al hacer clic o al desplazar. No duplica a los elementos que ya traen `title` propio.
- Funciona también dentro de los modales (React propaga los eventos por los portales).
- `components/tarifas/TarifadorHints.tsx` lo activa en las rutas `/liquidaciones`, `/tarifas/costos-flota` y `/reglas-tarifa` (`router/config.tsx`). **Ninguna pantalla se tocó**: no cambia el DOM, así que no se alteró ningún snapshot.
- Un solo lugar de textos: `lib/tarifas/hints/{navegacion,botones,campos,columnas,secciones}.ts` (una frase por elemento, lenguaje llano). La clave es el texto visible, sin importar acentos, mayúsculas, `*`, paréntesis ni signos.

## Cobertura
- Prueba `__tests__/hintsCoverage.test.ts`: recorre el código de las cuatro carpetas del tarifador y exige descripción para **cada campo (`label=`), columna (`header:`), título de sección (`h2–h4`) y botón con texto**; y que ninguna pase de 120 caracteres. Si se agrega uno nuevo sin descripción, la prueba falla y dice cuál.
- Pruebas del mecanismo `HintProvider.test.tsx` (7): espera, foco, Esc, campo por etiqueta, columna por encabezado, respeta `title`, desaparece al salir/hacer clic.
- Alcance conocido: los botones solo-ícono que ya tienen `title` conservan el del navegador; los que no tienen texto ni `title`/`aria-label` no tienen cómo nombrarse (se detectarán en la auditoría visual).

## Verificación
tsc 0 · vitest 931 pasadas / 0 fallidas · eslint 0 errores en el módulo.
