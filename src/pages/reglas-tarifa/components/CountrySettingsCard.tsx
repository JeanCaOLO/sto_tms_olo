import { useEffect, useState } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import { listCountries, saveCountrySettings } from '../../../lib/tarifas/localRulesDataSource';

interface Props {
  /** País activo del módulo. */
  countryId: string;
  /** Moneda del catálogo: solo se muestra, no se edita. */
  currency?: string;
}

const ROUNDING_MODES = [
  { value: 'HALF_UP', label: 'Al más cercano (0,5 sube)' },
  { value: 'HALF_EVEN', label: 'Al más cercano (0,5 al par)' },
  { value: 'UP', label: 'Siempre hacia arriba' },
  { value: 'DOWN', label: 'Siempre hacia abajo' },
];

// Configuración de cálculo del país: redondeo y umbral de pernocta. La moneda es del catálogo.
export default function CountrySettingsCard({ countryId, currency }: Props) {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [form, setForm] = useState({ rounding_decimals: '2', rounding_mode: 'HALF_UP', overnight_threshold_hours: '12' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!countryId) return undefined;
    let vigente = true;
    setLoading(true);
    setMessage(null);
    void listCountries('')
      .then((rows) => {
        if (!vigente) return;
        const row = rows.find((c) => c.id === countryId);
        setConfigured(!!row?.settings_id);
        if (row?.settings_id) {
          setForm({
            rounding_decimals: String(row.rounding_decimals),
            rounding_mode: String(row.rounding_mode),
            overnight_threshold_hours: String(row.overnight_threshold_hours),
          });
        }
      })
      .catch((error) => {
        console.error('Error cargando configuración del país:', error);
        if (vigente) setMessage({ kind: 'error', text: 'No se pudo cargar la configuración del país.' });
      })
      .finally(() => { if (vigente) setLoading(false); });
    return () => { vigente = false; };
  }, [countryId]);

  const handleSave = async () => {
    const decimals = Number(form.rounding_decimals);
    const hours = Number(form.overnight_threshold_hours);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) {
      setMessage({ kind: 'error', text: 'Los decimales deben ser un entero entre 0 y 6.' });
      return;
    }
    if (!Number.isInteger(hours) || hours < 0) {
      setMessage({ kind: 'error', text: 'El umbral de pernocta debe ser un entero de horas, 0 o más.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await saveCountrySettings(countryId, {
        rounding_decimals: decimals,
        rounding_mode: form.rounding_mode,
        overnight_threshold_hours: hours,
      });
      if (error) throw error;
      setConfigured(true);
      setMessage({ kind: 'ok', text: 'Configuración guardada.' });
    } catch (error) {
      console.error('Error guardando configuración del país:', error);
      setMessage({ kind: 'error', text: 'No se pudo guardar la configuración del país.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <h3 className="text-sm font-semibold text-slate-700 mb-1">Cálculo del país</h3>
      <p className="text-xs text-slate-500 mb-3">
        Moneda: <strong>{currency ?? '—'}</strong> (del catálogo, no se edita acá). Redondeo y pernocta
        aplican a todas las liquidaciones del país.
      </p>
      {loading ? (
        <div className="text-center py-6 text-slate-500"><i className="ri-loader-4-line animate-spin text-xl"></i></div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <Input label="Decimales" type="number" value={form.rounding_decimals} onChange={(e) => setForm({ ...form, rounding_decimals: e.target.value })} />
            <Select label="Modo de redondeo" value={form.rounding_mode} onChange={(e) => setForm({ ...form, rounding_mode: e.target.value })} options={ROUNDING_MODES} />
            <Input label="Umbral de pernocta (h)" type="number" value={form.overnight_threshold_hours} onChange={(e) => setForm({ ...form, overnight_threshold_hours: e.target.value })} />
            <Button onClick={() => void handleSave()} disabled={saving || !countryId}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
          {!configured && (
            <p className="text-xs text-amber-600 mt-2">
              Este país todavía no tiene configuración de cálculo: sin ella no se puede liquidar.
            </p>
          )}
        </>
      )}
      {message && (
        <p className={`text-xs mt-2 ${message.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>{message.text}</p>
      )}
    </Card>
  );
}
