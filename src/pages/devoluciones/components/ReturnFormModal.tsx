// Formulario de devolución del viaje (un formulario por viaje, una sección por parada). Se prellena con lo que ya
// sabe el tracking; lo demás lo captura quien recibe. Se guarda con número DEV-AAAA-MM-#### y se puede imprimir.
import { useState } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Modal from '../../../components/base/Modal';
import Select from '../../../components/base/Select';
import { formDocumentHtml, printFormDocument } from '../../../lib/devoluciones/formDocument';
import { KIND_LABELS, draftFromDetail, groupBySection, reasonsOf, returnTypeLabel, toFormPayload } from '../../../lib/devoluciones/trips';
import type { FormDraft, FormView, ReturnKind, SectionDraft } from '../../../lib/devoluciones/types';
import { createForm, updateForm } from '../api/devolucionesApi';

interface Props {
  /** Formulario a mostrar: con `form` null es uno NUEVO que lleva solo las devoluciones de `returns`. */
  detail: FormView;
  canEdit: boolean;
  canPrint: boolean;
  onClose: () => void;
  onSaved: (detail: FormView) => void;
}

const KIND_OPTIONS = (Object.keys(KIND_LABELS) as ReturnKind[]).map((k) => ({ value: k, label: KIND_LABELS[k] }));

export default function ReturnFormModal({ detail, canEdit, canPrint, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<FormDraft>(() => draftFromDetail(detail));
  const [current, setCurrent] = useState(detail);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const groups = groupBySection(current.returns, current.sections);

  const set = <K extends keyof FormDraft>(key: K, value: FormDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setSection = (guideId: string, key: keyof SectionDraft, value: string) =>
    setDraft((d) => ({ ...d, sections: d.sections.map((s) => (s.dispatch_guide_id === guideId ? { ...s, [key]: value } : s)) }));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = toFormPayload(draft);
      const saved = current.form
        ? await updateForm(current.form.id, payload)
        : await createForm(current.trip.route_id, current.returns.map((l) => l.id), payload);
      setCurrent(saved);
      setDraft(draftFromDetail(saved));
      onSaved(saved);
      setMessage({ kind: 'ok', text: `Formulario ${saved.form?.form_number ?? ''} guardado.` });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo guardar el formulario.' });
    } finally {
      setSaving(false);
    }
  };

  const print = () => {
    const ok = printFormDocument(formDocumentHtml(current, toFormPayload(draft), current.form?.form_number ?? null));
    if (!ok) setMessage({ kind: 'error', text: 'El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes e inténtalo de nuevo.' });
  };

  return (
    <Modal isOpen onClose={onClose} title="Formulario de devolución" widthClass="max-w-4xl" closeOnBackdrop={false}>
      <div className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Formulario de devolución</h3>
            <p className="text-sm text-slate-600">
              Viaje {current.trip.route_number} · {current.form ? current.form.form_number : 'sin guardar (el número se asigna al guardar)'}
              {' · '}{current.returns.length} devolución(es)
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Cerrar"><i className="ri-close-line" aria-hidden="true" /></Button>
        </div>

        <fieldset disabled={!canEdit} className="space-y-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input label="Recibo físico N°" value={draft.physical_receipt_number} onChange={(e) => set('physical_receipt_number', e.target.value)} />
            <Select label="Tipo de operación" value={draft.return_kind} onChange={(e) => set('return_kind', e.target.value as ReturnKind)} options={KIND_OPTIONS} />
            <Input label="Sucursal" value={draft.branch} onChange={(e) => set('branch', e.target.value)} />
            <Input label="Mercadería para" value={draft.merchandise_for} onChange={(e) => set('merchandise_for', e.target.value)} />
            <Input label="Transporte" value={draft.transport} onChange={(e) => set('transport', e.target.value)} />
            <Input label="Guía" value={draft.guide_number} onChange={(e) => set('guide_number', e.target.value)} />
          </div>

          {groups.map(({ section, lines }) => {
            const value = draft.sections.find((s) => s.dispatch_guide_id === section.dispatch_guide_id);
            if (!value) return null;
            const field = (label: string, key: keyof SectionDraft) => (
              <Input label={label} value={value[key]} onChange={(e) => setSection(section.dispatch_guide_id, key, e.target.value)} />
            );
            return (
              <section key={section.dispatch_guide_id} className="space-y-3 rounded-lg border border-slate-200 p-4">
                <h4 className="text-sm font-semibold text-slate-800">
                  Parada {section.sequence_number ?? ''} · {value.customer_name || 'Cliente sin nombre'}
                </h4>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {field('Código cliente', 'customer_code')}
                  {field('Nombre del cliente', 'customer_name')}
                  {field('Teléfono', 'phone')}
                  {field('Factura', 'invoice_number')}
                  {field('Ruta', 'route_label')}
                  {field('Vendedor(es)', 'sellers')}
                </div>
                {field('Dirección', 'address')}
                <p className="text-xs text-slate-500">
                  Origen: {[...new Set(lines.map((l) => returnTypeLabel(l.return_type)))].join('; ') || '-'} · Motivo: {reasonsOf(lines) || '-'}
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-slate-500">
                      <th className="py-1 pr-2">Artículo</th><th className="py-1 pr-2">Descripción</th>
                      <th className="py-1 pr-2">Estado</th><th className="py-1 pr-2 text-right">Cantidad</th><th className="py-1 text-right">Recibido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id} className="border-t border-slate-100">
                        <td className="py-1 pr-2 font-mono text-xs">{line.product_code ?? ''}</td>
                        <td className="py-1 pr-2">{line.product_name ?? ''}</td>
                        <td className="py-1 pr-2">{line.received_condition ?? ''}</td>
                        <td className="py-1 pr-2 text-right">{line.quantity ?? ''}</td>
                        <td className="py-1 text-right">{line.received_quantity ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">Observaciones
              <textarea className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} value={draft.observations}
                onChange={(e) => set('observations', e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-700">Comentarios
              <textarea className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} value={draft.comments}
                onChange={(e) => set('comments', e.target.value)} />
            </label>
            <Input label="Recibido por" value={draft.received_by_name} onChange={(e) => set('received_by_name', e.target.value)} />
            <Input label="Fecha de recepción" type="date" value={draft.received_date} onChange={(e) => set('received_date', e.target.value)} />
          </div>
        </fieldset>

        {message && (
          <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${message.kind === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
            {message.text}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          {canPrint && <Button variant="secondary" onClick={print}><i className="ri-printer-line" aria-hidden="true" />Imprimir</Button>}
          {canEdit && <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar formulario'}</Button>}
        </div>
      </div>
    </Modal>
  );
}
