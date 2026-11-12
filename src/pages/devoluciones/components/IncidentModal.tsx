import {useEffect,useRef,useState} from 'react';
import Button from '../../../components/base/Button';
import Modal from '../../../components/base/Modal';
import type {ReturnLine} from '../../../lib/devoluciones/types';
import {ReturnApiError} from '../api/devolucionesApi';

interface Props {
  line:ReturnLine|null;
  onClose:()=>void;
  onConfirm:(explanation:string,key:string)=>Promise<void>;
}
export default function IncidentModal({line,onClose,onConfirm}:Props) {
  const [text,setText]=useState('');
  const [saving,setSaving]=useState(false);
  const [uncertain,setUncertain]=useState(false);
  const [error,setError]=useState('');
  const attempt=useRef<{text:string;key:string}|null>(null);
  const inFlight=useRef(false);
  const returnId=line?.id;
  useEffect(()=>{
    if(!returnId)return;
    attempt.current=null;inFlight.current=false;setText('');setError('');setUncertain(false);
  },[returnId]);
  const submit=async()=>{
    if(inFlight.current)return;
    const explanation=attempt.current?.text??text.trim();
    if(!explanation||explanation.length>1000){setError('Escriba la novedad (entre 1 y 1000 caracteres).');return;}
    attempt.current??={text:explanation,key:crypto.randomUUID()};
    inFlight.current=true;setSaving(true);setError('');
    try {await onConfirm(attempt.current.text,attempt.current.key);setUncertain(false);}
    catch(e){setError(e instanceof Error?e.message:'No se pudo registrar la novedad.');
      if(e instanceof ReturnApiError&&[400,403,404,409,422].includes(e.status)){attempt.current=null;setUncertain(false);}
      else setUncertain(true);
    }finally{inFlight.current=false;setSaving(false);}
  };
  const locked=saving||uncertain;
  return <Modal isOpen={!!line} onClose={locked?()=>undefined:onClose} title="Registrar novedad" widthClass="max-w-lg" closeOnBackdrop={false}>
    <div className="space-y-4 p-6">
      <h3 className="text-lg font-semibold">Registrar novedad</h3>
      <p className="text-sm text-slate-600">{line?.return_number} · {line?.product_name??'Devolución'}</p>
      <p className="text-sm text-slate-600">La devolución quedará en revisión. Su aceptación se decidirá por el proceso interno.</p>
      <div><label htmlFor="return-incident-text" className="mb-1 block text-sm font-medium">Explique la novedad</label>
        <textarea id="return-incident-text" rows={5} maxLength={1000} value={text} disabled={locked}
          onChange={event=>setText(event.target.value)} className="w-full rounded border border-slate-300 p-3"/></div>
      {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
      {uncertain&&<p className="text-sm text-amber-700">No se confirmó el registro. Reintente el mismo texto para comprobar el resultado.</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={locked} onClick={onClose}>Cancelar</Button>
        <Button type="button" disabled={saving} onClick={submit}>{saving?'Guardando…':'Guardar novedad'}</Button></div>
    </div>
  </Modal>;
}
