import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import ZoneMap, { type GeoJSONGeometry, type ZoneShape } from './ZoneMap';
import { overlappingZoneNames } from './geofence-overlap';

interface Pais {
  id: string;
  name: string;
}

interface ZonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  zona?: any;
  // Las demás zonas del país elegido, para pintarlas de fondo mientras se dibuja.
  siblings?: ZoneShape[];
}

const DEFAULT_COLOR = '#0ea5e9';
const COLOR_PRESETS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];

// Modal de Zona con MAPA. Tabla `zones` (sql/09 + geocerca en sql/34).
// Una zona pertenece a un país (obligatorio); se dibuja su geocerca (polígono)
// sobre el mapa de ese país. El `code` de una zona EXISTENTE es de solo lectura:
// las reglas de tarifa y la ingesta del WMS lo usan (aviso de Claude, canal
// 2026-10-12), cambiarlo rompería esos cruces.
export default function ZonaModal({ isOpen, onClose, onSuccess, zona, siblings = [] }: ZonaModalProps) {
  const { appUser } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [paises, setPaises] = useState<Pais[]>([]);
  const [form, setForm] = useState({ code: '', name: '', country_id: '', status: 'active', color: DEFAULT_COLOR });
  const [geofence, setGeofence] = useState<GeoJSONGeometry | null>(null);
  const [error, setError] = useState('');

  const isEdit = !!zona;

  useEffect(() => {
    if (!isOpen) return;
    loadPaises();
    setForm({
      code: zona?.code || '',
      name: zona?.name || '',
      country_id: zona?.country_id || '',
      status: zona?.status || 'active',
      color: zona?.color || DEFAULT_COLOR,
    });
    setGeofence(zona?.geofence ?? null);
    setError('');
  }, [zona, isOpen]);

  const loadPaises = async () => {
    if (!appUser?.organization_id) return;
    const { data } = await supabase
      .from('countries')
      .select('id, name')
      .eq('organization_id', appUser.organization_id)
      .order('name');
    if (data) setPaises(data);
  };

  const countryName = paises.find((p) => p.id === form.country_id)?.name ?? null;
  // Fondo: las otras zonas del país elegido (no la que se edita).
  const backdrop = siblings.filter((s) => s.id !== zona?.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser?.organization_id) return;
    if (!form.country_id) { setError(t('zones.errCountry')); return; }

    // Aviso de solapamiento: la geocerca no debería pisar otra zona del país.
    // No es bloqueo duro (geometrías a mano) — se confirma.
    if (geofence) {
      const solapa = overlappingZoneNames(geofence, backdrop);
      if (solapa.length > 0 && !window.confirm(t('zones.overlapWarn', { zonas: solapa.join(', ') }))) {
        return;
      }
    }

    setLoading(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        country_id: form.country_id,
        status: form.status,
        color: form.color || null,
        geofence: geofence,
        updated_at: new Date().toISOString(),
      };
      // El code solo se escribe al crear; al editar es inmutable (lo usan tarifas/WMS).
      if (!isEdit) payload.code = form.code || null;

      if (isEdit) {
        const { error: err } = await supabase.from('zones').update(payload).eq('id', zona.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from('zones')
          .insert({ ...payload, organization_id: appUser.organization_id });
        if (err) throw err;
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || t('zones.errSave'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="shrink-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">{isEdit ? t('zones.editTitle') : t('zones.new')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label={t('common.cancel')}>
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Datos */}
          <div className="lg:col-span-2 space-y-4">
            <Select
              label={t('zones.colCountry')}
              value={form.country_id}
              onChange={(e) => setForm({ ...form, country_id: e.target.value })}
              required
              options={[
                { value: '', label: t('zones.selectCountry') },
                ...paises.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />

            <div>
              <Input
                label={t('zones.code')}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                disabled={isEdit}
                placeholder="Z1, Z2…"
              />
              {isEdit && <p className="text-xs text-amber-600 mt-1"><i className="ri-lock-line"></i> {t('zones.codeLocked')}</p>}
            </div>

            <Input
              label={t('zones.name')}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              placeholder="Z1 · Casco Central"
            />

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('zones.color')}</label>
              <div className="flex items-center gap-2 flex-wrap">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    aria-label={c}
                    className={`w-7 h-7 rounded-full border-2 cursor-pointer ${form.color === c ? 'border-slate-900' : 'border-white shadow'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer border border-slate-200"
                  aria-label={t('zones.color')}
                />
              </div>
            </div>

            <Select
              label={t('zones.colStatus')}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              required
              options={[
                { value: 'active', label: t('zones.active') },
                { value: 'inactive', label: t('zones.inactive') },
              ]}
            />

            <p className="text-xs text-slate-500">{geofence ? t('zones.fenceSet') : t('zones.fenceHint')}</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          {/* Mapa */}
          <div className="lg:col-span-3">
            {form.country_id ? (
              <ZoneMap
                shapes={backdrop}
                countryName={countryName}
                editable
                initialGeometry={zona?.geofence ?? null}
                editColor={form.color}
                onDraw={setGeofence}
                className="h-[460px] w-full rounded-lg border border-slate-200"
              />
            ) : (
              <div className="h-[460px] w-full rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-sm">
                {t('zones.pickCountryFirst')}
              </div>
            )}
          </div>

          </div>

          <div className="shrink-0 flex gap-3 px-6 py-4 border-t border-slate-100 bg-white">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading} className="flex-1">
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? t('zones.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
