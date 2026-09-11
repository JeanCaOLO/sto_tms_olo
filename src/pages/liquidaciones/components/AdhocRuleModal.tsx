import { useState } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import type {
  BaseRef, ComparisonOp, Expr, NumericVarKey, Pred, Rule, Stacking, Stage, VarKey,
} from '../../../lib/tarifas/types';

interface AdhocRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (rule: Rule) => void;
  countryId: string;
}

const STAGE_OPTIONS: { value: Stage; label: string }[] = [
  { value: 'BASE', label: 'Base' },
  { value: 'VARIABLE', label: 'Variable' },
  { value: 'MODIFIER', label: 'Modificador' },
  { value: 'SURCHARGE', label: 'Recargo' },
  { value: 'ADJUSTMENT', label: 'Ajuste' },
  { value: 'TAX', label: 'Impuesto' },
];

const VAR_KEY_OPTIONS: { value: VarKey; label: string }[] = [
  { value: 'km', label: 'Kilómetros' },
  { value: 'clientCount', label: 'Cantidad de paradas/clientes' },
  { value: 'packageCount', label: 'Cantidad de entregas/bultos' },
  { value: 'weightKg', label: 'Peso (kg)' },
  { value: 'serviceType', label: 'Tipo de servicio' },
  { value: 'fleetType', label: 'Flota (OWN/OUTSOURCED)' },
];

const NUMERIC_VAR_KEY_OPTIONS: { value: NumericVarKey; label: string }[] = [
  { value: 'km', label: 'Kilómetros' },
  { value: 'clientCount', label: 'Cantidad de paradas/clientes' },
  { value: 'packageCount', label: 'Cantidad de entregas/bultos' },
  { value: 'weightKg', label: 'Peso (kg)' },
];

const COMPARISON_OP_OPTIONS: { value: ComparisonOp; label: string }[] = [
  { value: 'EQ', label: '= igual a' },
  { value: 'NEQ', label: '≠ distinto de' },
  { value: 'GT', label: '> mayor que' },
  { value: 'GTE', label: '≥ mayor o igual que' },
];

type SimpleOp = 'FIXED' | 'PER_UNIT' | 'PER_KM' | 'PERCENT';

