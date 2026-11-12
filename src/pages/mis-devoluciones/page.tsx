// Cliente solicita recolectas y consulta sus solicitudes. La revision comercial y la recepcion son pasos distintos.
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Badge from '../../components/base/Badge';
import Button from '../../components/base/Button';
import Card from '../../components/base/Card';
import Input from '../../components/base/Input';
import Select from '../../components/base/Select';
import TabBar from '../../components/base/TabBar';
import { tabPanelProps } from '../../components/base/tabPanelProps';
import {useAuth} from '../../hooks/useAuth';
import {usePermissions} from '../../hooks/usePermissions';
import RequestDetail from './components/RequestDetail';
import {
  ACCEPT_ATTR, CODE_LIMIT, DESCRIPTION_LIMIT, MAX_FILES_PER_ITEM, MAX_ITEMS, NAME_LIMIT, REASONS, fileProblem,
  isVideo, newDraftItem, requestStatus, toPayloadItem, validateAll, type DraftItem, type ItemErrors, type ReasonCode, type RequestItemPayload,
} from '../../lib/devoluciones/solicitudes';
import {
  createRequest, getClientAssignment, listMyRequests, uploadFile, RequestApiError, type ClientAssignment, type CreatedRequest, type MyReturnRequest,
} from './api/solicitudesApi';

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const formatIso = (iso: string) => {
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString('es-CR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
};

type TabKey = 'nueva' | 'historial';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'nueva', label: 'Nueva solicitud' },
  { key: 'historial', label: 'Mis solicitudes' },
];

const tabClass = (active: boolean) =>
  `px-4 py-2 text-sm font-medium border-b-2 cursor-pointer ${
    active ? 'border-teal-600 text-teal-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-700'
  }`;

export default function MisDevolucionesPage() {
  const {user,loading}=useAuth();
  if(loading||!user)return <p role="status">Cargando sesión…</p>;
  return <ClientRequests key={user.id}/>;
}

