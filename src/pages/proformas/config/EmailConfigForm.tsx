// Correo de la proforma al transportista: destinatarios, plantilla y forma de envío, por país.

import { useEffect, useState } from 'react';
import Button from '../../../components/base/Button';
import Card from '../../../components/base/Card';
import { getEmailConfig, saveEmailConfig, type EmailConfig } from '../../../lib/tarifas/proformas';
import GoogleConnection from './GoogleConnection';

const FIELD = 'mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
const splitEmails = (text: string) => text.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);

export default function EmailConfigForm({ countryId }: { countryId: string }) {
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [recipients, setRecipients] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getEmailConfig(countryId)
      .then((c) => { setConfig(c); setRecipients(c.recipients.join('\n')); })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar el correo.'));
  }, [countryId]);

  if (!config) return <Card>{error ? <p className="text-sm text-red-700">{error}</p> : <i className="ri-loader-4-line animate-spin" />}</Card>;
  const patch = (change: Partial<EmailConfig>) => setConfig({ ...config, ...change });

  async function save() {
    if (!config) return;
    setSaving(true); setError(null); setNotice(null);
    const result = await saveEmailConfig({ ...config, recipients: splitEmails(recipients) });
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    setNotice('Configuración de correo guardada.');
    setConfig(await getEmailConfig(countryId));
  }

  return (
    <Card>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Correo al transportista</h2>
          <p className="text-sm text-slate-500">
            Cuando una proforma queda aprobada se envía al transportista para que la confirme. Puedes usar
            {' {number}'}, {'{carrier}'} y {'{total}'} en el asunto y el mensaje.
          </p>
        </div>
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

        <label className="block text-sm font-medium text-slate-700">
          Destinatarios fijos (uno por línea o separados por coma)
          <textarea className={FIELD} rows={3} value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="contabilidad@empresa.com" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={config.includeCarrierEmail} onChange={(e) => patch({ includeCarrierEmail: e.target.checked })} />
          Incluir también el correo del transportista (el del catálogo)
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Asunto
          <input className={FIELD} value={config.subjectTemplate} onChange={(e) => patch({ subjectTemplate: e.target.value })} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Mensaje
          <textarea className={FIELD} rows={6} value={config.bodyTemplate} onChange={(e) => patch({ bodyTemplate: e.target.value })} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Forma de envío
          <select className={FIELD} value={config.mode} onChange={(e) => patch({ mode: e.target.value as EmailConfig['mode'] })}>
            <option value="manual">Manual: abre Gmail con el correo armado y lo envías tú</option>
            <option value="direct">Directo: un botón envía desde la cuenta de Google conectada</option>
          </select>
        </label>
        {config.mode === 'direct' && <GoogleConnection />}
        <div className="flex justify-end">
          <Button disabled={saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar correo'}</Button>
        </div>
      </div>
    </Card>
  );
}
