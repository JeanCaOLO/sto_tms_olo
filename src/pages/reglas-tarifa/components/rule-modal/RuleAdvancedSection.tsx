// Sección: expresión JSON avanzada para el motor.
interface RuleAdvancedSectionProps {
  advancedExpressionJson: string;
  onExpressionJsonChange: (json: string) => void;
}

export default function RuleAdvancedSection({
  advancedExpressionJson,
  onExpressionJsonChange,
}: RuleAdvancedSectionProps) {
  return (
    <section className="border-t border-gray-200 pt-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Expresión (JSON del motor)</h3>
      <textarea
        value={advancedExpressionJson}
        onChange={(e) => onExpressionJsonChange(e.target.value)}
        rows={6}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
      <p className="text-xs text-gray-500 mt-1">
        Para escalones, mínimos/máximos, condicionales y tarifas por zona — lo que el
        formulario simple no cubre. Se valida al guardar.
      </p>
    </section>
  );
}
