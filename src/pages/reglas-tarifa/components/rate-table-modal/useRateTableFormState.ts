import { useEffect, useState } from 'react';
import type { RateTableInput } from '../../../../lib/tarifas/rateTablesDataSource';
import type { RateTable } from '../../../../lib/tarifas/types';
import {
  emptyRateTableForm, formFromTable, initialRateTableFormState, type RateTableFormState,
} from './rateTableFormState';

/** Estado del formulario; al abrir (o cambiar de tarifario o país) se vuelve a cargar desde cero. */
export function useRateTableFormState(table: RateTable | null, isOpen: boolean, countryId: string) {
  const [state, setState] = useState<RateTableFormState>(() => initialRateTableFormState(countryId));

  useEffect(() => {
    if (!isOpen) return;
    setState((s) => ({
      ...s,
      errors: {},
      generalError: '',
      carrierPick: null,
      form: table ? formFromTable(table) : emptyRateTableForm(countryId),
      valueColumnsText: (table?.valueColumns ?? []).join(', '),
    }));
  }, [isOpen, table, countryId]);

  const set = <K extends keyof RateTableInput>(key: K, value: RateTableInput[K]) => {
    setState((s) => ({ ...s, form: { ...s.form, [key]: value }, errors: { ...s.errors, [key]: undefined } }));
  };

  return { state, setState, set };
}
