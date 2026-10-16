// Sección: vigencia (desde/hasta).
import Input from '../../../../components/base/Input';

interface RuleEffectivenessSectionProps {
  effectiveFrom: string;
  effectiveTo: string;
  periodoInvertido: boolean;
  onEffectiveFromChange: (date: string) => void;
  onEffectiveToChange: (date: string) => void;
}

export default function RuleEffectivenessSection({
  effectiveFrom,
  effectiveTo,
  periodoInvertido,
  onEffectiveFromChange,
  onEffectiveToChange,
}: RuleEffectivenessSectionProps) {
  return (
    <section className="border-t border-gray-200 pt-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">Desde y hasta cuándo rige</h3>
      <p className="text-xs text-gray-500 mb-3">
        Se compara contra la <strong>fecha del viaje</strong>, no contra hoy. Un viaje de
        agosto se sigue liquidando con la tarifa de agosto aunque el acuerdo ya haya cambiado.
        Dejalas vacías si la regla no tiene vencimiento.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Rige desde"
          type="date"
          value={effectiveFrom}
          onChange={(e) => onEffectiveFromChange(e.target.value)}
        />
        <Input
          label="Rige hasta"
          type="date"
          value={effectiveTo}
          onChange={(e) => onEffectiveToChange(e.target.value)}
        />
      </div>
      {periodoInvertido && (
        <p className="text-xs text-red-600 mt-2">
          <i className="ri-error-warning-line mr-1"></i>
          La fecha de fin es anterior a la de inicio: así la regla no aplicaría nunca.
        </p>
      )}
      <p className="text-xs text-gray-500 mt-2">
        Ambos días quedan <strong>incluidos</strong>. Vencerla no es lo mismo que desactivarla:
        una regla vencida sigue aplicando a los viajes anteriores a su fecha de fin, y una
        inactiva no aplica a ninguno.
      </p>
    </section>
  );
}
