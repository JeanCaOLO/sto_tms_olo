import {useEffect,useState} from 'react';
import Button from '../../../components/base/Button';
import Card from '../../../components/base/Card';
import Select from '../../../components/base/Select';
import Badge from '../../../components/base/Badge';
import {useAuth} from '../../../hooks/useAuth';
import {usePermissions} from '../../../hooks/usePermissions';
import {requestStatus} from '../../../lib/devoluciones/solicitudes';
import RequestDetail from '../../mis-devoluciones/components/RequestDetail';
import {listRequestInbox,type RequestInboxPage} from '../../mis-devoluciones/api/solicitudesApi';
import RequestCreation from './RequestCreation';
import type {RequestDraftJournal} from '../../mis-devoluciones/requestDraftJournal';

interface InboxProps {countryId?:string|null;journal?:RequestDraftJournal}

export default function RequestInbox({countryId,journal}:InboxProps) {
  const {user,loading:authLoading}=useAuth();
  const {can,loading,countries}=usePermissions();
  if(authLoading||loading)return <p role="status">Cargando permisos…</p>;
  if(!user||!can('devoluciones','view'))return <p role="alert">No tiene permiso para consultar solicitudes.</p>;
  return <Inbox key={`${user.id}:${countryId??''}:${JSON.stringify(countries)}`} countryId={countryId} journal={journal}/>;
}

function Inbox({countryId,journal}:InboxProps) {
  const [query,setQuery]=useState({estado:'',empresa:'',offset:0});
  const [data,setData]=useState<RequestInboxPage|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [version,setVersion]=useState(0);
  const [selected,setSelected]=useState<string|null>(null);
  const limit=25;
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    listRequestInbox({...query,limit,pais:countryId}).then(result=>{if(active)setData(result);})
      .catch(e=>{if(active){setData(null);setError(e instanceof Error?e.message:'No se pudo cargar la bandeja.');}})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[query,countryId,version]);
  const reload=()=>setVersion(v=>v+1);
  const close=()=>{setSelected(null);};
  const change=(patch:Partial<typeof query>)=>{close();setQuery(previous=>({...previous,...patch}));};
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Solicitudes de recolecta</h2>
        <p className="text-sm text-slate-500">Consulte el avance de las solicitudes dentro de su alcance.</p></div>
      <div className="flex flex-wrap gap-2"><RequestCreation countryId={countryId} onCreated={reload} journal={journal}/>
        <Button type="button" variant="secondary" onClick={reload} disabled={loading}>Actualizar solicitudes</Button></div>
    </div>
    <p className="text-sm text-slate-600">Las solicitudes nuevas se aprueban automáticamente. La integración de Planificación está pendiente.</p>
    <Card className="grid gap-4 sm:grid-cols-2">
      <Select label="Estado de solicitud" value={query.estado} onChange={event=>change({estado:event.target.value,offset:0})}
        options={[{value:'',label:'Todos los estados'},{value:'pendiente_asignacion',label:'Pendiente de revisión'},
          {value:'aprobada',label:'Aprobada'},{value:'rechazada',label:'Rechazada'}]}/>
      <Select label="Empresa" value={query.empresa} onChange={event=>change({empresa:event.target.value,offset:0})}
        options={[{value:'',label:'Todas las empresas de mi alcance'},...(data?.companies??[]).map(company=>({value:company.id,label:company.name}))]}/>
    </Card>
    {error&&<div role="alert" className="text-sm text-red-600"><p>{error}</p>
      <Button type="button" variant="secondary" onClick={reload}>Reintentar solicitudes</Button></div>}
    {loading&&<p role="status">Cargando solicitudes…</p>}
    {!loading&&!error&&data?.items.length===0&&<p>No hay solicitudes con estos filtros.</p>}
    {!loading&&!error&&data?.items.map(row=>{
      const status=requestStatus(row.status,row.approval_mode);
      return <Card key={row.id} className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1 text-sm">
          <p className="font-mono font-semibold">{row.request_number} <Badge variant={status.variant}>{status.label}</Badge></p>
          <p>{row.customer_name}</p><p>{row.requested_by_name||'Solicitante registrado'}</p>
          {row.status==='aprobada'&&<p className="text-slate-600">Pendiente de Planificación</p>}
          <p className="text-slate-500">{new Date(row.created_at).toLocaleString('es-CR')} · {row.items} artículos</p>
        </div>
        <Button type="button" variant="secondary" aria-label={`Revisar ${row.request_number}`} onClick={()=>setSelected(row.id)}>Ver detalle</Button>
      </Card>;
    })}
    <div className="flex items-center justify-between gap-3">
      <Button type="button" variant="secondary" disabled={loading||query.offset===0} onClick={()=>change({offset:Math.max(0,query.offset-limit)})}>Página anterior</Button>
      <span className="text-sm">Página {Math.floor(query.offset/limit)+1}</span>
      <Button type="button" variant="secondary" disabled={loading||!data?.has_more||!!error} onClick={()=>change({offset:query.offset+limit})}>Página siguiente</Button>
    </div>
    {selected&&<RequestDetail key={selected} requestId={selected} onClose={close}/>}
  </div>;
}
