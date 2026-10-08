import { useEffect, useState } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import HelpButton from './HelpButton';
import { listMarginPolicies, saveMarginPolicy } from '../../../lib/tarifas/localRulesDataSource';
import { useModulePermissions } from '../../../hooks/use-module-permissions';

interface MargenPolicyTabProps {
  organizationId: string;
  /** País activo del módulo. El ámbito es global, ya no se elige acá. */
  countryId: string;
}

const emptyForm = { warn_below: '0.15', critical_below: '0.10', require_reason_below: '0.15', block_on_loss: true };

// Alerta de auditoría, una fila por país: define a partir de qué ganancia (valor de la mercancía vs.
// gastos del viaje) la alerta pasa a Atención/Crítico. Solo informativa: no bloquea nada.
// `require_reason_below` y `block_on_loss` ya no tienen efecto; se conservan tal como estaban al guardar.
export default function MargenPolicyTab({ organizationId, countryId }: MargenPolicyTabProps) {
  const { canEdit } = useModulePermissions('tarifas.config');
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
      require_reason_below: Number(current?.require_reason_below ?? form.require_reason_below),
      block_on_loss: current ? !!current.block_on_loss : form.block_on_loss,
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
          <h3 className="text-sm font-semibold text-slate-700">Alerta de auditoría (ganancia vs gastos)</h3>
          <HelpButton
            title="Alerta de auditoría"
            steps={[
              'Compara el valor de la mercancía de los pedidos del viaje contra los gastos del viaje. Es solo informativo, para auditoría: NUNCA bloquea ni condiciona una liquidación.',
              '"Atención" y "Crítico" son umbrales de ganancia mínima aceptable (como proporción): solo definen cuándo se pinta la alerta en amarillo (Atención) o en rojo (Crítico).',
            ]}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
        </div>
        <div className="pt-4 mt-4 border-t border-slate-200">
          <Button onClick={handleSave} disabled={saving || !countryId || !canEdit} title={!canEdit ? 'Tu rol no puede editar la alerta' : undefined}>
            {saving ? 'Guardando...' : current ? 'Actualizar' : 'Guardar'}
          </Button>
        </div>
        {!current && (
          <p className="text-xs text-amber-600 mt-2">
            Sin esto configurado, una liquidación para este país no puede mostrar la alerta de auditoría (se usan los umbrales por defecto).
          </p>
        )}
      </Card>
    </div>
  );
}
