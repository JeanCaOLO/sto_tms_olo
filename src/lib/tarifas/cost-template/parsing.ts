// Orquestación de parsing de plantillas de costos desde hojas de cálculo.
// Módulo PURO: no importa React, ni la capa de datos, ni usa `Date.now()`.

import type { CostRowInput } from '../costStructureDataSource';
import type { CostStructureParams } from '../types';
import { parseFixed } from './fixed-parsing';
import { parseParams } from './param-parsing';
import { parseVariables } from './variable-parsing';

export interface TemplateIssue {
  sheet: string;
  /** Fila del archivo (1 = encabezado). Null = la hoja entera. */
  row: number | null;
  message: string;
}

export interface ParseState {
  errors: TemplateIssue[];
  warnings: TemplateIssue[];
  rows: CostRowInput[];
  truckTypes: Set<string>;
  usedCodes: Set<string>;
  operatingDays: number | null;
  params: CostStructureParams;
}

// El orquestador vive en `costTemplate.ts` (`parseCostTemplate`); acá solo los pasos individuales.
export { parseFixed, parseParams, parseVariables };
