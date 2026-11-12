import {useEffect,useRef,useState,type ReactNode} from 'react';
import Modal from '../../../components/base/Modal';
import Button from '../../../components/base/Button';
import Badge from '../../../components/base/Badge';
import {REASONS,requestStatus} from '../../../lib/devoluciones/solicitudes';
import {getFileUrl,getRequest,type RequestFile,type RequestDetail as Detail,type SignedRequestFile} from '../api/solicitudesApi';

function Evidence({requestId,file,index}:{requestId:string;file:RequestFile;index:number}) {
  const [signed,setSigned]=useState<SignedRequestFile|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [opened,setOpened]=useState(false);
  const generation=useRef(0);
  const label=`${file.kind==='video'?'video':'foto'} ${index+1}`;
  useEffect(()=>()=>{generation.current++;},[]);
  useEffect(()=>{
    if(!signed)return;
    const current=generation.current;
    const timer=setTimeout(()=>{if(current===generation.current){setSigned(null);setError('El enlace venció. Renueve para volver a abrirlo.');}},signed.expires_in*1000);
    return ()=>clearTimeout(timer);
  },[signed]);
  const load=async()=>{
    const current=++generation.current;
    setLoading(true);setSigned(null);setError('');setOpened(true);
    try {const value=await getFileUrl(requestId,file.id);if(current===generation.current)setSigned(value);}
    catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'No se pudo abrir la evidencia.');}
    finally{if(current===generation.current)setLoading(false);}
  };
  const failed=()=>{setSigned(null);setError('No se pudo cargar el archivo. Renueve el enlace.');};
  return <div className="space-y-2 rounded border border-slate-200 p-3">
    <Button type="button" variant="secondary" size="sm" onClick={load} disabled={loading}>
      {loading?'Abriendo…':`${opened?'Renovar':'Ver'} ${label}`}
    </Button>
    {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
    {signed&&(file.kind==='video'
      ? <video aria-label={`Evidencia ${label}`} src={signed.url} controls preload="metadata" onError={failed} className="max-h-80 w-full"/>
      : <img alt={`Evidencia ${label}`} src={signed.url} onError={failed} className="max-h-80 max-w-full object-contain"/>)}
  </div>;
}

interface RequestDetailProps {
  requestId: string;
  onClose: () => void;
  notice?: ReactNode;
  renderActions?: (detail: Detail, reload: () => void) => ReactNode;
}
export default function RequestDetail({requestId,onClose,notice,renderActions}:RequestDetailProps) {
  const [detail,setDetail]=useState<Detail|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;setDetail(null);setError('');setLoading(true);
    getRequest(requestId).then(value=>{if(active)setDetail(value);})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'No se pudo consultar la solicitud.');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[requestId,retry]);
  const status=detail?requestStatus(detail.request.status):null;
  return <Modal isOpen onClose={onClose} title="Detalle de solicitud de recolecta">
    <div className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-800">Detalle de solicitud</h2>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cerrar detalle</Button>
      </div>
      {notice}
      {loading&&<p role="status">Cargando detalle…</p>}
      {error&&<div role="alert" className="space-y-2 text-sm text-red-600"><p>{error}</p>
        <Button type="button" variant="secondary" size="sm" onClick={()=>setRetry(v=>v+1)}>Reintentar detalle</Button></div>}
      {detail&&<>
        <div className="space-y-2 text-sm">
          <p className="font-mono font-semibold">{detail.request.request_number}</p>
          <Badge variant={status!.variant}>{status!.label}</Badge> <Badge>Recolecta</Badge>
          <p>Empresa destinataria: <strong>{detail.request.customer_name}</strong></p>
          <p>Solicitada: {new Date(detail.request.created_at).toLocaleString('es-CR')}</p>
          {detail.request.decided_at&&<p>Decisión registrada por {detail.request.decided_by_name||'Devoluciones'} el {new Date(detail.request.decided_at).toLocaleString('es-CR')}</p>}
          {detail.request.status==='aprobada'&&<p>Aprobada para recolecta. La recepción en almacén se confirma por separado.</p>}
          {detail.request.rejection_reason&&<p className="rounded bg-red-50 p-3 text-red-700">{detail.request.rejection_reason}</p>}
        </div>
        {renderActions?.(detail,()=>setRetry(v=>v+1))}
        {detail.items.map(item=><section key={item.id} className="space-y-3 rounded border border-slate-200 p-4">
          <h3 className="font-semibold">{item.product_name||'Artículo sin nombre registrado'}</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt>Código</dt><dd>{item.product_code}</dd><dt>Cantidad solicitada</dt><dd>{item.quantity}</dd>
            <dt>Motivo</dt><dd>{REASONS.find(r=>r.code===item.reason_code)?.label||item.reason_code}</dd>
          </dl>
          {item.description&&<p className="whitespace-pre-wrap text-sm">{item.description}</p>}
          {item.files.length===0&&<p className="text-sm text-slate-500">Sin evidencias adjuntas.</p>}
          {item.files.map((file,index)=><Evidence key={file.id} requestId={requestId} file={file} index={index}/>)}
        </section>)}
      </>}
    </div>
  </Modal>;
}
