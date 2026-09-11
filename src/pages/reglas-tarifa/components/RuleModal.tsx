import { useState, useEffect } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import { RuleSchema } from '../../../lib/tarifas/schemas';
import { saveRule } from '../../../lib/tarifas/localRulesDataSource';
import type {
  BaseRef, ComparisonOp, Expr, NumericVarKey, Pred, Stage, VarKey,
} from '../../../lib/tarifas/types';
import { puede } from '../../../lib/liquidador/rbac';
import type { LiquidadorRole } from '../../../lib/liquidador/rbac';
import { registrarEvento } from '../../../lib/liquidador/auditLog';

interface RuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  rule?: any;
  organizationId: string;
  countries: { id: string; name: string }[];
  rolActivo: LiquidadorRole;
  usuarioActivo: string;
}

const STAGE_OPTIONS: { value: Stage; label: string }[] = [
  { value: 'BASE', label: 'Base (precio base de la ruta)' },
  { value: 'VARIABLE', label: 'Variable (cliente / kg / bulto)' },
  { value: 'MODIFIER', label: 'Modificador (ajuste por servicio)' },
  { value: 'SURCHARGE', label: 'Recargo (pernocta, peajes, incidentes)' },
  { value: 'ADJUSTMENT', label: 'Ajuste (descuentos/penalidades)' },
  { value: 'TAX', label: 'Impuesto' },
];

const STACKING_OPTIONS = [
  { value: 'SUM', label: 'Suma (todas se aplican)' },
  { value: 'MAX', label: 'Máximo (gana el monto más alto del grupo)' },
  { value: 'EXCLUSIVE', label: 'Exclusiva (gana la de mayor prioridad)' },
];

const CURRENCY_MODE_OPTIONS = [
  { value: 'LOCAL', label: 'Moneda local (se convierte a referencia)' },
  { value: 'REF', label: 'Moneda de referencia (sin conversión)' },
];

const VAR_KEY_OPTIONS: { value: VarKey; label: string }[] = [
  { value: 'km', label: 'Kilómetros' },
  { value: 'clientCount', label: 'Cantidad de paradas/clientes' },
  { value: 'packageCount', label: 'Cantidad de entregas/bultos' },
  { value: 'weightKg', label: 'Peso (kg)' },
  { value: 'truckTypeId', label: 'Tipo de vehículo' },
  { value: 'serviceType', label: 'Tipo de servicio' },
  { value: 'fleetType', label: 'Flota (OWN/OUTSOURCED)' },
  { value: 'carrierId', label: 'Transportista' },
  { value: 'customerId', label: 'Cliente' },
  { value: 'durationHours', label: 'Duración (horas)' },
  { value: 'tollsAmount', label: 'Monto de peajes' },
  { value: 'lateMinutes', label: 'Minutos de atraso' },
  { value: 'incidentCount', label: 'Cantidad de incidentes' },
  { value: 'originZone', label: 'Zona origen (código)' },
  { value: 'destZone', label: 'Zona destino (código)' },
  { value: 'originZoneGroup', label: 'Grupo de zona origen' },
  { value: 'destZoneGroup', label: 'Grupo de zona destino' },
  { value: 'overnightNights', label: 'Noches de pernocta' },
  { value: 'weekday', label: 'Día de la semana (0=domingo)' },
];

const NUMERIC_VAR_KEY_OPTIONS: { value: NumericVarKey; label: string }[] = [
  { value: 'km', label: 'Kilómetros' },
  { value: 'clientCount', label: 'Cantidad de paradas/clientes' },
  { value: 'packageCount', label: 'Cantidad de entregas/bultos' },
  { value: 'weightKg', label: 'Peso (kg)' },
  { value: 'durationHours', label: 'Duración (horas)' },
  { value: 'tollsAmount', label: 'Monto de peajes' },
  { value: 'lateMinutes', label: 'Minutos de atraso' },
  { value: 'incidentCount', label: 'Cantidad de incidentes' },
  { value: 'overnightNights', label: 'Noches de pernocta' },
  { value: 'weekday', label: 'Día de la semana' },
];

const COMPARISON_OP_OPTIONS: { value: ComparisonOp; label: string }[] = [
  { value: 'EQ', label: '= igual a' },
  { value: 'NEQ', label: '≠ distinto de' },
  { value: 'GT', label: '> mayor que' },
  { value: 'GTE', label: '≥ mayor o igual que' },
  { value: 'LT', label: '< menor que' },
  { value: 'LTE', label: '≤ menor o igual que' },
];

