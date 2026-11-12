import type {DraftItem,RequestItemPayload} from '../../lib/devoluciones/solicitudes';

export interface RequestAttempt {key:string;payload:RequestItemPayload[]|null}
export type RequestDraftJournal=Map<string,{
  attempt:RequestAttempt;
  items:DraftItem[];
  uploaded:Map<string,string>;
  counter:number;
}>;
