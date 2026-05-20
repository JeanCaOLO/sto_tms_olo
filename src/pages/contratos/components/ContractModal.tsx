import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Button from '@/components/base/Button';
import Input from '@/components/base/Input';
import Select from '@/components/base/Select';
import type { Contract } from '../page';

interface Props {
  contract: Contract | null;
  organizationId: string;
  onClose: () => void;
}

export default function ContractModal({ contract, organizationId, onClose }: Props) {
  const isEdit = !!contract;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'general' | 'terms' | 'firma'>('general');

  const [form, setForm] = useState({
    contract_number: '',
    title: '',
    contract_type: 'service',
    status: 'draft',
    entity_type: '',
    entity_name: '',
    start_date: '',
    end_date: '',
    value: '',
    currency: 'USD',
    description: '',
    terms: '',
    auto_renew: false,
    renewal_period_months: '12',
    alert_days_before: '30',
    signed_by: '',
    signed_date: '',
  });

  useEffect(() => {
    if (contract) {
      setForm({
        contract_number: contract.contract_number,
        title: contract.title,
        contract_type: contract.contract_type,
        status: contract.status,
        entity_type: contract.entity_type || '',
        entity_name: contract.entity_name || '',
        start_date: contract.start_date || '',
        end_date: contract.end_date || '',
        value: contract.value != null ? String(contract.value) : '',
        currency: contract.currency || 'USD',
        description: contract.description || '',
        terms: contract.terms || '',
        auto_renew: contract.auto_renew,
        renewal_period_months: String(contract.renewal_period_months),
        alert_days_before: String(contract.alert_days_before),
        signed_by: contract.signed_by || '',
        signed_date: contract.signed_date || '',
      });
    } else {
      const now = new Date().toISOString().split('T')[0];
      setForm((prev) => ({
        ...prev,
        start_date: now,
        contract_number: `CNT-${Date.now().toString().slice(-8)}`,
      }));
    }
  }, [contract]);

  const set = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!form.contract_number.trim() || !form.title.trim() || !form.start_date) {
      setError('Número de contrato, título y fecha de inicio son obligatorios.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        organization_id: organizationId,
        contract_number: form.contract_number.trim(),
        title: form.title.trim(),
        contract_type: form.contract_type,
        status: form.status,
        entity_type: form.entity_type || null,
        entity_name: form.entity_name.trim() || null,
        start_date: form.start_date,
        end_date: form.end_date || null,
        value: form.value !== '' ? parseFloat(form.value) : null,
        currency: form.currency,
        description: form.description.trim() || null,
        terms: form.terms.trim() || null,
        auto_renew: form.auto_renew,
        renewal_period_months: parseInt(form.renewal_period_months),
        alert_days_before: parseInt(form.alert_days_before),
        signed_by: form.signed_by.trim() || null,
        signed_date: form.signed_date || null,
        updated_at: new Date().toISOString(),
      };

      if (isEdit) {
        const { error: err } = await supabase.from('contracts').update(payload).eq('id', contract.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('contracts').insert(payload);
        if (err) throw err;
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'general' as const, label: 'General', icon: 'ri-file-text-line' },
    { id: 'terms' as const, label: 'Condiciones', icon: 'ri-article-line' },
    { id: 'firma' as const, label: 'Firma y Renovación', icon: 'ri-pen-nib-line' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center bg-teal-50 rounded-lg">
              <i className="ri-file-paper-2-line text-teal-600"></i>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {isEdit ? 'Editar Contrato' : 'Nuevo Contrato'}
              </h2>
              <p className="text-xs text-slate-500">{isEdit ? contract.contract_number : 'Complete los datos del contrato'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <i className="ri-close-line text-lg text-slate-600"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-3 flex gap-1 border-b border-slate-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <i className={`${tab.icon} text-base`}></i>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <i className="ri-error-warning-line text-base"></i>
              {error}
            </div>
          )}

          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">N° Contrato *</label>
                  <Input
                    value={form.contract_number}
                    onChange={(e) => set('contract_number', e.target.value)}
                    placeholder="CNT-20240001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
                  <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
                    <option value="draft">Borrador</option>
                    <option value="active">Activo</option>
                    <option value="suspended">Suspendido</option>
                    <option value="expired">Vencido</option>
                    <option value="terminated">Terminado</option>
                  </Select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Título *</label>
                <Input
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="Ej: Contrato de servicio de transporte 2024"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Contrato</label>
                  <Select value={form.contract_type} onChange={(e) => set('contract_type', e.target.value)}>
                    <option value="service">Servicio</option>
                    <option value="transport">Transporte</option>
                    <option value="carrier">Transportista</option>
                    <option value="driver">Conductor</option>
                    <option value="vehicle">Vehículo</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Entidad</label>
                  <Select value={form.entity_type} onChange={(e) => set('entity_type', e.target.value)}>
                    <option value="">Sin entidad específica</option>
                    <option value="carrier">Transportista</option>
                    <option value="driver">Conductor</option>
                    <option value="vehicle">Vehículo</option>
                    <option value="customer">Cliente</option>
                  </Select>
                </div>
              </div>

              {form.entity_type && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la Entidad</label>
                  <Input
                    value={form.entity_name}
                    onChange={(e) => set('entity_name', e.target.value)}
                    placeholder="Nombre del transportista, conductor, etc."
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Inicio *</label>
                  <Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Fin</label>
                  <Input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Valor del Contrato</label>
                  <Input
                    type="number"
                    value={form.value}
                    onChange={(e) => set('value', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
                  <Select value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="CRC">CRC</option>
                    <option value="MXN">MXN</option>
                    <option value="CLP">CLP</option>
                    <option value="COP">COP</option>
                    <option value="PEN">PEN</option>
                  </Select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                <textarea
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  rows={3}
                  placeholder="Breve descripción del objeto del contrato..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-none"
                />
              </div>
            </div>
          )}

          {activeTab === 'terms' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Términos y Condiciones</label>
                <textarea
                  value={form.terms}
                  onChange={(e) => set('terms', e.target.value)}
                  rows={14}
                  placeholder="Ingresa los términos y condiciones del contrato, cláusulas especiales, penalidades, etc."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-none font-mono"
                />
              </div>
            </div>
          )}

          {activeTab === 'firma' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <i className="ri-pen-nib-line text-teal-600"></i>
                  Datos de Firma
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Firmado por</label>
                    <Input
                      value={form.signed_by}
                      onChange={(e) => set('signed_by', e.target.value)}
                      placeholder="Nombre del firmante"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Firma</label>
                    <Input
                      type="date"
                      value={form.signed_date}
                      onChange={(e) => set('signed_date', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <i className="ri-refresh-line text-teal-600"></i>
                  Renovación Automática
                </h4>
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={() => set('auto_renew', !form.auto_renew)}
                    className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                      form.auto_renew ? 'bg-teal-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        form.auto_renew ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                  <span className="text-sm text-slate-700">
                    {form.auto_renew ? 'Renovación automática activada' : 'Sin renovación automática'}
                  </span>
                </div>
                {form.auto_renew && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Período de renovación (meses)
                    </label>
                    <Input
                      type="number"
                      value={form.renewal_period_months}
                      onChange={(e) => set('renewal_period_months', e.target.value)}
                      placeholder="12"
                    />
                  </div>
                )}
              </div>

              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <h4 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                  <i className="ri-alarm-warning-line text-amber-600"></i>
                  Alerta de Vencimiento
                </h4>
                <div>
                  <label className="block text-sm font-medium text-amber-700 mb-1">
                    Alertar con cuántos días de anticipación
                  </label>
                  <Input
                    type="number"
                    value={form.alert_days_before}
                    onChange={(e) => set('alert_days_before', e.target.value)}
                    placeholder="30"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <>
                <i className="ri-loader-4-line animate-spin mr-2"></i>
                Guardando...
              </>
            ) : (
              <>
                <i className="ri-save-line mr-2"></i>
                {isEdit ? 'Actualizar' : 'Crear Contrato'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}