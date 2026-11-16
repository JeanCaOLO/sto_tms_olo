import {useCallback,useEffect,useState} from 'react';
import Button from '../../../components/base/Button';
import Modal from '../../../components/base/Modal';
import Select from '../../../components/base/Select';
import {usePermissions} from '../../../hooks/usePermissions';
import RequestForm from '../../mis-devoluciones/page';
import {getCreationCompanies,type ClientAssignment} from '../../mis-devoluciones/api/solicitudesApi';
import type {RequestDraftJournal} from '../../mis-devoluciones/requestDraftJournal';

export default function RequestCreation({countryId,onCreated,journal}:{countryId?:string|null;onCreated:()=>void;journal?:RequestDraftJournal}) {
  const {can,isAdmin,permissions}=usePermissions();
  const chooseCompany=!!isAdmin||permissions?.role?.name==='Gerente';
  const allowed=can('devoluciones_solicitud','create')||chooseCompany&&can('devoluciones','create');
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [companies,setCompanies]=useState<ClientAssignment[]>([]);
  const [selected,setSelected]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [version,setVersion]=useState(0);
  useEffect(()=>{
    if(!open||!chooseCompany||!allowed)return;
    let active=true;
    setLoading(true);setError('');setCompanies([]);setSelected('');
    getCreationCompanies(countryId).then(rows=>{if(active)setCompanies(rows);})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'No se pudieron cargar las empresas.');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[open,chooseCompany,allowed,countryId,version]);
  const close=useCallback(()=>{if(!busy)setOpen(false);},[busy]);
  const company=companies.find(row=>row.id===selected);
  if(!allowed)return null;
  return <>
    <Button type="button" onClick={()=>setOpen(true)}>Crear solicitud</Button>
    <Modal isOpen={open} onClose={close} title="Crear solicitud" closeOnBackdrop={false} widthClass="max-w-3xl">
      <div className="space-y-5 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Crear solicitud</h2>
          <Button type="button" variant="secondary" onClick={close} disabled={busy}>Cerrar solicitud</Button>
        </div>
        {chooseCompany&&<>
          <Select label="Empresa destinataria" value={selected} disabled={busy||loading}
            onChange={event=>setSelected(event.target.value)}
            options={[{value:'',label:'Seleccione una empresa'},...companies.map(row=>({value:row.id,label:row.name}))]}/>
          {loading&&<p role="status">Cargando empresas autorizadas…</p>}
          {error&&<div role="alert"><p>{error}</p><Button type="button" onClick={()=>setVersion(v=>v+1)}>Reintentar empresas</Button></div>}
          {!loading&&!error&&companies.length===0&&<p>No hay empresas autorizadas para crear solicitudes.</p>}
        </>}
        {(!chooseCompany||company)&&<RequestForm key={company?.id??'assigned'} mode="create" company={company}
          onCreated={onCreated} onBusyChange={setBusy} journal={journal}/>}
      </div>
    </Modal>
  </>;
}
