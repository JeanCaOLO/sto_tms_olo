// Resuelve una novedad: acepta la diferencia (con cantidad y estado explícitos) o restaura el estado anterior.
// La clave idempotente se conserva mientras no cambien los datos, para reintentar una respuesta perdida sin duplicar.
import {useEffect,useRef,useState} from 'react';
import Button from '../../../components/base/Button';
import Modal from '../../../components/base/Modal';
import {parseQuantity} from '../../../lib/devoluciones/trips';
import type {ReturnCondition,ReturnLine} from '../../../lib/devoluciones/types';
import type {ResolveInput} from '../api/devolucionesApi';

interface Props {
  line:ReturnLine|null;
  onClose:()=>void;
  onConfirm:(input:ResolveInput,key:string)=>Promise<void>;
}
const CONDITIONS:ReturnCondition[]=['Bueno','Dañado','Incompleto'];

export default function ResolveIncidentModal({line,onClose,onConfirm}:Props) {
  const [outcome,setOutcome]=useState<'accepted'|'restored'>('restored');
  const [note,setNote]=useState('');
  const [quantity,setQuantity]=useState('');
  const [condition,setCondition]=useState<ReturnCondition>('Bueno');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const attempt=useRef<{body:string;key:string}|null>(null);
  const inFlight=useRef(false);
  const returnId=line?.id;
  useEffect(()=>{
    if(!line)return;
    attempt.current=null;inFlight.current=false;setError('');setNote('');setOutcome('restored');
    setQuantity(line.received_quantity==null?'':String(line.received_quantity));
    setCondition((CONDITIONS as string[]).includes(line.received_condition??'')?line.received_condition as ReturnCondition:'Bueno');
    // Solo al abrir otra devolución: los cambios de la misma línea no deben borrar lo escrito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[returnId]);

  const submit=async()=>{
    if(inFlight.current)return;
    if(!line?.incident_id){setError('Recargue el viaje para identificar la novedad antes de resolverla.');return;}
    const reason=note.trim();
    if(!reason||reason.length>1000){setError('Escriba el motivo de la resolución (entre 1 y 1000 caracteres).');return;}
    let input:ResolveInput={incident_id:line.incident_id,outcome,note:reason};
    if(outcome==='accepted'){
      const parsed=parseQuantity(quantity);
      if(parsed===null){setError('La cantidad recibida debe ser un número entero mayor o igual a 0.');return;}
      input={...input,received_quantity:parsed,condition};
    }
    const body=JSON.stringify(input);
    if(attempt.current?.body!==body)attempt.current={body,key:crypto.randomUUID()};
    inFlight.current=true;setSaving(true);setError('');
    try{await onConfirm(input,attempt.current.key);}
    catch(e){setError(e instanceof Error?e.message:'No se pudo resolver la novedad.');}
    finally{inFlight.current=false;setSaving(false);}
  };

  return <Modal isOpen={!!line} onClose={saving?()=>undefined:onClose} title="Resolver novedad" widthClass="max-w-lg" closeOnBackdrop={false}>
    <div className="space-y-4 p-6">
      <h3 className="text-lg font-semibold">Resolver novedad</h3>
      <p className="text-sm text-slate-600">{line?.return_number} · {line?.product_name??'Devolución'}</p>
      {line?.incident_explanation&&<p className="rounded bg-amber-50 p-3 text-sm text-amber-900">{line.incident_explanation}</p>}
      <fieldset className="space-y-2" disabled={saving}>
        <legend className="mb-1 text-sm font-medium">Resultado</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="resolve-outcome" checked={outcome==='restored'} onChange={()=>setOutcome('restored')}/>
          <span>Restaurar el estado anterior (la devolución vuelve a como estaba antes de la novedad)</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="resolve-outcome" checked={outcome==='accepted'} onChange={()=>setOutcome('accepted')}/>
          <span>Aceptar la diferencia (queda recibida con la cantidad y el estado que indique)</span>
        </label>
      </fieldset>
      {outcome==='accepted'&&<div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="resolve-quantity" className="mb-1 block text-sm font-medium">Cantidad recibida</label>
          <input id="resolve-quantity" inputMode="numeric" value={quantity} disabled={saving}
            onChange={event=>setQuantity(event.target.value)} className="w-full rounded border border-slate-300 p-2"/></div>
        <div><label htmlFor="resolve-condition" className="mb-1 block text-sm font-medium">Estado de la mercancía</label>
          <select id="resolve-condition" value={condition} disabled={saving}
            onChange={event=>setCondition(event.target.value as ReturnCondition)} className="w-full rounded border border-slate-300 p-2">
            {CONDITIONS.map(item=><option key={item} value={item}>{item}</option>)}
          </select></div>
      </div>}
      <div><label htmlFor="resolve-note" className="mb-1 block text-sm font-medium">Motivo de la resolución</label>
        <textarea id="resolve-note" rows={4} maxLength={1000} value={note} disabled={saving}
          onChange={event=>setNote(event.target.value)} className="w-full rounded border border-slate-300 p-3"/></div>
      {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
        <Button type="button" disabled={saving} onClick={submit}>{saving?'Guardando…':'Resolver novedad'}</Button></div>
    </div>
  </Modal>;
}
