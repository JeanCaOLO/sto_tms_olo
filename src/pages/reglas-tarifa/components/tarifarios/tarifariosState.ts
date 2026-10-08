import type { Dispatch, SetStateAction } from 'react';
import type { RateTable, RateTableRow } from '../../../../lib/tarifas/types';
import type { CarrierProfile } from '../../../../lib/tarifas/parties';

export interface TarifariosState {
  tables: RateTable[];
  parties: CarrierProfile[];
  truckCodes: string[];
  selectedId: string | null;
  rows: RateTableRow[];
  loading: boolean;
  loadError: string;
  loadingRows: boolean;
  generalError: string;
  editingRowId: string | null;
}

export type SetTarifariosState = Dispatch<SetStateAction<TarifariosState>>;

export const INITIAL_TARIFARIOS_STATE: TarifariosState = {
  tables: [],
  parties: [],
  truckCodes: [],
  selectedId: null,
  rows: [],
  loading: false,
  loadError: '',
  loadingRows: false,
  generalError: '',
  editingRowId: null,
};
