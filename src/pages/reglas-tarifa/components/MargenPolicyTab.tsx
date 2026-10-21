import { useCallback, useEffect, useState } from 'react';
import type Decimal from 'decimal.js';
import { parseMoneyInput } from '../../../lib/tarifas/money';
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

const DEFAULT_WARN_BELOW = '0.15';
const DEFAULT_CRITICAL_BELOW = '0.10';
const emptyForm = {
  warn_below: DEFAULT_WARN_BELOW, critical_below: DEFAULT_CRITICAL_BELOW,
  require_reason_below: DEFAULT_WARN_BELOW, block_on_loss: true,
};

interface MarginPolicyRow {
  id: string;
  country_id: string;
  warn_below: number | string;
  critical_below: number | string;
  require_reason_below: number | string;
  block_on_loss: boolean;
}

/** Valida los umbrales (proporciones 0..1, crítico ≤ advertencia). Devuelve el error o null. */
function validateThresholds(warnText: string, criticalText: string): string | null {
  const warn = parseMoneyInput(warnText);
  const critical = parseMoneyInput(criticalText);
  if (!warn || !critical) return 'Los umbrales deben ser números (por ejemplo 0.15 para 15%).';
  const outOfRange = (v: Decimal) => v.isNegative() || v.greaterThan(1);
  if (outOfRange(warn) || outOfRange(critical)) return 'Los umbrales son proporciones entre 0 y 1 (0.15 = 15%).';
  if (critical.greaterThan(warn)) return 'El umbral crítico no puede ser mayor que el de advertencia.';
  return null;
}

// Alerta de auditoría, una fila por país: define a partir de qué ganancia (valor de la mercancía vs.
// gastos del viaje) la alerta pasa a Atención/Crítico. Solo informativa: no bloquea nada.
// `require_reason_below` y `block_on_loss` ya no tienen efecto; se conservan tal como estaban al guardar.
export default function MargenPolicyTab({ organizationId, countryId }: MargenPolicyTabProps) {
  const { canEdit } = useModulePermissions('tarifas.config');
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState<MarginPolicyRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPolicies((await listMarginPolicies(organizationId)) as MarginPolicyRow[]);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la alerta de auditoría.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  const current = policies.find((p) => p.country_id === countryId);

  // Solo se reinicia el formulario al cambiar de país o de registro, no en cada recarga: así no se
  // pisa lo que la persona está escribiendo.
  useEffect(() => {
    setForm(current
      ? {
          warn_below: String(current.warn_below), critical_below: String(current.critical_below),
          require_reason_below: String(current.require_reason_below), block_on_loss: !!current.block_on_loss,
        }
      : emptyForm);
  }, [countryId, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!countryId) return;
    const invalid = validateThresholds(form.warn_below, form.critical_below);
    if (invalid) { setError(invalid); return; }
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const { error: saveError } = await saveMarginPolicy(organizationId, {
        country_id: countryId,
        warn_below: parseMoneyInput(form.warn_below)!.toFixed(),
        critical_below: parseMoneyInput(form.critical_below)!.toFixed(),
        require_reason_below: String(current?.require_reason_below ?? form.require_reason_below),
        block_on_loss: current ? !!current.block_on_loss : form.block_on_loss,
      }, current?.id);
      if (saveError) setError(saveError.message);
      else { await load(); setSaved(true); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la alerta de auditoría.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Card><div className="text-center py-14 text-slate-500"><i className="ri-loader-4-line animate-spin text-2xl"></i></div></Card>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Alerta Margen (ganancia vs gastos)</h3>
          <HelpButton
            title="Alerta Margen"
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
        {error && <p role="alert" className="text-xs text-red-600 mt-3">{error}</p>}
        {saved && !error && <p role="status" className="text-xs text-emerald-700 mt-3">Umbrales guardados.</p>}
        <div className="pt-4 mt-4 border-t border-slate-200">
          <Button onClick={handleSave} disabled={saving || !countryId || !canEdit} title={!canEdit ? 'Tu rol no puede editar la alerta' : undefined}>
            {saving ? 'Guardando...' : 'Guardar umbrales'}
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
