// Sección: competencia con otras reglas (apilamiento).
import Input from '../../../../components/base/Input';
import Select from '../../../../components/base/Select';
import { BASE_METHODS, BASE_METHOD_ORDER } from '../../../../lib/tarifas/baseMethods';
import type { BaseMethodId, Stage } from '../../../../lib/tarifas/types';

interface RuleStackingSectionProps {
  stage: Stage;
  stacking: 'SUM' | 'MAX' | 'EXCLUSIVE';
  exclusionGroup: string;
  appliesToBase: BaseMethodId[];
  priority: number;
  active: boolean;
  onAppliesToBaseChange: (methods: BaseMethodId[]) => void;
  onStageChange: (stage: Stage) => void;
  onStackingChange: (stacking: 'SUM' | 'MAX' | 'EXCLUSIVE') => void;
  onExclusionGroupChange: (group: string) => void;
  onPriorityChange: (priority: number) => void;
  onActiveChange: (active: boolean) => void;
}

const STACKING_OPTIONS = [
  { value: 'SUM', label: 'Se suma a las demás' },
  { value: 'MAX', label: 'Compite: gana la de monto más alto del grupo' },
  { value: 'EXCLUSIVE', label: 'Compite: gana la de mayor prioridad' },
];

const STAGE_OPTIONS: { value: Stage; label: string }[] = [
  { value: 'BASE', label: 'Base (precio base de la ruta)' },
  { value: 'VARIABLE', label: 'Variable (cliente / kg / bulto)' },
  { value: 'MODIFIER', label: 'Modificador (ajuste por servicio)' },
  { value: 'SURCHARGE', label: 'Recargo (pernocta, peajes y otros variables propios)' },
  { value: 'ADJUSTMENT', label: 'Ajuste (descuentos/penalidades)' },
  { value: 'TAX', label: 'Impuesto' },
];

export default function RuleStackingSection({
  stage,
  stacking,
  exclusionGroup,
  appliesToBase,
  priority,
  active,
  onAppliesToBaseChange,
  onStageChange,
  onStackingChange,
  onExclusionGroupChange,
  onPriorityChange,
  onActiveChange,
}: RuleStackingSectionProps) {
  return (
    <section className="border-t border-gray-200 pt-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Cómo convive con las demás reglas</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Etapa del cálculo *"
          value={stage}
          onChange={(e) => onStageChange(e.target.value as Stage)}
          options={STAGE_OPTIONS}
        />
        <Select
          label="¿Se suma o compite? *"
          value={stacking}
          onChange={(e) => onStackingChange(e.target.value as 'SUM' | 'MAX' | 'EXCLUSIVE')}
          options={STACKING_OPTIONS}
        />
        {stacking === 'MAX' && (
          <Input
            label="Grupo con el que compite"
            value={exclusionGroup}
            onChange={(e) => onExclusionGroupChange(e.target.value)}
            placeholder="recargo_incidentes"
          />
        )}
        {stacking !== 'SUM' && (
          <Input
            label="Prioridad (menor = gana)"
            type="number"
            value={String(priority)}
            onChange={(e) => onPriorityChange(Number(e.target.value))}
          />
        )}
        {stage !== 'BASE' && (
          <div className="md:col-span-2" role="group" aria-labelledby="regla-liga-base">
            <p id="regla-liga-base" className="text-sm font-medium text-slate-700 mb-1">Se cobra con la base…</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {BASE_METHOD_ORDER.map((id) => (
                <label
                  key={id}
                  className={`flex items-center gap-1.5 text-sm ${id === 'TENDERING' ? 'text-slate-400' : 'text-slate-700 cursor-pointer'}`}
                  title={id === 'TENDERING' ? 'Todavía no tiene un cálculo definido' : undefined}
                >
                  <input
                    type="checkbox"
                    disabled={id === 'TENDERING'}
                    checked={appliesToBase.includes(id)}
                    onChange={(e) => onAppliesToBaseChange(
                      e.target.checked ? [...appliesToBase, id] : appliesToBase.filter((m) => m !== id),
                    )}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  {BASE_METHODS[id].label}
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Sin marcar, el ajuste aplica con cualquier forma de cobro. Si marca alguna, solo aplica cuando la base del viaje es una de ellas.
            </p>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700 pb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => onActiveChange(e.target.checked)}
            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          Regla activa
        </label>
      </div>
    </section>
  );
}
