import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';

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
    status: 'active'
  });
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadCountries();
      if (carrier) {
        setFormData(carrier);
      } else {
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

      const carrierData = {
        ...formData,
        organization_id: userData?.organization_id,
        updated_at: new Date().toISOString()
      };

      if (carrier?.id) {
        const { error: updateError } = await supabase
          .from('carriers')
          .update(carrierData)
          .eq('id', carrier.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('carriers')
          .insert([{ ...carrierData, created_at: new Date().toISOString() }]);

        if (insertError) throw insertError;
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
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
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

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
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

          <div className="flex gap-3 pt-4 border-t">
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