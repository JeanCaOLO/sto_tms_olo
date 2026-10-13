import type { CostStructure } from '../../../../lib/tarifas/types';

/** Parámetros de la plantilla que el formulario no edita: km por año, combustible y rendimiento. */
export function ParamsLine({ structure, currency }: { structure: CostStructure | null | undefined; currency: string }) {
  if (!structure) return null;
  const { kmPerYear, fuelPrice, fuelEfficiency } = structure.params;
  const rendimiento = Object.entries(fuelEfficiency).map(([tipo, valor]) => `${tipo}: ${valor}`).join(' · ');
  return (
    <p className="text-xs text-slate-500 -mt-3">
      Parámetros de la plantilla: km por año <strong>{kmPerYear ?? '—'}</strong> · combustible ({currency}){' '}
      <strong>{fuelPrice ?? '—'}</strong> · rendimiento km/l <strong>{rendimiento || '—'}</strong>. Se cambian subiendo la plantilla.
    </p>
  );
}
