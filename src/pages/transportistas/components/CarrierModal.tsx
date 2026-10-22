import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import { BASE_METHODS, BASE_METHOD_ORDER } from '../../../lib/tarifas/baseMethods';
import type { BaseMethodId } from '../../../lib/tarifas/types';
import {
  uploadCarrierContract, openCarrierContract, removeCarrierContract, validateContractFile,
} from '../carrier-contract';

interface Carrier {
  id?: string;
  code: string;
  name: string;
  tax_id: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  country_id: string;
  status: string;
  payment_account: string;
  softland_code: string;
  contract_expiry?: string;
  // Cómo se le paga/liquida a este transportista (tipo de tarifa del contrato).
  // El cálculo de liquidación lo hereda de aquí; ya no se elige en Liquidaciones.
  rate_type?: BaseMethodId | '';
  // Monto de la tarifa FIJA de este transportista (solo aplica si rate_type='FIXED').
  // Cambia por transportista; lo usa el cálculo como base cuando es tarifa fija.
  flat_rate_amount?: number | string | null;
  // Llave del PDF del contrato en S3 (sql/35). No nulo = tiene contrato cargado.
  contract_file_key?: string | null;
}

interface Country {
  id: string;
  name: string;
  code: string;
}

interface CarrierModalProps {
  isOpen: boolean;
  onClose: () => void;
  carrier: Carrier | null;
  onSave: () => void;
}

