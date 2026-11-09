// Mis devoluciones (rol Cliente): el cliente solicita por sí mismo la devolución de mercadería — código del artículo,
// cantidad, motivo, descripción breve y fotos/videos. Al enviar solo se confirma que la solicitud se está procesando:
// quién la atiende después NO está definido (.test/devoluciones/pendientes-solicitudes-cliente.md).
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Button from '../../components/base/Button';
import Card from '../../components/base/Card';
import Input from '../../components/base/Input';
import Select from '../../components/base/Select';
import TabBar from '../../components/base/TabBar';
import { tabPanelProps } from '../../components/base/tabPanelProps';
import {
  ACCEPT_ATTR, CODE_LIMIT, DESCRIPTION_LIMIT, MAX_FILES_PER_ITEM, MAX_ITEMS, NAME_LIMIT, REASONS, fileProblem,
  isVideo, newDraftItem, toPayloadItem, validateAll, type DraftItem, type ItemErrors, type ReasonCode,
} from '../../lib/devoluciones/solicitudes';
import { createRequest, uploadFile, type CreatedRequest } from './api/solicitudesApi';
import MyRequests from './parts/MyRequests';

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

type View = 'nueva' | 'mias';

const VIEWS: { key: View; label: string }[] = [
  { key: 'nueva', label: 'Nueva solicitud' },
  { key: 'mias', label: 'Mis solicitudes' },
];

const tabClass = (active: boolean) =>
  `px-4 py-2 text-sm font-medium border-b-2 cursor-pointer ${active ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`;

export default function MisDevolucionesPage() {
  const [view, setView] = useState<View>('nueva');
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <TabBar<View> tabs={VIEWS} value={view} onChange={setView} ariaLabel="Mis devoluciones" idBase="mis-devoluciones"
        tabClassName={tabClass} className="flex gap-1 border-b border-slate-200" />
      {/* El formulario sigue montado al cambiar de pestaña para no perder lo que se está escribiendo. */}
      <div {...tabPanelProps('mis-devoluciones', view)}>
        <div hidden={view !== 'nueva'}><NuevaSolicitud onViewMine={() => setView('mias')} /></div>
        {view === 'mias' && <MyRequests />}
      </div>
    </div>
  );
}

function NuevaSolicitud({ onViewMine }: { onViewMine: () => void }) {
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
    uploaded.current.clear();
    setItems([newDraftItem(nextId())]);
    setErrors({});
    setFileErrors({});
    setFormError('');
    setDone(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const check = validateAll(items);
    setErrors(check.errors);
    setFormError(check.message);
    if (!check.ok) return;
    setSending(true);
    try {
      const payload = [];
      for (const item of items) {
        const keys = [];
        for (const draft of item.files) {
          let key = uploaded.current.get(draft.id);
          if (!key) {
            key = (await uploadFile(draft.file)).key;
            uploaded.current.set(draft.id, key);
          }
          keys.push({ key });
        }
        payload.push(toPayloadItem(item, keys));
      }
      setDone(await createRequest(payload));
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-xl mx-auto">
        <Card className="text-center space-y-4">
          <div className="w-14 h-14 mx-auto flex items-center justify-center rounded-full bg-teal-50">
            <i className="ri-checkbox-circle-line text-3xl text-teal-600"></i>
          </div>
          <h1 className="text-xl font-semibold text-slate-800">Se está procesando su solicitud</h1>
          <p className="text-sm text-slate-600">
            Recibimos su solicitud de devolución <span className="font-semibold">{done.request_number}</span>.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={reset}>Nueva solicitud</Button>
            <Button variant="secondary" onClick={() => { reset(); onViewMine(); }}>Ver mis solicitudes</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Solicitar una devolución</h1>
        <p className="text-sm text-slate-500">Indique los artículos que desea devolver y el motivo.</p>
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && (
          <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
            <i className="ri-error-warning-line text-lg"></i>
            <span>{formError}</span>
          </div>
        )}
        {items.map((item, index) => (
          <Card key={item.id} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Artículo {index + 1}</h2>
              {items.length > 1 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(item.id)} disabled={sending}>
                  <i className="ri-delete-bin-line"></i> Quitar
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Código del artículo *" value={item.productCode} maxLength={CODE_LIMIT}
                onChange={(e) => patch(item.id, { productCode: e.target.value })} error={errors[item.id]?.productCode}
              />
              <Input
                label="Cantidad a devolver *" inputMode="numeric" value={item.quantity}
                onChange={(e) => patch(item.id, { quantity: e.target.value })} error={errors[item.id]?.quantity}
              />
              <Input
                label="Nombre del artículo (opcional)" value={item.productName} maxLength={NAME_LIMIT}
                onChange={(e) => patch(item.id, { productName: e.target.value })}
              />
              <Select
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
                  type="file" multiple accept={ACCEPT_ATTR} className="sr-only" disabled={sending}
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
                        type="button" className="ml-auto text-slate-400 hover:text-red-600 cursor-pointer" disabled={sending}
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
            type="button" variant="secondary" disabled={sending || items.length >= MAX_ITEMS}
            onClick={() => setItems((prev) => [...prev, newDraftItem(nextId())])}
          >
            <i className="ri-add-line"></i> Agregar otro artículo
          </Button>
          <Button type="submit" disabled={sending}>
            <i className={sending ? 'ri-loader-4-line animate-spin' : 'ri-send-plane-line'}></i>
            <span>{sending ? 'Enviando...' : 'Enviar solicitud'}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
