import type {DraftItem,RequestItemPayload} from '../../lib/devoluciones/solicitudes';
import type {ReturnCustomer, ReturnOrder} from './api/solicitudesApi';

export interface RequestAttempt {
  key: string;
  payload: RequestItemPayload[] | null;
  orderId?: string;
  pointId?: string;
  customer?: ReturnCustomer;
  order?: ReturnOrder;
}
export type RequestDraftJournal=Map<string,{
  attempt:RequestAttempt;
  items:DraftItem[];
  uploaded:Map<string,string>;
  counter:number;
}>;
