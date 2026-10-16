import type { Dispatch, SetStateAction } from 'react';
import type { RateTableErrors, RateTableInput } from '../../../../lib/tarifas/rateTablesDataSource';
import type { PartyVariable, RateTable } from '../../../../lib/tarifas/types';

export interface RateTableFormState {
  form: RateTableInput;
  errors: RateTableErrors;
  generalError: string;
  saving: boolean;
  partyVars: PartyVariable[];
  valueColumnsText: string;
  carrierPick: string | null;
}

export type SetRateTableFormState = Dispatch<SetStateAction<RateTableFormState>>;

/** Formulario de un tarifario nuevo: clave por defecto zona de origen + tipo de camión. */
export const emptyRateTableForm = (countryId: string): RateTableInput => ({
  countryId,
  partyId: null,
  code: '',
  name: '',
  keyColumns: ['originZone', 'truckTypeId'],
  valueColumns: [],
  active: true,
});

/** Formulario con los datos de un tarifario existente (copias, para no mutar el original). */
export const formFromTable = (table: RateTable): RateTableInput => ({
  countryId: table.countryId,
  partyId: table.partyId,
  code: table.code,
  name: table.name,
  keyColumns: [...table.keyColumns],
  valueColumns: [...(table.valueColumns ?? [])],
  active: table.active,
});

export const initialRateTableFormState = (countryId: string): RateTableFormState => ({
  form: emptyRateTableForm(countryId),
  errors: {},
  generalError: '',
  saving: false,
  partyVars: [],
  valueColumnsText: '',
  carrierPick: null,
});
