import Card from '../../../../components/base/Card';
import CalcBreakdownPanel from '../../../../components/tarifas/CalcBreakdownPanel';
import type { CustomVarField } from '../../../../lib/tarifas/customVarFields';
import type { ScenarioCheck } from '../../../../lib/tarifas/templateScenarios';
import ScenarioVerdict from './ScenarioVerdict';
import type { Calculo, Modo } from './testerTypes';

interface Props {
  calculo: Calculo | null;
  calculando: boolean;
  error: string;
  modo: Modo;
  veredicto: ScenarioCheck | null;
  guardando: boolean;
  customFields: CustomVarField[];
  constantes: CustomVarField[];
  onFix: () => void;
}

/** Tarjeta "¿Por qué este total?": error, veredicto del escenario y el desglose del cálculo. */
export default function TesterResultCard({
  calculo, calculando, error, modo, veredicto, guardando, customFields, constantes, onFix,
}: Props) {
  const result = calculo?.result ?? null;
  return (
    <Card>
      <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
        <i className="ri-file-list-3-line text-teal-600"></i>
        ¿Por qué este total?
        {calculando && <i className="ri-loader-4-line animate-spin text-slate-400"></i>}
      </h3>

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          <i className="ri-error-warning-line mt-0.5 shrink-0"></i>
          <span>{error}</span>
        </div>
      )}

      {veredicto && result && (
        <ScenarioVerdict veredicto={veredicto} result={result} guardando={guardando} onFix={onFix} />
      )}

      {!result && !error && !calculando && (
        <p className="text-sm text-slate-400">
          {modo === 'viaje'
            ? 'Elegí un viaje completado para ver el desglose.'
            : 'Completá el viaje para ver el desglose.'}
        </p>
      )}

      {result && calculo && (
        <CalcBreakdownPanel
          result={result}
          ctx={{
            rules: calculo.rules,
            customLabels: Object.fromEntries(
              [...customFields, ...constantes].map((f) => [f.key, f.label]),
            ),
          }}
        />
      )}
    </Card>
  );
}
