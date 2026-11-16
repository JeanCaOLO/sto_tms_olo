import {useEffect,useRef,useState} from 'react';
import Button from '../../../components/base/Button';
import {approveRequest,rejectRequest,RequestApiError,type RequestDetail} from '../../mis-devoluciones/api/solicitudesApi';

export interface DecisionNotice {kind: 'success' | 'error'; message: string}
type Attempt = {target: 'aprobada' | 'rechazada'; reason: string};
export type DecisionAttempts = Map<string, Attempt & {inFlight: boolean}>;
interface Props {
  detail: RequestDetail;
  onReload: () => void;
  onChanged: () => void;
  onNotice: (notice: DecisionNotice) => void;
  attempts: DecisionAttempts;
  onAttemptsChanged: () => void;
}
export default function DecisionActions({detail,onReload,onChanged,onNotice,attempts,onAttemptsChanged}:Props) {
  const requestId=detail.request.id;
  const attempt=attempts.get(requestId);
  const [reason,setReason]=useState(()=>attempt?.reason??'');
  const busy=attempt?.inFlight??false;
  const hadAttempt=useRef(!!attempt);
  const lifecycle=useRef(0);
  useEffect(()=>()=>{lifecycle.current++;},[]);
  useEffect(()=>{
    if(detail.request.status!=='pendiente_asignacion'){
      hadAttempt.current=false;
      if(attempts.delete(requestId))onAttemptsChanged();
    } else if(hadAttempt.current&&!attempt){
      hadAttempt.current=false;
      onReload(); // Otro modal recibio la respuesta del POST: conciliar este detalle.
    } else if(attempt)hadAttempt.current=true;
  },[attempt,attempts,requestId,detail.request.status,onReload,onAttemptsChanged]);
  if(detail.request.status!=='pendiente_asignacion')return null;

  const decide=async(target:Attempt['target'])=>{
    const current=attempts.get(requestId);
    if(current?.inFlight)return;
    const next=current??{target,reason:target==='rechazada'?reason.trim():'',inFlight:false};
    if(next.target!==target)return;
    if(target==='rechazada'&&(!next.reason||next.reason.length>500)){
      onNotice({kind:'error',message:next.reason?'El motivo admite hasta 500 caracteres.':'Escriba el motivo de rechazo.'});return;
    }
    const generation=lifecycle.current;
    next.inFlight=true;attempts.set(requestId,next);onAttemptsChanged();
    try {
      const result=target==='aprobada'?await approveRequest(detail.request.id):await rejectRequest(detail.request.id,next.reason);
      if(result.status!==target)throw new Error('No se pudo confirmar la decisión; reintente la misma acción.');
      attempts.delete(requestId);onAttemptsChanged();onChanged();
      if(generation!==lifecycle.current)return;
      onNotice({kind:'success',message:'Decisión registrada.'});onReload();
    } catch(error) {
      if(error instanceof RequestApiError&&error.status===409){
        attempts.delete(requestId);onAttemptsChanged();onChanged();
        if(generation===lifecycle.current){
          onNotice({kind:'error',message:'El estado cambió. Revise la decisión vigente antes de continuar.'});onReload();
        }
      } else {
        if(error instanceof RequestApiError&&[400,403,404,422].includes(error.status))attempts.delete(requestId);
        if(generation===lifecycle.current){
          onNotice({kind:'error',message:error instanceof Error?error.message:'No se pudo registrar la decisión.'});
          if(error instanceof RequestApiError&&[403,404].includes(error.status)){onReload();onChanged();}
        }
      }
    } finally {
      next.inFlight=false;onAttemptsChanged();
    }
  };
  return <section className="space-y-3 rounded border border-teal-200 bg-teal-50 p-4">
    <p className="text-sm text-slate-700">La decisión se aplica a toda la solicitud y sus cantidades.</p>
    <label htmlFor="request-rejection-reason" className="block text-sm font-medium">Motivo de rechazo</label>
    <textarea id="request-rejection-reason" rows={3} maxLength={500} value={reason} disabled={busy||!!attempt}
      onChange={event=>setReason(event.target.value)} className="w-full rounded border border-slate-300 p-2 text-sm"/>
    <div className="flex flex-wrap gap-3">
      <Button type="button" onClick={()=>decide('aprobada')} disabled={busy||(!!attempt&&attempt.target!=='aprobada')}>Aprobar solicitud</Button>
      <Button type="button" variant="danger" onClick={()=>decide('rechazada')} disabled={busy||(!!attempt&&attempt.target!=='rechazada')}>Rechazar solicitud</Button>
    </div>
    {busy&&<p role="status" className="text-sm">Registrando decisión…</p>}
    {!busy&&attempt&&<p className="text-sm text-amber-700">Si no se confirmó el resultado, reintente la misma decisión sin modificar el motivo.</p>}
  </section>;
}
