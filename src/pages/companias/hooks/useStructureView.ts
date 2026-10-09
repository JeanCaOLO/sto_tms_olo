import { useMemo } from 'react';
import { COST_DRIVER_LABELS } from '../../../lib/tarifas/cost';
import { summarize } from '../../../lib/tarifas/costTemplate';
import type { CostDriver, CostStructure, CostStructureRow, PartyVariable } from '../../../lib/tarifas/types';

const SYSTEM_DRIVER_OPTIONS = (Object.keys(COST_DRIVER_LABELS) as CostDriver[])
  .map((d) => ({ value: d as string, label: COST_DRIVER_LABELS[d as keyof typeof COST_DRIVER_LABELS] }));

/** Lo que se calcula para mostrar: formas de cobro disponibles, nombres de variables y resumen por camión. */
export function useStructureView(
  variables: PartyVariable[],
  structure: CostStructure | null,
  rows: CostStructureRow[],
  inherited: { structure: CostStructure; rows: CostStructureRow[] } | null,
) {
  const driverOptions = useMemo(() => [
    ...SYSTEM_DRIVER_OPTIONS,
    ...variables.map((v) => ({ value: v.key as string, label: `${v.label} (variable de la compañía)` })),
  ], [variables]);

  const customLabels = useMemo(
    () => Object.fromEntries(variables.map((v) => [v.key, v.label])) as Record<string, string>,
    [variables],
  );

  const shown = structure
    ? { structure, rows }
    : inherited
      ? { structure: inherited.structure, rows: inherited.rows }
      : null;

  const summary = useMemo(
    () => (shown ? summarize(shown.rows.filter((r) => r.active), shown.structure.params, shown.structure.operatingDaysPerMonth) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structure, rows, inherited],
  );

  return { driverOptions, customLabels, summary };
}
