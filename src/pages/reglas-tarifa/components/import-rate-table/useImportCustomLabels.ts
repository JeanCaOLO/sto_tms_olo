import { useEffect } from 'react';
import { listPartyVariables, labelsOf } from '../../../../lib/tarifas/partyVariablesDataSource';
import type { RateTable } from '../../../../lib/tarifas/types';
import type { SetImportState } from './importRateTableState';

/** Carga los rótulos de las variables propias de la compañía si la tabla las usa en su clave. */
export function useImportCustomLabels(table: RateTable | null, setState: SetImportState) {
  useEffect(() => {
    if (!table?.partyId || !table.keyColumns.some((c) => c.startsWith('custom:'))) {
      setState((s) => ({ ...s, customLabels: {} }));
      return;
    }
    let cancelled = false;
    listPartyVariables(table.partyId, { includeInactive: true })
      .then((list) => {
        if (!cancelled) setState((s) => ({ ...s, customLabels: labelsOf(list) }));
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, customLabels: {} }));
      });
    return () => { cancelled = true; };
  }, [table?.partyId, table?.keyColumns, setState]);
}