function ClientRequests() {
  const {can,loading:permissionsLoading}=usePermissions();
  const canCreate=can('devoluciones_solicitud','create');
  const canRead=can('devoluciones_solicitud','view');
  const [assignment,setAssignment]=useState<ClientAssignment|null>(null);
  const [assignmentLoading,setAssignmentLoading]=useState(false);
  const [assignmentError,setAssignmentError]=useState('');
  const assignmentGeneration=useRef(0);
  const historyGeneration=useRef(0);
  const [selectedRequest,setSelectedRequest]=useState<string|null>(null);
  const inFlight=useRef(false);
  const lifecycle=useRef(0);
  useEffect(()=>()=>{lifecycle.current++;},[]);
  const attempt=useRef<{key:string;payload:RequestItemPayload[]|null}|null>(null);
  const [pendingConfirmation,setPendingConfirmation]=useState(false);
  const [tab, setTab] = useState<TabKey>('nueva');
  const counter = useRef(0);
  const nextId = () => `n${++counter.current}`;
  const [items, setItems] = useState<DraftItem[]>(() => [newDraftItem(nextId())]);
  const [errors, setErrors] = useState<Record<string, ItemErrors>>({});
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<CreatedRequest | null>(null);
  // Archivos ya subidos a S3 (id del borrador -> llave): si el envío falla y se reintenta, no se suben de nuevo.
  const uploaded = useRef(new Map<string, string>());

  // Historial de solicitudes del cliente
  const [history, setHistory] = useState<MyReturnRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    const generation=++historyGeneration.current;
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const res = await listMyRequests();
      if(generation===historyGeneration.current)setHistory(res);
    } catch (e) {
      if(generation===historyGeneration.current)setHistoryError(e instanceof Error ? e.message : 'No se pudo cargar el historial.');
    } finally {
      if(generation===historyGeneration.current)setLoadingHistory(false);
    }
  }, []);

  const loadAssignment=useCallback(async()=>{
    const generation=++assignmentGeneration.current;
    setAssignment(null);setAssignmentLoading(true);setAssignmentError('');
    try {
      const value=await getClientAssignment();
      if(!value?.id||!value.name?.trim())throw new Error('No se pudo confirmar la empresa asignada.');
      if(generation===assignmentGeneration.current)setAssignment(value);
    } catch(e){if(generation===assignmentGeneration.current)setAssignmentError(e instanceof Error?e.message:'No se pudo consultar la empresa asignada.');}
    finally{if(generation===assignmentGeneration.current)setAssignmentLoading(false);}
  },[]);
  useEffect(()=>{
    if(!permissionsLoading&&(canRead||canCreate))void loadAssignment();
    return ()=>{assignmentGeneration.current++;historyGeneration.current++;};
  },[permissionsLoading,canRead,canCreate,loadAssignment]);

  useEffect(() => {
    if (tab === 'historial' && canRead) {
      loadHistory();
    }
  }, [tab, loadHistory,canRead]);

  const editingDisabled=sending||pendingConfirmation||!assignment||!canCreate;

  const patch = (id: string, changes: Partial<DraftItem>) =>
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)));

  const addFiles = (item: DraftItem, event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    const accepted = [...item.files];
    let problem = '';
    for (const file of picked) {
      const reason = fileProblem(file, accepted.length);
      if (reason) problem = reason;
      else accepted.push({ id: nextId(), file });
    }
    setFileErrors((prev) => ({ ...prev, [item.id]: problem }));
    patch(item.id, { files: accepted });
  };

  const removeFile = (item: DraftItem, fileId: string) => {
    uploaded.current.delete(fileId);
    patch(item.id, { files: item.files.filter((f) => f.id !== fileId) });
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((item) => item.id !== id));

  const reset = () => {
    attempt.current=null;setPendingConfirmation(false);
    uploaded.current.clear();
    setItems([newDraftItem(nextId())]);
    setErrors({});
    setFileErrors({});
    setFormError('');
    setDone(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if(inFlight.current||done)return;
    if(!canCreate||!assignment){setFormError('Necesita permiso y una empresa asignada para enviar.');return;}
    const check = validateAll(items);
    setErrors(check.errors);
    setFormError(check.message);
    if (!check.ok) return;
    const generation=lifecycle.current;
    inFlight.current=true;
    setSending(true);
    try {
      if(!attempt.current)attempt.current={key:crypto.randomUUID(),payload:null};
      let payload=attempt.current.payload;
      if(!payload){
       payload=[];
       for (const item of items) {
        const keys = [];
        for (const draft of item.files) {
          let key = uploaded.current.get(draft.id);
          if (!key) {
            key = (await uploadFile(draft.file)).key;
            if(generation!==lifecycle.current)return;
            uploaded.current.set(draft.id, key);
          }
          keys.push({ key });
        }
        payload.push(toPayloadItem(item, keys));
       }
       attempt.current.payload=payload;
       setPendingConfirmation(true);
      }
      const created = await createRequest(payload,attempt.current.key);
      if(generation!==lifecycle.current)return;
      setDone(created);
      if(canRead)void loadHistory();
    } catch (err) {
      if(generation!==lifecycle.current)return;
      setFormError(err instanceof Error?err.message:'No se pudo enviar la solicitud.');
      if(err instanceof RequestApiError&&[400,403,404,422].includes(err.status)){
        attempt.current=null;uploaded.current.clear();setPendingConfirmation(false);
        if(err.status===403)void loadAssignment();
      }
    } finally {
      inFlight.current=false;
      if(generation===lifecycle.current)setSending(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Mis devoluciones</h1>
          <p className="text-sm text-slate-500">
            Solicite devoluciones de mercadería y consulte el estado de sus trámites.
          </p>
        </div>
      </div>

      <Card className="space-y-2 text-sm">
        <Badge>Recolecta</Badge>
        <p className="font-medium text-slate-700">Empresa destinataria</p>
        {(permissionsLoading||assignmentLoading)&&<p role="status">Cargando empresa asignada…</p>}
        {assignment&&<p>{assignment.name}</p>}
        {assignmentError&&<div role="alert" className="text-red-600"><p>{assignmentError}</p>
          <Button type="button" variant="secondary" size="sm" onClick={loadAssignment}>Reintentar empresa</Button></div>}
        <p className="text-slate-500">El código se ingresa manualmente mientras no haya un catálogo de productos disponible.</p>
      </Card>

      <Card className="p-0">
        <TabBar<TabKey>
          tabs={canRead?TABS:TABS.filter(t=>t.key==='nueva')}
          value={tab}
          onChange={setTab}
          ariaLabel="Pestañas de devoluciones"
          idBase="mis-devoluciones"
          tabClassName={tabClass}
          className="flex gap-2 border-b border-slate-200 px-4 pt-2"
        />
      </Card>

      <div {...tabPanelProps('mis-devoluciones', tab)}>
        {tab === 'historial' && canRead && (
          <div className="space-y-4">
            {loadingHistory && <p role="status" className="text-sm text-slate-500">Cargando solicitudes…</p>}
            {historyError && (
              <p role="alert" className="text-sm text-red-600">
                {historyError} <button type="button" className="underline cursor-pointer" onClick={loadHistory}>Reintentar</button>
              </p>
            )}
            {!loadingHistory && !historyError && history.length === 0 && (
              <Card className="text-center py-8 space-y-3">
                <i className="ri-inbox-line text-3xl text-slate-400"></i>
                <p className="text-sm text-slate-600">Aún no tiene solicitudes de devolución registradas.</p>
                <Button size="sm" onClick={() => setTab('nueva')}>Crear mi primera solicitud</Button>
              </Card>
            )}
            {!loadingHistory && !historyError && history.length > 0 && (
              <div className="space-y-3">
                {history.map((req) => {
                  const statusInfo = requestStatus(req.status);
                  return (
                    <Card key={req.id} className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-slate-800">{req.request_number}</span>
                          <Badge size="sm" variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Registrada el {formatIso(req.created_at)} · {req.items} {req.items === 1 ? 'artículo' : 'artículos'}
                        </p>
                      </div>
                      <Button type="button" size="sm" variant="secondary" aria-label={`Ver detalle ${req.request_number}`}
                        onClick={()=>setSelectedRequest(req.id)}>Ver detalle</Button>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'nueva' && done && (
          <Card className="text-center space-y-4 py-8">
            <div className="w-14 h-14 mx-auto flex items-center justify-center rounded-full bg-teal-50">
              <i className="ri-checkbox-circle-line text-3xl text-teal-600"></i>
            </div>
            <h2 className="text-xl font-semibold text-slate-800">Solicitud registrada</h2>
            <Badge variant={requestStatus(done.status).variant}>{requestStatus(done.status).label}</Badge>
            <p className="text-sm text-slate-600">
              Recibimos su solicitud de devolución <span className="font-semibold">{done.request_number}</span>.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <Button onClick={reset}>Nueva solicitud</Button>
              {canRead&&<Button variant="secondary" onClick={() => { reset(); setTab('historial'); }}>
                Ver mis solicitudes
              </Button>}
            </div>
          </Card>
        )}

        {tab==='nueva'&&!done&&!canCreate&&!permissionsLoading&&<p>{canRead?'No tiene permiso para crear solicitudes; puede consultar su historial.':'No tiene permiso para acceder a las solicitudes.'}</p>}
        {tab === 'nueva' && !done && canCreate && (
          <form onSubmit={submit} className="space-y-4" noValidate>
            {formError && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
                <i className="ri-error-warning-line text-lg"></i>
                <span>{formError}</span>
              </div>
            )}
            {pendingConfirmation&&formError&&<p className="text-sm text-amber-700">El resultado del envío no se confirmó. Reintente el mismo envío o consulte Mis solicitudes; el borrador se conserva sin cambios.</p>}
            {items.map((item, index) => (
              <Card key={item.id} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-700">Artículo {index + 1}</h2>
                  {items.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(item.id)} disabled={editingDisabled}>
                      <i className="ri-delete-bin-line"></i> Quitar
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    disabled={editingDisabled}
                    label="Código del artículo *" value={item.productCode} maxLength={CODE_LIMIT}
                    onChange={(e) => patch(item.id, { productCode: e.target.value })} error={errors[item.id]?.productCode}
                  />
                  <Input
                    disabled={editingDisabled}
                    label="Cantidad a devolver *" inputMode="numeric" value={item.quantity}
                    onChange={(e) => patch(item.id, { quantity: e.target.value })} error={errors[item.id]?.quantity}
                  />
                  <Input
                    disabled={editingDisabled}
                    label="Nombre del artículo *" value={item.productName} maxLength={NAME_LIMIT}
                    onChange={(e) => patch(item.id, { productName: e.target.value })} error={errors[item.id]?.productName}
                  />
                  <Select
                    disabled={editingDisabled}
                    label="Motivo *" value={item.reason} error={errors[item.id]?.reason}
                    onChange={(e) => patch(item.id, { reason: e.target.value as ReasonCode | '' })}
                    options={[{ value: '', label: 'Seleccionar motivo' }, ...REASONS.map((r) => ({ value: r.code, label: r.label }))]}
                  />
                </div>
                <div>
                  <label htmlFor={`desc-${item.id}`} className="block text-sm font-medium text-slate-700 mb-1.5">
                    Descripción breve{item.reason === 'otro' ? ' *' : ''}
                  </label>
                  <textarea
                    disabled={editingDisabled}
                    id={`desc-${item.id}`} rows={3} maxLength={DESCRIPTION_LIMIT} value={item.description}
                    onChange={(e) => patch(item.id, { description: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  {errors[item.id]?.description && <p className="mt-1 text-sm text-red-600">{errors[item.id]?.description}</p>}
                </div>
                <div>
                  <p className="block text-sm font-medium text-slate-700 mb-1.5">
                    Fotos y videos del producto (hasta {MAX_FILES_PER_ITEM})
                  </p>
                  <label className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                    <i className="ri-upload-2-line"></i>
                    <span>Agregar archivos</span>
                    <input
                      type="file" multiple accept={ACCEPT_ATTR} className="sr-only" disabled={editingDisabled}
                      aria-label={`Archivos del artículo ${index + 1}`} onChange={(e) => addFiles(item, e)}
                    />
                  </label>
                  <p className="mt-1 text-xs text-slate-400">Fotos JPG/PNG hasta 5 MB · videos MP4/MOV hasta 50 MB.</p>
                  {fileErrors[item.id] && <p className="mt-1 text-sm text-red-600">{fileErrors[item.id]}</p>}
                  {item.files.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {item.files.map(({ id, file }) => (
                        <li key={id} className="flex items-center gap-2 text-sm text-slate-600">
                          <i className={isVideo(file.type) ? 'ri-movie-line' : 'ri-image-line'}></i>
                          <span className="truncate">{file.name}</span>
                          <span className="text-xs text-slate-400">{formatSize(file.size)}</span>
                          <button
                            type="button" className="ml-auto text-slate-400 hover:text-red-600 cursor-pointer" disabled={editingDisabled}
                            aria-label={`Quitar ${file.name}`} onClick={() => removeFile(item, id)}
                          >
                            <i className="ri-close-line"></i>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            ))}
            <div className="flex flex-wrap gap-3 justify-between">
              <Button
                type="button" variant="secondary" disabled={editingDisabled || items.length >= MAX_ITEMS}
                onClick={() => setItems((prev) => [...prev, newDraftItem(nextId())])}
              >
                <i className="ri-add-line"></i> Agregar otro artículo
              </Button>
              <Button type="submit" disabled={sending||!assignment}>
                <i className={sending ? 'ri-loader-4-line animate-spin' : 'ri-send-plane-line'}></i>
                <span>{sending ? 'Enviando...' : 'Enviar solicitud'}</span>
              </Button>
            </div>
          </form>
        )}
      </div>
      {selectedRequest&&canRead&&<RequestDetail key={selectedRequest} requestId={selectedRequest} onClose={()=>setSelectedRequest(null)}/>}
    </div>
  );
}
