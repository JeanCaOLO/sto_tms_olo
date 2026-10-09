// Descripciones del tarifador que se muestran al pasar el ratón por un botón, campo, pestaña, columna o
// sección. Un solo lugar, en lenguaje llano, una frase corta por elemento.
//
// La clave es el texto visible del elemento (sin importar acentos, mayúsculas, `*`, paréntesis ni
// signos: ver `hintKey`). Para sumar una descripción basta con agregar una línea en el archivo del tipo.

import type { HintMap } from '../../../components/base/hintKey';
import { NAVEGACION } from './navegacion';
import { BOTONES } from './botones';
import { CAMPOS } from './campos';
import { COLUMNAS } from './columnas';
import { SECCIONES } from './secciones';

export const TARIFADOR_HINTS: HintMap = {
  ...NAVEGACION, ...BOTONES, ...CAMPOS, ...COLUMNAS, ...SECCIONES,
};
