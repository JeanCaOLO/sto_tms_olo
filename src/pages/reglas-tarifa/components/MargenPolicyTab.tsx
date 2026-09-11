import { useEffect, useState } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import HelpButton from './HelpButton';
import { listMarginPolicies, saveMarginPolicy } from '../../../lib/tarifas/localRulesDataSource';

interface MargenPolicyTabProps {
  organizationId: string;
  countries: { id: string; name: string }[];
}

const emptyForm = { warn_below: '0.15', critical_below: '0.10', require_reason_below: '0.15', block_on_loss: true };

// Política de margen (Fase 2), una fila por país: define a partir de qué porcentaje de margen
// (liquidado vs. costo operativo) el semáforo pasa a Atención/Crítico/Pérdida, y si una pérdida
// bloquea la aprobación de la liquidación.
export default function MargenPolicyTab({ organizationId, countries }: MargenPolicyTabProps) {
  const [countryId, setCountryId] = useState(countries[0]?.id ?? '');
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState<any[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setPolicies(await listMarginPolicies(organizationId));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    const current = policies.find((p) => p.country_id === countryId);
    setForm(current
      ? {
          warn_below: String(current.warn_below), critical_below: String(current.critical_below),
          require_reason_below: String(current.require_reason_below), block_on_loss: !!current.block_on_loss,
        }
      : emptyForm);
  }, [countryId, policies]);

  const current = policies.find((p) => p.country_id === countryId);

  const handleSave = async () => {
    if (!countryId) return;
    setSaving(true);
    await saveMarginPolicy(organizationId, {
      country_id: countryId,
      warn_below: Number(form.warn_below),
      critical_below: Number(form.critical_below),
      require_reason_below: Number(form.require_reason_below),
      block_on_loss: form.block_on_loss,
    }, current?.id);
    setSaving(false);
    await load();
  };

  if (loading) {
    return <Card><div className="text-center py-14 text-slate-500"><i className="ri-loader-4-line animate-spin text-2xl"></i></div></Card>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-700">País</h3>
          <HelpButton
            title="Política de margen"
            steps={[
              'Margen = (liquidado − costo) / liquidado. Compara lo que se le paga al transportista contra lo que cuesta operar el viaje.',
              '"Atención" y "Crítico" son umbrales de margen mínimo aceptable, de menor a mayor severidad.',
              'Por debajo de "exige motivo", la liquidación pide un motivo obligatorio antes de aprobarse.',
              'Si el margen da pérdida (negativo) y "Bloquear en pérdida" está activo, no se puede aprobar la liquidación hasta corregirla.',
            ]}
          />
        </div>
        <Select value={countryId} onChange={(e) => setCountryId(e.target.value)} options={countries.map((c) => ({ value: c.id, label: c.name }))} />
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Umbrales de margen</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            label="Advertencia por debajo de"
            value={form.warn_below}
            onChange={(e) => setForm({ ...form, warn_below: e.target.value })}
            placeholder="0.15 (15%)"
          />
          <Input
            label="Crítico por debajo de"
            value={form.critical_below}
            onChange={(e) => setForm({ ...form, critical_below: e.target.value })}
            placeholder="0.10 (10%)"
          />
          <Input
            label="Exige motivo por debajo de"
            value={form.require_reason_below}
            onChange={(e) => setForm({ ...form, require_reason_below: e.target.value })}
            placeholder="0.15 (15%)"
          />
        </div>
        <label className="flex items-center gap-2 mt-4">
          <input
            type="checkbox"
            checked={form.block_on_loss}
            onChange={(e) => setForm({ ...form, block_on_loss: e.target.checked })}
            className="w-4 h-4 accent-teal-600"
          />
          <span className="text-sm text-slate-700">Bloquear aprobación si hay pérdida (margen negativo)</span>
        </label>
        <div className="pt-4 mt-4 border-t border-slate-200">
          <Button onClick={handleSave} disabled={saving || !countryId}>
            {saving ? 'Guardando...' : current ? 'Actualizar' : 'Guardar'}
          </Button>
        </div>
        {!current && (
          <p className="text-xs text-amber-600 mt-2">
            Sin esto configurado, una liquidación para este país no puede calcular el semáforo de margen.
          </p>
        )}
      </Card>
    </div>
  );
}