export default function CarrierModal({ isOpen, onClose, carrier, onSave }: CarrierModalProps) {
  const [formData, setFormData] = useState<Carrier>({
    code: '',
    name: '',
    tax_id: '',
    contact_name: '',
    email: '',
    phone: '',
    address: '',
    country_id: '',
    status: 'active',
    payment_account: '',
    softland_code: '',
    contract_expiry: '',
    rate_type: '',
    flat_rate_amount: ''
  });
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // PDF del contrato: el archivo recién elegido (se sube al guardar) y si el
  // carrier ya tiene uno cargado (contract_file_key).
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [hasContract, setHasContract] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCountries();
      setContractFile(null);
      if (carrier) {
        setFormData({ ...carrier, contract_expiry: carrier.contract_expiry ?? '', rate_type: carrier.rate_type ?? '', flat_rate_amount: carrier.flat_rate_amount ?? '' });
        setHasContract(!!carrier.contract_file_key);
      } else {
        setHasContract(false);
        generateCode();
      }
    }
  }, [isOpen, carrier]);

  const loadCountries = async () => {
    const { data } = await supabase
      .from('countries')
      .select('id, name, code')
      .eq('status', 'active')
      .order('name');
    
    if (data) setCountries(data);
  };

  const generateCode = async () => {
    const { count } = await supabase
      .from('carriers')
      .select('*', { count: 'exact', head: true });
    
    const newCode = `CAR-${String((count || 0) + 1).padStart(3, '0')}`;
    setFormData(prev => ({ ...prev, code: newCode }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      const { data: userData } = await supabase
        .from('app_users')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      // Solo las columnas que edita este formulario. `formData` arrastra lo que trae el listado (la
      // relación `countries`, `driver_count`…), que NO son columnas y la API rechaza; y `contract_file_key`
      // lo escribe solo el endpoint del contrato (si viajara, "Quitar" el PDF y guardar reescribiría la llave vieja).
      const { code, name, tax_id, contact_name, email, phone, address, country_id, status, payment_account, softland_code } = formData;
      const carrierData = {
        code, name, tax_id, contact_name, email, phone, address, country_id, status, payment_account, softland_code,
        contract_expiry: formData.contract_expiry || null,
        rate_type: formData.rate_type || null,
        // Solo tiene sentido el monto cuando la forma de pago es tarifa fija.
        flat_rate_amount: formData.rate_type === 'FIXED' && formData.flat_rate_amount !== ''
          ? Number(formData.flat_rate_amount)
          : null,
        organization_id: userData?.organization_id,
        updated_at: new Date().toISOString()
      };

      let carrierId = carrier?.id ?? null;
      if (carrier?.id) {
        const { error: updateError } = await supabase
          .from('carriers')
          .update(carrierData)
          .eq('id', carrier.id);

        if (updateError) throw updateError;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('carriers')
          .insert([{ ...carrierData, created_at: new Date().toISOString() }])
          .select('id')
          .single();

        if (insertError) throw insertError;
        carrierId = (inserted as { id?: string })?.id ?? null;
      }

      // Subida del PDF del contrato (va DESPUÉS de guardar: necesita el id del
      // carrier). Si falla, el transportista ya quedó guardado: se avisa pero no
      // se revierte (reintentable editando).
      if (contractFile && carrierId) {
        const up = await uploadCarrierContract(carrierId, contractFile);
        if (!up.ok) {
          setError(`El transportista se guardó, pero el contrato no se pudo subir: ${up.error}`);
          setLoading(false);
          onSave();
          return;
        }
      }

      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="shrink-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {carrier ? 'Editar Transportista' : 'Nuevo Transportista'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Código"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              required
              disabled
            />

            <Input
              label="Nombre de la Empresa"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />

            <Input
              label="RUT/Tax ID"
              value={formData.tax_id}
              onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
              placeholder="76.123.456-7"
              required
            />

            <Input
              label="Nombre de Contacto"
              value={formData.contact_name}
              onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
              required
            />

            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="contacto@transportista.com"
              required
            />

            <Input
              label="Teléfono"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+56 9 1234 5678"
              required
            />

            <Select
              label="País"
              value={formData.country_id}
              onChange={(e) => setFormData({ ...formData, country_id: e.target.value })}
              required
              options={[
                { value: '', label: 'Seleccionar país' },
                ...countries.map(country => ({
                  value: country.id,
                  label: country.name
                }))
              ]}
            />

            <Select
              label="Estado"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              required
              options={[
                { value: 'active', label: 'Activo' },
                { value: 'inactive', label: 'Inactivo' },
              ]}
            />

            <Input
              label="Cuenta para pagar"
              value={formData.payment_account}
              onChange={(e) => setFormData({ ...formData, payment_account: e.target.value })}
              placeholder="Cuenta bancaria/contable"
            />

            <Input
              label="Código Softland"
              value={formData.softland_code}
              onChange={(e) => setFormData({ ...formData, softland_code: e.target.value })}
              placeholder="Código del transportista en Softland"
            />

            <Input
              label="Vencimiento del contrato"
              type="date"
              value={formData.contract_expiry ?? ''}
              onChange={(e) => setFormData({ ...formData, contract_expiry: e.target.value })}
            />

            <Select
              label="Forma de pago / liquidación"
              value={formData.rate_type ?? ''}
              onChange={(e) => setFormData({ ...formData, rate_type: e.target.value as BaseMethodId | '' })}
              options={[
                { value: '', label: 'Seleccionar forma de pago' },
                ...BASE_METHOD_ORDER.map((id) => ({ value: id, label: BASE_METHODS[id].label })),
              ]}
            />

            {formData.rate_type === 'FIXED' && (
              <Input
                label="Monto de la tarifa fija"
                type="number"
                step="0.01"
                min="0"
                value={formData.flat_rate_amount ?? ''}
                onChange={(e) => setFormData({ ...formData, flat_rate_amount: e.target.value })}
                placeholder="Monto por viaje para este transportista"
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Dirección
            </label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              placeholder="Dirección completa del transportista..."
              required
            />
          </div>

          <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 text-slate-500 text-xs rounded-lg px-4 py-2.5">
            <i className="ri-information-line text-slate-400 mt-0.5"></i>
            <span>
              La <strong>forma de pago</strong> define cómo se liquida a este transportista: la liquidación la toma de aquí
              (ya no se elige por viaje). La <strong>fecha de vencimiento</strong> del contrato activa las alertas de renovación.
            </span>
          </div>

          {/* PDF del contrato */}
          <div className="border border-slate-200 rounded-lg px-4 py-3 space-y-2">
            <label className="block text-sm font-medium text-gray-700">Contrato (PDF)</label>
            {hasContract && !contractFile && (
              <div className="flex items-center gap-3 text-sm">
                <span className="inline-flex items-center gap-1.5 text-emerald-700">
                  <i className="ri-file-text-line"></i> Contrato cargado
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    if (!carrier?.id) return;
                    const err = await openCarrierContract(carrier.id);
                    if (err) setError(err);
                  }}
                  className="text-teal-700 hover:underline cursor-pointer"
                >
                  Ver
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!carrier?.id) return;
                    const res = await removeCarrierContract(carrier.id);
                    if (res.ok) setHasContract(false); else setError(res.error ?? 'No se pudo quitar el contrato.');
                  }}
                  className="text-red-600 hover:underline cursor-pointer"
                >
                  Quitar
                </button>
              </div>
            )}
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f) {
                  const invalid = validateContractFile(f);
                  if (invalid) { setError(invalid); e.target.value = ''; return; }
                  setError('');
                }
                setContractFile(f);
              }}
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-teal-50 file:text-teal-700 file:text-sm file:cursor-pointer hover:file:bg-teal-100"
            />
            <p className="text-xs text-slate-400">
              {contractFile
                ? `Se subirá "${contractFile.name}" al guardar.`
                : hasContract
                  ? 'Elegí un PDF para reemplazar el contrato actual. Máx. 10 MB.'
                  : 'PDF, máx. 10 MB. Se sube al guardar el transportista.'}
            </p>
          </div>

          </div>

          <div className="shrink-0 flex gap-3 px-6 py-4 border-t bg-white">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1"
            >
              {loading ? 'Guardando...' : carrier ? 'Actualizar' : 'Crear Transportista'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}