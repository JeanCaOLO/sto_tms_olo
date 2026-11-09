// Una solicitud de devolución del cliente (solo lectura): número, estado, artículos y las fotos y videos que el cliente
// subió. Las usan el rol Cliente (sus propias solicitudes) y el rol Devoluciones (las de todos los clientes).
import { useEffect, useState } from 'react';
import {
  countFiles, reasonLabel, requestDate, requestStatusLabel, type RequestFileView, type RequestView,
} from '../../lib/devoluciones/solicitudes';
import Badge from '../base/Badge';
import Card from '../base/Card';

interface Props {
  request: RequestView;
  /** Muestra la empresa y quien solicitó (vista interna). */
  showCustomer?: boolean;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function FileSummary({ request }: { request: RequestView }) {
  const { photos, videos } = countFiles(request);
  if (photos + videos === 0) return <span className="text-xs text-slate-400">Sin fotos ni videos</span>;
  return (
    <span className="text-xs text-slate-500">
      {[photos ? plural(photos, 'foto', 'fotos') : '', videos ? plural(videos, 'video', 'videos') : ''].filter(Boolean).join(' · ')}
    </span>
  );
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Foto ampliada"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4" onClick={onClose}>
      <button type="button" aria-label="Cerrar" onClick={onClose}
        className="absolute right-4 top-4 cursor-pointer rounded-full bg-white/90 p-2 text-slate-700 hover:bg-white">
        <i className="ri-close-line text-xl" aria-hidden="true" />
      </button>
      <img src={url} alt="Foto de la devolución" className="max-h-full max-w-full rounded-lg object-contain"
        onClick={(event) => event.stopPropagation()} />
    </div>
  );
}

function FileGallery({ files, label, onPreview }: { files: RequestFileView[]; label: string; onPreview: (url: string) => void }) {
  if (files.length === 0) return <p className="text-xs text-slate-400">Sin fotos ni videos.</p>;
  return (
    <ul className="flex flex-wrap gap-3">
      {files.map((file, index) => (
        <li key={`${file.url ?? 'sin-url'}-${index}`}>
          {!file.url ? (
            <div className="flex h-24 w-32 items-center justify-center rounded-lg border border-dashed border-slate-300 px-2 text-center text-xs text-slate-400">
              Archivo no disponible
            </div>
          ) : file.kind === 'video' ? (
            <video controls preload="metadata" src={file.url} aria-label={`Video ${index + 1} de ${label}`}
              className="h-24 w-40 rounded-lg bg-slate-900 object-contain" />
          ) : (
            <button type="button" onClick={() => onPreview(file.url as string)} aria-label={`Ampliar foto ${index + 1} de ${label}`}
              className="block h-24 w-32 cursor-pointer overflow-hidden rounded-lg border border-slate-200 hover:ring-2 hover:ring-teal-500">
              <img src={file.url} alt={`Foto ${index + 1} de ${label}`} loading="lazy" className="h-full w-full object-cover" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function SolicitudCard({ request, showCustomer = false }: Props) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const date = requestDate(request.created_at);

  return (
    <Card>
      <button type="button" className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 text-left"
        aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="flex items-center gap-3">
          <i className={`ri-arrow-${open ? 'down' : 'right'}-s-line text-xl text-slate-500`} aria-hidden="true" />
          <span>
            <span className="block font-medium text-slate-900">{request.request_number}</span>
            <span className="block text-xs text-slate-500">
              {[date, showCustomer ? request.customer_name : null, showCustomer ? request.requested_by_name : null]
                .filter(Boolean).join(' · ')}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="text-xs text-slate-500">{plural(request.items.length, 'artículo', 'artículos')}</span>
          <FileSummary request={request} />
          <Badge variant="warning">{requestStatusLabel(request.status)}</Badge>
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          {request.items.map((item) => {
            const label = `${item.product_code}`;
            return (
              <div key={item.id} className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm font-medium text-slate-800">
                    {item.product_code}{item.product_name ? ` · ${item.product_name}` : ''}
                  </div>
                  <div className="text-xs text-slate-500">
                    {item.quantity} {item.quantity === 1 ? 'unidad' : 'unidades'} · {reasonLabel(item.reason_code)}
                  </div>
                </div>
                {item.description && <p className="text-sm text-slate-600">{item.description}</p>}
                <FileGallery files={item.files} label={label} onPreview={setPreview} />
              </div>
            );
          })}
        </div>
      )}
      {preview && <Lightbox url={preview} onClose={() => setPreview(null)} />}
    </Card>
  );
}
