import { useEffect, useState } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import Badge from '../../../components/base/Badge';
import { supabase } from '../../../lib/supabase';
import { saveParty } from '../../../lib/tarifas/partiesDataSource';
import {
  CLASSIFICATION_LABELS,
  TAX_ID_TYPES,
  suggestCode,
  suggestedTaxIdType,
  type PartyClassification,
  type PartyErrors,
  type SettlementPartyInput,
  type SettlementPartyRow,
} from '../../../lib/tarifas/parties';

interface CountryOption {
  id: string;
  iso2: string;
  name: string;
  local_currency: string;
}

interface Props {
  isOpen: boolean;
  classification: PartyClassification;
  party: SettlementPartyRow | null;
  countries: CountryOption[];
  existing: SettlementPartyRow[];
  onClose: () => void;
  onSaved: (party: SettlementPartyRow, wasNew: boolean) => void;
}

function emptyForm(classification: PartyClassification): SettlementPartyInput {
  return {
    country_id: '',
    classification,
    code: '',
    name: '',
    tax_id: null,
    tax_id_type: null,
    carrier_id: null,
    contact_name: null,
    email: null,
    phone: null,
    address: null,
    status: 'active',
    notes: null,
  };
}

export default function CompaniaModal({
  isOpen, classification, party, countries, existing, onClose, onSaved,
}: Props) {
  const [form, setForm] = useState<SettlementPartyInput>(emptyForm(classification));
  const [fieldErrors, setFieldErrors] = useState<PartyErrors>({});
  const [generalError, setGeneralError] = useState('');
  const [saving, setSaving] = useState(false);

  // Transportistas del TMS, para enlazar el perfil con uno ya cargado allá. Es SOLO LECTURA: el
  // tarifador nunca escribe en esa tabla.
  const [tmsCarriers, setTmsCarriers] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [tmsError, setTmsError] = useState('');

  const isOutsourced = classification === 'OUTSOURCED';

  useEffect(() => {
    if (!isOpen) return;

    setFieldErrors({});
    setGeneralError('');

    if (party) {
      setForm({ ...party });
    } else {
      const firstCountry = countries[0];
      setForm({
        ...emptyForm(classification),
        country_id: firstCountry?.id ?? '',
        code: firstCountry ? suggestCode(classification, firstCountry.iso2, existing) : '',
        tax_id_type: firstCountry ? suggestedTaxIdType(firstCountry.iso2) : null,
      });
    }
  }, [isOpen, party, classification, countries, existing]);

  useEffect(() => {
    if (!isOpen || !isOutsourced) return;

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('carriers')
          .select('id, name, code')
          .eq('status', 'active')
          .order('name');
        if (cancelled) return;
        if (error) throw error;
        setTmsCarriers(data ?? []);
        setTmsError('');
      } catch {
        if (cancelled) return;
        // No es bloqueante: el enlace con el TMS es opcional y el perfil funciona sin él.
        setTmsCarriers([]);
        setTmsError('No se pudo leer el catálogo de transportistas del TMS. Podés guardar igual y enlazarlo después.');
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, isOutsourced]);

  if (!isOpen) return null;

  const set = <K extends keyof SettlementPartyInput>(key: K, value: SettlementPartyInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleCountryChange = (countryId: string) => {
    const country = countries.find((c) => c.id === countryId);
    setForm((prev) => ({
      ...prev,
      country_id: countryId,
      // Solo se re-sugiere en alta: en edición, cambiar el país no debe pisar un código ya en uso.
      code: party ? prev.code : country ? suggestCode(classification, country.iso2, existing) : prev.code,
      tax_id_type: country ? suggestedTaxIdType(country.iso2) : prev.tax_id_type,
    }));
    setFieldErrors((prev) => ({ ...prev, country_id: undefined, code: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setGeneralError('');

    const result = await saveParty(form, party?.id);

    setSaving(false);
    if (result.status === 'invalid') {
      setFieldErrors(result.fieldErrors);
      setGeneralError(result.error.message);
      return;
    }
    if (result.status === 'failed') {
      setFieldErrors({});
      setGeneralError(result.error.message);
      return;
    }
    onSaved(result.party, !party);
  };

  const selectedCountry = countries.find((c) => c.id === form.country_id);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-800">
              {party ? 'Editar compañía' : 'Nueva compañía'}
            </h2>
            <Badge variant={isOutsourced ? 'warning' : 'info'}>
              {CLASSIFICATION_LABELS[classification]}
            </Badge>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {generalError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {generalError}
            </div>
          )}

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Identificación</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="País *"
                value={form.country_id}
                onChange={(e) => handleCountryChange(e.target.value)}
                error={fieldErrors.country_id}
              >
                <option value="">Seleccionar país</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>

              <Input
                label="Código *"
                value={form.code}
                onChange={(e) => set('code', e.target.value)}
                error={fieldErrors.code}
                placeholder="TR-CR-001"
              />
            </div>

            {selectedCountry && (
              <p className="text-xs text-slate-500">
                <i className="ri-money-dollar-circle-line mr-1"></i>
                Las liquidaciones de esta compañía se expresan en la moneda de {selectedCountry.name}
                {' '}(<strong>{selectedCountry.local_currency}</strong>). El país define la moneda, el
                redondeo y las reglas que le aplican.
              </p>
            )}

            <Input
              label="Nombre *"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              error={fieldErrors.name}
              placeholder={isOutsourced ? 'Transportes del Valle S.A.' : 'Flota propia (Costa Rica)'}
            />
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">
              Datos fiscales {isOutsourced ? '' : <span className="font-normal text-slate-500">(opcionales)</span>}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label={`Tipo de identificación${isOutsourced ? ' *' : ''}`}
                value={form.tax_id_type ?? ''}
                onChange={(e) => set('tax_id_type', (e.target.value || null) as SettlementPartyInput['tax_id_type'])}
                error={fieldErrors.tax_id_type}
              >
                <option value="">Sin especificar</option>
                {TAX_ID_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>

              <Input
                label={`Identificación fiscal${isOutsourced ? ' *' : ''}`}
                value={form.tax_id ?? ''}
                onChange={(e) => set('tax_id', e.target.value)}
                error={fieldErrors.tax_id}
                placeholder="J-12345678-9"
              />
            </div>

            {isOutsourced && (
              <p className="text-xs text-slate-500">
                Un tercero se factura: sin identificación fiscal no se le puede liquidar.
              </p>
            )}
          </section>

          {isOutsourced && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Enlace con el TMS (opcional)</h3>
              <Select
                label="Transportista del TMS"
                value={form.carrier_id ?? ''}
                onChange={(e) => set('carrier_id', e.target.value || null)}
                error={fieldErrors.carrier_id}
                disabled={tmsCarriers.length === 0}
              >
                <option value="">Sin enlazar</option>
                {tmsCarriers.map((c) => (
                  <option key={c.id} value={c.id}>{c.code ? `${c.code} — ${c.name}` : c.name}</option>
                ))}
              </Select>
              {tmsError ? (
                <p className="text-xs text-amber-700">{tmsError}</p>
              ) : (
                <p className="text-xs text-slate-500">
                  Enlazar permite que una liquidación de una ruta del TMS encuentre sola las reglas de
                  esta compañía. El tarifador solo LEE el catálogo del TMS, nunca lo modifica.
                </p>
              )}
            </section>
          )}

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Contacto</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Persona de contacto"
                value={form.contact_name ?? ''}
                onChange={(e) => set('contact_name', e.target.value)}
              />
              <Input
                label="Correo"
                type="email"
                value={form.email ?? ''}
                onChange={(e) => set('email', e.target.value)}
                error={fieldErrors.email}
              />
              <Input
                label="Teléfono"
                value={form.phone ?? ''}
                onChange={(e) => set('phone', e.target.value)}
              />
              <Input
                label="Dirección"
                value={form.address ?? ''}
                onChange={(e) => set('address', e.target.value)}
              />
            </div>
          </section>

          <section className="space-y-2">
            <label htmlFor="party-notes" className="block text-sm font-medium text-slate-700">Notas</label>
            <textarea
              id="party-notes"
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </section>

          {!isOutsourced && (
            <div className="flex items-start gap-2 bg-teal-50 border border-teal-200 text-teal-800 text-sm rounded-lg px-4 py-3">
              <i className="ri-information-line mt-0.5 shrink-0"></i>
              <span>
                La flota propia administra recursos internos: además de estos datos, lleva nómina de
                conductores y una estructura de costos detallada. Esa parte se configura en{' '}
                <strong>Reglas de Tarifa → Costos</strong>, y pasa a vivir dentro de esta ficha en el
                próximo paso.
              </span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : party ? 'Guardar cambios' : 'Crear compañía'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
