import Button from '../../../../components/base/Button';
import { formatMoney } from '../../../../lib/tarifas/format';
import type { ScenarioCheck } from '../../../../lib/tarifas/templateScenarios';
import type { CalcResult } from '../../../../lib/tarifas/types';

interface Props {
  veredicto: ScenarioCheck;
  result: CalcResult;
  guardando: boolean;
  onFix: () => void;
}

/** Si el escenario sigue dando el total que declara, y el botón para aceptar el total nuevo. */
export default function ScenarioVerdict({ veredicto, result, guardando, onFix }: Props) {
  return (
    <div
      className={`mb-4 rounded-lg px-4 py-3 border text-sm ${
        veredicto.verdict === 'OK'
          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
          : veredicto.verdict === 'MOVIO'
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-slate-50 border-slate-200 text-slate-600'
      }`}
    >
      {veredicto.verdict === 'OK' && (
        <>
          <i className="ri-check-line mr-1"></i>
          Este escenario sigue dando lo que declara:{' '}
          <strong>{formatMoney(veredicto.expected!, result.currency)}</strong>.
        </>
      )}
      {veredicto.verdict === 'MOVIO' && (
        <>
          <i className="ri-error-warning-line mr-1"></i>
          El total se movió: esperaba <strong>{formatMoney(veredicto.expected!, result.currency)}</strong>{' '}
          y da <strong>{formatMoney(veredicto.actual, result.currency)}</strong>{' '}
          (diferencia {veredicto.drift}). Si el cambio es correcto, fijá el total nuevo.
        </>
      )}
      {veredicto.verdict === 'SIN_ESPERADO' && (
        <>Este escenario no declara un total esperado: no verifica nada todavía.</>
      )}
      {veredicto.verdict !== 'OK' && (
        <div className="mt-2">
          <Button variant="secondary" size="sm" onClick={onFix} disabled={guardando}>
            <i className="ri-bookmark-line mr-1"></i>
            Fijar {formatMoney(veredicto.actual, result.currency)} como el total esperado
          </Button>
        </div>
      )}
    </div>
  );
}
