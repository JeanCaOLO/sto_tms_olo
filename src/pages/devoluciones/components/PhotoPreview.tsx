// Vista previa de la foto que el conductor tomó al registrar la devolución en la app de tracking: miniatura en la fila
// y visor ampliado al hacer clic. La URL viene firmada por el backend y vence (~1 h): si la imagen no carga, se ofrece
// recargar el viaje para obtener URLs nuevas en lugar de dejar un recuadro roto.
import { useState } from 'react';
import Button from '../../../components/base/Button';
import Modal from '../../../components/base/Modal';

interface Props {
  url: string;
  /** Texto accesible y título del visor, p. ej. "DV-123 · Lámina". */
  label: string;
  /** Pide al padre recargar el detalle del viaje (URLs firmadas nuevas). Sin esta prop no se ofrece reintentar. */
  onReload?: () => void;
}

export default function PhotoPreview({ url, label, onReload }: Props) {
  const [open, setOpen] = useState(false);
  // Se guarda la URL que falló, no un booleano: al llegar una URL nueva tras recargar, la miniatura se vuelve a intentar sola.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = failedUrl === url;

  if (failed) {
    return (
      <button type="button" onClick={onReload} disabled={!onReload}
        className="ml-2 inline-flex h-10 items-center gap-1 rounded border border-dashed border-slate-300 px-2 align-middle text-xs text-slate-500 enabled:cursor-pointer enabled:hover:bg-slate-50"
        title={onReload ? 'La foto venció o no está disponible. Clic para recargar.' : 'La foto no está disponible.'}>
        <i className="ri-image-2-line" aria-hidden="true" />
        {onReload ? 'Foto no disponible · recargar' : 'Foto no disponible'}
      </button>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Ver foto: ${label}`} title="Ver foto"
        className="ml-2 inline-block h-10 w-10 cursor-zoom-in overflow-hidden rounded border border-slate-200 bg-slate-50 align-middle hover:ring-2 hover:ring-teal-500">
        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setFailedUrl(url)} />
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={`Foto de la devolución: ${label}`} widthClass="max-w-3xl">
        <div className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-lg font-semibold text-slate-900">Foto de la devolución</h3>
            <Button variant="ghost" onClick={() => setOpen(false)} aria-label="Cerrar"><i className="ri-close-line" aria-hidden="true" /></Button>
          </div>
          <p className="text-sm text-slate-600">{label}</p>
          <div className="flex justify-center rounded-lg bg-slate-100">
            <img src={url} alt={`Foto de la devolución: ${label}`} className="max-h-[65vh] w-auto max-w-full object-contain"
              onError={() => { setFailedUrl(url); setOpen(false); }} />
          </div>
          <div className="flex justify-end">
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-teal-700 hover:underline">
              <i className="ri-external-link-line" aria-hidden="true" /> Abrir en otra pestaña
            </a>
          </div>
        </div>
      </Modal>
    </>
  );
}