function coerceValue(raw: string): string | number {
  if (raw.trim() !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

// Formulario reducido (sin modo avanzado JSON) para agregar una regla puntual a ESTA liquidación,
// sin persistirla en el catálogo (`pricing_rules`) — misma limitación documentada que el
// constructor guiado de RuleModal: cubre los casos de uso más comunes, no el vocabulario completo
// del AST (eso queda para el catálogo, en Reglas de Tarifa).
export default function AdhocRuleModal({ isOpen, onClose, onAdd, countryId }: AdhocRuleModalProps) {
  const [name, setName] = useState('');
  const [stage, setStage] = useState<Stage>('ADJUSTMENT');
  const [stacking, setStacking] = useState<Stacking>('SUM');
  const [condition, setCondition] = useState<{ enabled: boolean; left: VarKey; op: ComparisonOp; right: string }>({
    enabled: false, left: 'km', op: 'GT', right: '',
  });
  const [simpleOp, setSimpleOp] = useState<SimpleOp>('FIXED');
  const [fixedAmount, setFixedAmount] = useState('0');
  const [perUnit, setPerUnit] = useState<{ unit: NumericVarKey; rate: string }>({ unit: 'km', rate: '0' });
  const [perKmRate, setPerKmRate] = useState('0');
  const [percent, setPercent] = useState({ pct: '0' });
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const buildConditions = (): Pred => {
    if (!condition.enabled || condition.right.trim() === '') return { p: 'ALWAYS' };
    return { p: condition.op, left: condition.left, right: coerceValue(condition.right) };
  };

  const buildExpression = (): Expr => {
    switch (simpleOp) {
      case 'FIXED':
        return { op: 'FIXED', amount: fixedAmount };
      case 'PER_UNIT':
        return { op: 'PER_UNIT', unit: perUnit.unit, rate: perUnit.rate };
      case 'PER_KM':
        return { op: 'PER_KM', rate: perKmRate };
      case 'PERCENT': {
        const base: BaseRef = { of: 'RUNNING_SUBTOTAL' };
        return { op: 'PERCENT', pct: percent.pct, base };
      }
    }
  };

  const handleAdd = () => {
    setError('');
    if (!name.trim()) {
      setError('Ponele un nombre a la regla ad-hoc.');
      return;
    }
    const code = `ADHOC_${Date.now().toString(36).toUpperCase()}`;
    const rule: Rule = {
      id: code,
      countryId,
      code,
      name: name.trim(),
      stage,
      priority: 999,
      stacking,
      exclusionGroup: null,
      currencyMode: 'REF',
      conditions: buildConditions(),
      expression: buildExpression(),
      isAdhoc: true,
      active: true,
      version: 1,
    };
    onAdd(rule);
    setName('');
    setCondition({ enabled: false, left: 'km', op: 'GT', right: '' });
    setSimpleOp('FIXED');
    setFixedAmount('0');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Agregar regla ad-hoc</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 cursor-pointer">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-gray-500">
            Aplica solo a esta liquidación puntual — no se guarda en el catálogo de Reglas de Tarifa.
          </p>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              <i className="ri-error-warning-line mt-0.5 shrink-0"></i>
              <span>{error}</span>
            </div>
          )}

          <Input label="Nombre *" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Bono puntual por urgencia" />

          <div className="grid grid-cols-2 gap-3">
            <Select label="Etapa" value={stage} onChange={(e) => setStage(e.target.value as Stage)} options={STAGE_OPTIONS} />
            <Select
              label="Modo"
              value={stacking}
              onChange={(e) => setStacking(e.target.value as Stacking)}
              options={[{ value: 'SUM', label: 'Suma' }, { value: 'EXCLUSIVE', label: 'Exclusiva' }, { value: 'MAX', label: 'Máximo' }]}
            />
          </div>

          <div>
            <label className="flex items-center gap-2 mb-2">
              <input type="checkbox" checked={condition.enabled} onChange={(e) => setCondition({ ...condition, enabled: e.target.checked })} className="w-4 h-4 accent-teal-600" />
              <span className="text-sm text-gray-700">Aplicar solo si se cumple una condición</span>
            </label>
            {condition.enabled && (
              <div className="grid grid-cols-3 gap-2">
                <Select value={condition.left} onChange={(e) => setCondition({ ...condition, left: e.target.value as VarKey })} options={VAR_KEY_OPTIONS} />
                <Select value={condition.op} onChange={(e) => setCondition({ ...condition, op: e.target.value as ComparisonOp })} options={COMPARISON_OP_OPTIONS} />
                <Input value={condition.right} onChange={(e) => setCondition({ ...condition, right: e.target.value })} placeholder="valor" />
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 pt-4 space-y-3">
            <Select
              label="Tipo de monto"
              value={simpleOp}
              onChange={(e) => setSimpleOp(e.target.value as SimpleOp)}
              options={[
                { value: 'FIXED', label: 'Monto fijo' },
                { value: 'PER_UNIT', label: 'Por unidad' },
                { value: 'PER_KM', label: 'Por kilómetro' },
                { value: 'PERCENT', label: 'Porcentaje sobre el subtotal acumulado' },
              ]}
            />
            {simpleOp === 'FIXED' && <Input label="Monto" value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} placeholder="20.00" />}
            {simpleOp === 'PER_UNIT' && (
              <div className="grid grid-cols-2 gap-3">
                <Select label="Unidad" value={perUnit.unit} onChange={(e) => setPerUnit({ ...perUnit, unit: e.target.value as NumericVarKey })} options={NUMERIC_VAR_KEY_OPTIONS} />
                <Input label="Tasa" value={perUnit.rate} onChange={(e) => setPerUnit({ ...perUnit, rate: e.target.value })} placeholder="2.00" />
              </div>
            )}
            {simpleOp === 'PER_KM' && <Input label="Tasa por km" value={perKmRate} onChange={(e) => setPerKmRate(e.target.value)} placeholder="1.20" />}
            {simpleOp === 'PERCENT' && <Input label="Porcentaje (fracción, ej. 0.05 = 5%)" value={percent.pct} onChange={(e) => setPercent({ pct: e.target.value })} placeholder="0.05" />}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="button" onClick={handleAdd}>Agregar a esta liquidación</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
