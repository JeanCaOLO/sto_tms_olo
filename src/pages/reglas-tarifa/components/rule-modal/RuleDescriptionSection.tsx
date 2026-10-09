// Sección: descripción y motivo.
import Input from '../../../../components/base/Input';

interface RuleDescriptionSectionProps {
  description: string;
  descriptionTouched: boolean;
  effectiveDescription: string;
  reason: string;
  onDescriptionChange: (desc: string) => void;
  onDescriptionTouchChange: (touched: boolean) => void;
  onReasonChange: (reason: string) => void;
}

export default function RuleDescriptionSection({
  description,
  descriptionTouched,
  effectiveDescription,
  reason,
  onDescriptionChange,
  onDescriptionTouchChange,
  onReasonChange,
}: RuleDescriptionSectionProps) {
  return (
    <section className="border-t border-gray-200 pt-4 space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="rule-description" className="block text-sm font-medium text-slate-700">Descripción</label>
          {descriptionTouched && (
            <button
              type="button"
              onClick={() => { onDescriptionTouchChange(false); onDescriptionChange(''); }}
              className="text-xs text-teal-600 hover:underline cursor-pointer"
            >
              Volver a la automática
            </button>
          )}
        </div>
        <textarea
          id="rule-description"
          value={effectiveDescription}
          onChange={(e) => { onDescriptionTouchChange(true); onDescriptionChange(e.target.value); }}
          rows={2}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        {!descriptionTouched && (
          <p className="text-xs text-gray-500 mt-1">Se escribe sola desde el cálculo. Editala si querés otra redacción.</p>
        )}
      </div>

      <Input
        label="Motivo"
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
        placeholder="Acuerdo con el transportista de agosto 2026"
      />
    </section>
  );
}