type ConditionRow = { left: VarKey; op: ComparisonOp; right: string };
type ConditionMode = 'always' | 'and' | 'advanced';
type ExpressionMode = 'simple' | 'advanced';
type SimpleOp = 'FIXED' | 'PER_UNIT' | 'PER_KM' | 'PERCENT' | 'TIERED';
type BaseType = 'STAGE_SUBTOTAL' | 'RUNNING_SUBTOTAL' | 'RULE';

function coerceValue(raw: string): string | number {
  if (raw.trim() !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

export default function RuleModal({ isOpen, onClose, onSuccess, rule, organizationId, countries, rolActivo, usuarioActivo }: RuleModalProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    code: '', name: '', country_id: '', stage: 'BASE' as Stage, priority: 10,
    stacking: 'SUM' as 'SUM' | 'MAX' | 'EXCLUSIVE', exclusion_group: '', currency_mode: 'LOCAL' as 'REF' | 'LOCAL',
    active: true,
  });

  const [conditionMode, setConditionMode] = useState<ConditionMode>('always');
  const [andConditions, setAndConditions] = useState<ConditionRow[]>([{ left: 'km', op: 'GT', right: '' }]);
  const [advancedConditionsJson, setAdvancedConditionsJson] = useState('{ "p": "ALWAYS" }');

  const [expressionMode, setExpressionMode] = useState<ExpressionMode>('simple');
  const [simpleOp, setSimpleOp] = useState<SimpleOp>('FIXED');
  const [fixedAmount, setFixedAmount] = useState('0');
  const [perUnit, setPerUnit] = useState<{ unit: NumericVarKey; rate: string }>({ unit: 'km', rate: '0' });
  const [perKmRate, setPerKmRate] = useState('0');
  const [percent, setPercent] = useState<{ pct: string; baseType: BaseType; baseStage: Stage; baseRuleCode: string }>({
    pct: '0', baseType: 'RUNNING_SUBTOTAL', baseStage: 'BASE', baseRuleCode: '',
  });
  const [tiers, setTiers] = useState<{ unit: NumericVarKey; rows: { upTo: string; amount: string }[] }>({
    unit: 'packageCount', rows: [{ upTo: '10', amount: '0' }],
  });
  const [advancedExpressionJson, setAdvancedExpressionJson] = useState('{ "op": "FIXED", "amount": "0" }');

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    if (rule) {
      setFormData({
        code: rule.code || '', name: rule.name || '', country_id: rule.country_id || '',
        stage: rule.stage || 'BASE', priority: rule.priority ?? 10, stacking: rule.stacking || 'SUM',
        exclusion_group: rule.exclusion_group || '', currency_mode: rule.currency_mode || 'LOCAL',
        active: rule.active ?? true,
      });
      // Reglas ya existentes se editan en modo avanzado — el constructor guiado es solo para crear
      // condiciones/expresiones simples desde cero (misma limitación documentada del prototipo).
      setConditionMode('advanced');
      setAdvancedConditionsJson(JSON.stringify(rule.conditions, null, 2));
      setExpressionMode('advanced');
      setAdvancedExpressionJson(JSON.stringify(rule.expression, null, 2));
    } else {
      setFormData({
        code: '', name: '', country_id: '', stage: 'BASE', priority: 10, stacking: 'SUM',
        exclusion_group: '', currency_mode: 'LOCAL', active: true,
      });
      setConditionMode('always');
      setAndConditions([{ left: 'km', op: 'GT', right: '' }]);
      setAdvancedConditionsJson('{ "p": "ALWAYS" }');
      setExpressionMode('simple');
      setSimpleOp('FIXED');
      setFixedAmount('0');
    }
  }, [isOpen, rule]);

  const buildConditions = (): Pred => {
    if (conditionMode === 'always') return { p: 'ALWAYS' };
    if (conditionMode === 'advanced') return JSON.parse(advancedConditionsJson);
    const comparisons: Pred[] = andConditions
      .filter((c) => c.right.trim() !== '')
      .map((c) => ({ p: c.op, left: c.left, right: coerceValue(c.right) }));
    if (comparisons.length === 0) return { p: 'ALWAYS' };
    if (comparisons.length === 1) return comparisons[0]!;
    return { p: 'AND', args: comparisons };
  };

  const buildExpression = (): Expr => {
    if (expressionMode === 'advanced') return JSON.parse(advancedExpressionJson);
    switch (simpleOp) {
      case 'FIXED':
        return { op: 'FIXED', amount: fixedAmount };
      case 'PER_UNIT':
        return { op: 'PER_UNIT', unit: perUnit.unit, rate: perUnit.rate };
      case 'PER_KM':
        return { op: 'PER_KM', rate: perKmRate };
      case 'PERCENT': {
        const base: BaseRef = percent.baseType === 'STAGE_SUBTOTAL'
          ? { of: 'STAGE_SUBTOTAL', stage: percent.baseStage }
          : percent.baseType === 'RUNNING_SUBTOTAL'
          ? { of: 'RUNNING_SUBTOTAL' }
          : { of: 'RULE', ruleCode: percent.baseRuleCode };
        return { op: 'PERCENT', pct: percent.pct, base };
      }
      case 'TIERED':
        return {
          op: 'TIERED',
          unit: tiers.unit,
          tiers: tiers.rows.map((t) => ({ upTo: t.upTo.trim() === '' ? null : Number(t.upTo), amount: t.amount })),
        };
    }
  };

  const addTierRow = () => setTiers((t) => ({ ...t, rows: [...t.rows, { upTo: '', amount: '0' }] }));
  const removeTierRow = (index: number) => setTiers((t) => ({ ...t, rows: t.rows.filter((_, i) => i !== index) }));
  const addConditionRow = () => setAndConditions((rows) => [...rows, { left: 'km', op: 'GT', right: '' }]);
  const removeConditionRow = (index: number) => setAndConditions((rows) => rows.filter((_, i) => i !== index));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!organizationId) {
      setErrorMsg('No se pudo identificar la organización. Recarga la página e intenta de nuevo.');
      return;
    }

    if (!puede(rule ? 'EDITAR_REGLA' : 'CREAR_REGLA', rolActivo)) {
      setErrorMsg('Tu rol simulado actual no tiene permiso para esta acción. Cambiá a "Jefe de transporte" en el selector de rol.');
      return;
    }

    let conditions: Pred;
    let expression: Expr;
    try {
      conditions = buildConditions();
    } catch {
      setErrorMsg('La condición en modo avanzado no es JSON válido.');
      return;
    }
    try {
      expression = buildExpression();
    } catch {
      setErrorMsg('La expresión en modo avanzado no es JSON válido.');
      return;
    }

    const candidate = {
      id: rule?.id || 'draft',
      countryId: formData.country_id || 'draft',
      code: formData.code.trim().toUpperCase(),
      name: formData.name,
      stage: formData.stage,
      priority: Number(formData.priority),
      stacking: formData.stacking,
      exclusionGroup: formData.stacking === 'MAX' && formData.exclusion_group.trim() ? formData.exclusion_group.trim() : null,
      currencyMode: formData.currency_mode,
      conditions,
      expression,
      isAdhoc: false,
      active: formData.active,
      version: rule?.version ?? 1,
    };

    const validation = RuleSchema.safeParse(candidate);
    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      setErrorMsg(`Regla inválida: ${firstIssue?.path.join('.')} — ${firstIssue?.message}`);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        country_id: formData.country_id || null,
        code: candidate.code,
        name: candidate.name,
        stage: candidate.stage,
        priority: candidate.priority,
        stacking: candidate.stacking,
        exclusion_group: candidate.exclusionGroup,
        currency_mode: candidate.currencyMode,
        conditions: candidate.conditions,
        expression: candidate.expression,
        is_adhoc: false,
        active: candidate.active,
        version: rule ? candidate.version + 1 : 1,
        updated_at: new Date().toISOString(),
      };

      const { error } = await saveRule(organizationId, payload, rule?.id);
      if (error) throw error;

      await registrarEvento({
        entidad: 'pricing_rules',
        entidadId: rule?.id || candidate.code,
        accion: rule ? 'UPDATE' : 'CREATE',
        usuario: usuarioActivo,
        rol: rolActivo,
        antes: rule ?? null,
        despues: payload,
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error:', error);
      const msg = error?.message || JSON.stringify(error);
      if (msg.includes('42501') || msg.includes('row-level security')) {
        setErrorMsg('Sin permisos para realizar esta acción. Verifica que tu sesión esté activa.');
      } else if (msg.includes('duplicate key') || msg.includes('unique')) {
        setErrorMsg('Ya existe una regla con ese código en esta organización.');
      } else {
        setErrorMsg('Error al guardar la regla. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-gray-200 z-10">
          <h2 className="text-lg font-semibold text-gray-900">{rule ? 'Editar Regla' : 'Nueva Regla'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 cursor-pointer">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {errorMsg && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              <i className="ri-error-warning-line mt-0.5 shrink-0"></i>
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Código *"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              placeholder="Ej: TARIFA-BASE-NORTE"
              required
              disabled={!!rule}
            />
            <Input
              label="Nombre *"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej: Tarifa base zona norte"
              required
            />
            <Select
              label="País"
              value={formData.country_id}
              onChange={(e) => setFormData({ ...formData, country_id: e.target.value })}
              options={[{ value: '', label: 'Todos los países' }, ...countries.map((c) => ({ value: c.id, label: c.name }))]}
            />
            <Select
              label="Etapa *"
              value={formData.stage}
              onChange={(e) => setFormData({ ...formData, stage: e.target.value as Stage })}
              options={STAGE_OPTIONS}
              required
            />
            <Select
              label="Modo de competencia *"
              value={formData.stacking}
              onChange={(e) => setFormData({ ...formData, stacking: e.target.value as any })}
              options={STACKING_OPTIONS}
              required
            />
            {formData.stacking === 'EXCLUSIVE' && (
              <Input
                label="Prioridad (menor = gana)"
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
              />
            )}
            {formData.stacking === 'MAX' && (
              <Input
                label="Grupo de exclusión"
                value={formData.exclusion_group}
                onChange={(e) => setFormData({ ...formData, exclusion_group: e.target.value })}
                placeholder="Reglas con el mismo grupo compiten entre sí"
              />
            )}
            <Select
              label="Moneda *"
              value={formData.currency_mode}
              onChange={(e) => setFormData({ ...formData, currency_mode: e.target.value as any })}
              options={CURRENCY_MODE_OPTIONS}
              required
            />
            <label className="flex items-center gap-2 mt-6">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="w-4 h-4 accent-teal-600"
              />
              <span className="text-sm text-gray-700">Regla activa</span>
            </label>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Condición</h3>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {(['always', 'and', 'advanced'] as ConditionMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setConditionMode(mode)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${conditionMode === mode ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600'}`}
                  >
                    {mode === 'always' ? 'Siempre' : mode === 'and' ? 'Si se cumplen todas' : 'Avanzado (JSON)'}
                  </button>
                ))}
              </div>
            </div>

            {conditionMode === 'always' && (
              <p className="text-xs text-gray-500">La regla aplica a cualquier viaje, sin condición.</p>
            )}

            {conditionMode === 'and' && (
              <div className="space-y-2">
                {andConditions.map((cond, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                    <Select
                      value={cond.left}
                      onChange={(e) => setAndConditions((rows) => rows.map((r, idx) => (idx === i ? { ...r, left: e.target.value as VarKey } : r)))}
                      options={VAR_KEY_OPTIONS}
                    />
                    <Select
                      value={cond.op}
                      onChange={(e) => setAndConditions((rows) => rows.map((r, idx) => (idx === i ? { ...r, op: e.target.value as ComparisonOp } : r)))}
                      options={COMPARISON_OP_OPTIONS}
                    />
                    <Input
                      value={cond.right}
                      onChange={(e) => setAndConditions((rows) => rows.map((r, idx) => (idx === i ? { ...r, right: e.target.value } : r)))}
                      placeholder="valor"
                    />
                    <button type="button" onClick={() => removeConditionRow(i)} className="text-red-500 hover:bg-red-50 rounded-lg p-2">
                      <i className="ri-delete-bin-line"></i>
                    </button>
                  </div>
                ))}
                <Button type="button" variant="secondary" size="sm" onClick={addConditionRow}>
                  <i className="ri-add-line"></i>
                  Agregar condición
                </Button>
              </div>
            )}

            {conditionMode === 'advanced' && (
              <div>
                <textarea
                  value={advancedConditionsJson}
                  onChange={(e) => setAdvancedConditionsJson(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  JSON del tipo <code>Pred</code> (OR/NOT/IN/BETWEEN incluidos) — se valida al guardar.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Expresión (monto)</h3>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {(['simple', 'advanced'] as ExpressionMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setExpressionMode(mode)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${expressionMode === mode ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600'}`}
                  >
                    {mode === 'simple' ? 'Guiado' : 'Avanzado (JSON)'}
                  </button>
                ))}
              </div>
            </div>

            {expressionMode === 'simple' && (
              <div className="space-y-3">
                <Select
                  label="Tipo de monto"
                  value={simpleOp}
                  onChange={(e) => setSimpleOp(e.target.value as SimpleOp)}
                  options={[
                    { value: 'FIXED', label: 'Monto fijo' },
                    { value: 'PER_UNIT', label: 'Por unidad (ej. por entrega)' },
                    { value: 'PER_KM', label: 'Por kilómetro' },
                    { value: 'PERCENT', label: 'Porcentaje sobre una base' },
                    { value: 'TIERED', label: 'Por escalones' },
                  ]}
                />

                {simpleOp === 'FIXED' && (
                  <Input label="Monto" value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} placeholder="400.00" />
                )}

                {simpleOp === 'PER_UNIT' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="Unidad" value={perUnit.unit} onChange={(e) => setPerUnit({ ...perUnit, unit: e.target.value as NumericVarKey })} options={NUMERIC_VAR_KEY_OPTIONS} />
                    <Input label="Tasa por unidad" value={perUnit.rate} onChange={(e) => setPerUnit({ ...perUnit, rate: e.target.value })} placeholder="2.50" />
                  </div>
                )}

                {simpleOp === 'PER_KM' && (
                  <Input label="Tasa por km" value={perKmRate} onChange={(e) => setPerKmRate(e.target.value)} placeholder="1.20" />
                )}

                {simpleOp === 'PERCENT' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="Porcentaje" value={percent.pct} onChange={(e) => setPercent({ ...percent, pct: e.target.value })} placeholder="10" />
                      <Select
                        label="Base del porcentaje"
                        value={percent.baseType}
                        onChange={(e) => setPercent({ ...percent, baseType: e.target.value as BaseType })}
                        options={[
                          { value: 'RUNNING_SUBTOTAL', label: 'Subtotal acumulado hasta ahora' },
                          { value: 'STAGE_SUBTOTAL', label: 'Subtotal de una etapa' },
                          { value: 'RULE', label: 'Monto de otra regla' },
                        ]}
                      />
                    </div>
                    {percent.baseType === 'STAGE_SUBTOTAL' && (
                      <Select label="Etapa" value={percent.baseStage} onChange={(e) => setPercent({ ...percent, baseStage: e.target.value as Stage })} options={STAGE_OPTIONS} />
                    )}
                    {percent.baseType === 'RULE' && (
                      <Input label="Código de la otra regla" value={percent.baseRuleCode} onChange={(e) => setPercent({ ...percent, baseRuleCode: e.target.value.toUpperCase() })} />
                    )}
                  </div>
                )}

                {simpleOp === 'TIERED' && (
                  <div className="space-y-2">
                    <Select label="Unidad del escalón" value={tiers.unit} onChange={(e) => setTiers({ ...tiers, unit: e.target.value as NumericVarKey })} options={NUMERIC_VAR_KEY_OPTIONS} />
                    {tiers.rows.map((row, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                        <Input
                          value={row.upTo}
                          onChange={(e) => setTiers((t) => ({ ...t, rows: t.rows.map((r, idx) => (idx === i ? { ...r, upTo: e.target.value } : r)) }))}
                          placeholder="Hasta (vacío = sin tope)"
                        />
                        <Input
                          value={row.amount}
                          onChange={(e) => setTiers((t) => ({ ...t, rows: t.rows.map((r, idx) => (idx === i ? { ...r, amount: e.target.value } : r)) }))}
                          placeholder="Monto del escalón"
                        />
                        <button type="button" onClick={() => removeTierRow(i)} className="text-red-500 hover:bg-red-50 rounded-lg p-2">
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    ))}
                    <Button type="button" variant="secondary" size="sm" onClick={addTierRow}>
                      <i className="ri-add-line"></i>
                      Agregar escalón
                    </Button>
                  </div>
                )}
              </div>
            )}

            {expressionMode === 'advanced' && (
              <div>
                <textarea
                  value={advancedExpressionJson}
                  onChange={(e) => setAdvancedExpressionJson(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  JSON del tipo <code>Expr</code> (LOOKUP_ZONE/MIN/MAX/CLAMP/IF incluidos) — se valida al guardar.
                </p>
              </div>
            )}
          </div>

          {!puede(rule ? 'EDITAR_REGLA' : 'CREAR_REGLA', rolActivo) && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Tu rol simulado actual ("{rolActivo}") no puede {rule ? 'editar' : 'crear'} reglas — cambiá a "Jefe de transporte".
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !puede(rule ? 'EDITAR_REGLA' : 'CREAR_REGLA', rolActivo)}>
              {loading ? 'Guardando...' : rule ? 'Actualizar' : 'Crear Regla'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
