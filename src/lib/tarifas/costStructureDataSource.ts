// Barrel que re-exporta desde los módulos de la carpeta costStructure/.
//
// Acceso a datos de la estructura de costos de una compañía.
//
// La importación de una planilla entera pasa por `importRows`, que corre dentro de una
// TRANSACCIÓN: importar 40 filas de mantenimiento y que fallen las últimas 3 dejaría una estructura
// a medias, con un costo que parece válido y está incompleto. O entran todas, o no entra ninguna.

export type {
  CostStructureInput, CostRowInput, StructureErrors, SaveStructureResult,
  ApplyTemplateInput, ApplyTemplateResult, ImportOutcome,
} from './costStructure/types';
export { EMPTY_PARAMS } from './costStructure/types';
export type { CostStructureRow } from './types';

export {
  toCostStructure, toCostStructureRow,
} from './costStructure/schema';

export { validateStructure } from './costStructure/validation';

export {
  listStructures, activeStructure, listRows,
} from './costStructure/queries';

export {
  saveStructure, addRow, updateRow, deleteRow,
} from './costStructure/mutations';

export { importRows } from './costStructure/import';

export { applyCostTemplate } from './costStructure/template';
