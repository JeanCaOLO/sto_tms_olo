// Escenarios guardados del Probador: aplicarlos al formulario, ver su veredicto y fijar el total esperado.

import { useMemo, useState } from 'react';
import { listTemplates, saveTemplate } from '../../../../lib/tarifas/localRulesDataSource';
import {
  checkScenario, toScenario, toTemplateRow, type ScenarioCheck, type TemplateScenario,
} from '../../../../lib/tarifas/templateScenarios';
import type { CalcResult } from '../../../../lib/tarifas/types';
import type { TesterForm } from './useTesterForm';
import { customVarsAsText, diaFromScenarioTrip, libreFromScenarioTrip } from './scenarioTrip';
import { mensajeDe, type Calculo } from './testerTypes';
import type { CarrierProfile } from '../../../../lib/tarifas/parties';

interface Params {
  organizationId: string;
  form: TesterForm;
  templates: Record<string, unknown>[];
  setTemplates: (rows: Record<string, unknown>[]) => void;
  carriers: CarrierProfile[];
  calculo: Calculo | null;
  setError: (message: string) => void;
}

export function useTesterScenario({ organizationId, form, templates, setTemplates, carriers, calculo, setError }: Params) {
  const [guardando, setGuardando] = useState(false);
  const { escenarioId } = form;
  const result: CalcResult | null = calculo?.result ?? null;

  const escenario: TemplateScenario | null = useMemo(() => {
    const row = templates.find((t) => t.id === escenarioId);
    return row ? toScenario(row as never) : null;
  }, [templates, escenarioId]);

  const veredicto: ScenarioCheck | null = useMemo(
    () => (escenario && result ? checkScenario(escenario, result.totalLiquidado) : null),
    [escenario, result],
  );

  const aplicarEscenario = (id: string) => {
    form.setEscenarioId(id);
    const row = templates.find((t) => t.id === id);
    if (!row) return;

    const s = toScenario(row as never);
    // Un escenario guardado describe un viaje entero, no un viaje real: se carga en modo libre.
    form.setModo('libre');
    form.setCountryId(s.countryId || form.countryId);
    form.setLibre(libreFromScenarioTrip(s.trip, carriers));
    form.setDia(diaFromScenarioTrip(s.trip));

    const vars = customVarsAsText(s.trip);
    form.pendientes.current = vars;
    form.setCustomRaw((prev) => ({ ...prev, ...vars }));
  };

  /**
   * Fija el total actual como el esperado del escenario.
   *
   * Es deliberadamente un acto explícito: un total que se movió puede ser una mejora o una
   * regresión, y la única forma de distinguirlas es que alguien mire el número nuevo y lo acepte.
   */
  const fijarEsperado = async () => {
    if (!escenario || !result || !calculo) return;
    setGuardando(true);
    setError('');
    try {
      const fila = toTemplateRow({
        id: escenario.id,
        name: escenario.name,
        countryId: escenario.countryId,
        trip: calculo.trip,
        expectedTotal: result.totalLiquidado,
      });
      const { error: saveError } = await saveTemplate(organizationId, fila as never, escenario.id);
      if (saveError) { setError(saveError.message || 'No se pudo guardar el total esperado.'); return; }
      setTemplates(await listTemplates(organizationId) as Record<string, unknown>[]);
    } catch (e) {
      console.error('Error fijando el total esperado:', e);
      setError(mensajeDe(e, 'No se pudo guardar el total esperado.'));
    } finally {
      setGuardando(false);
    }
  };

  return { escenario, veredicto, aplicarEscenario, fijarEsperado, guardando };
}
