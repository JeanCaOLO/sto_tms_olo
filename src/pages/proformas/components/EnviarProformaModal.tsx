// Enviar la proforma al transportista. Nada se envía solo: el usuario revisa y edita destinatarios,
// asunto y mensaje antes. "Abrir en Gmail" (auxiliar, siempre disponible): arma el correo y lo envía la persona.
// "Enviar ahora" (modo directo): sale por Gmail desde la cuenta de Google conectada, con un solo botón.

import { useState } from 'react';
import Modal from '../../../components/base/Modal';
import Button from '../../../components/base/Button';
import type { GoogleStatus, ProformaDetail } from '../../../lib/tarifas/proformas';
import GoogleConnection from '../config/GoogleConnection';
import { useEnviarProforma } from '../hooks/useEnviarProforma';

const FIELD = 'mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';

interface Props {
  detail: ProformaDetail;
  onClose: () => void;
  onSent: () => void;
}

export default function EnviarProformaModal({ detail, onClose, onSent }: Props) {
  const m = useEnviarProforma(detail, onSent);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const noEmail = m.config?.includeCarrierEmail && !m.carrierEmail;
  const direct = m.config?.mode === 'direct';
  const ready = !m.busy && m.recipients.length > 0 && !!m.subject.trim();

  return (
    <Modal isOpen title="Enviar proforma por correo" onClose={onClose} widthClass="max-w-2xl" zClass="z-[60]" closeOnBackdrop={false}>
      <div className="space-y-4 p-6">
        <h2 className="text-xl font-semibold text-slate-800">Enviar {detail.proforma.number} por correo</h2>
        {m.error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{m.error}</div>}
        {noEmail && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {detail.proforma.carrierName} no tiene correo en el catálogo de transportistas: agrégalo abajo o cárgalo allí.
          </div>
        )}

        <label className="block text-sm font-medium text-slate-700">
          Para (separa varios con coma)
          <input className={FIELD} value={m.to} onChange={(e) => m.setTo(e.target.value)} />
          {m.carrierEmail && (
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Correo de {detail.proforma.carrierName} en el catálogo de transportistas: {m.carrierEmail}
            </span>
          )}
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Asunto
          <input className={FIELD} value={m.subject} onChange={(e) => m.setSubject(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Mensaje
          <textarea className={FIELD} rows={7} value={m.body} onChange={(e) => m.setBody(e.target.value)} />
        </label>

        {m.config?.mode === 'direct' && m.step === 'edit' && <GoogleConnection onStatus={setGoogle} />}

        {m.step === 'opened' ? (
          <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
            {m.via === 'eml' ? (
              <p>
                Se descargó <strong>Proforma-{detail.proforma.number}.eml</strong>. Ábrelo (doble clic): se abre en tu programa de
                correo (Outlook, Mail) con destinatarios, asunto, mensaje y el <strong>PDF ya adjunto</strong>. Revisa y envía.
              </p>
            ) : (
              <p>Se abrió Gmail y se descargó <strong>{m.fileName}</strong>. Gmail no permite adjuntar por enlace: adjunta el PDF, revisa y envía.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>Aún no lo envié</Button>
              <Button variant="success" disabled={m.busy} onClick={() => void m.confirmSent()}>Ya lo envié</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <Button variant="secondary" disabled={m.busy} icon={<i className="ri-download-line" />} onClick={() => void m.downloadPdf()}>
              Descargar PDF
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button
                variant="secondary" disabled={!ready} icon={<i className="ri-attachment-2" />}
                title="Descarga un borrador (.eml) con el PDF ya adjunto; se abre en Outlook/Mail"
                onClick={() => void m.downloadEml()}
              >
                Borrador con PDF adjunto
              </Button>
              <Button
                variant={direct ? 'secondary' : 'primary'} disabled={!ready} icon={<i className="ri-mail-send-line" />}
                title="Abre Gmail con el correo armado; el PDF se descarga aparte y lo adjuntas tú (Gmail no admite adjuntos por enlace)"
                onClick={() => void m.openInGmail()}
              >
                {m.busy ? 'Preparando…' : 'Abrir en Gmail'}
              </Button>
              {m.config?.mode === 'direct' && (
                <Button disabled={!ready || !google?.connected} icon={<i className="ri-send-plane-fill" />}
                  title={google?.connected ? undefined : 'Conecta tu cuenta de Google para enviar directo'}
                  onClick={() => void m.sendDirect()}>
                  {m.busy ? 'Enviando…' : 'Enviar ahora'}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
