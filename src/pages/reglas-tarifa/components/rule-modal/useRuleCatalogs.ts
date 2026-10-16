// Catálogos que necesita el modal de reglas: compañías, tarifarios del país y variables de la compañía.

import { useEffect, useMemo, useState } from 'react';
import { VAR_KEY_LABELS } from '../../../../lib/tarifas/format';
import { listCarrierProfiles } from '../../../../lib/tarifas/partiesDataSource';
import { labelsOf, listPartyVariables } from '../../../../lib/tarifas/partyVariablesDataSource';
import { listRateTables } from '../../../../lib/tarifas/rateTablesDataSource';
import type { CarrierProfile } from '../../../../lib/tarifas/parties';
import type { PartyVariable, RateTable } from '../../../../lib/tarifas/types';

const BUILTIN_NUMERIC_VARS = [
  'km', 'clientCount', 'weightKg', 'durationHours', 'truckVolumeM3', 'truckWeightTons', 'overnightNights', 'weekday',
] as const;

const builtinLabel = (key: string) => VAR_KEY_LABELS[key as keyof typeof VAR_KEY_LABELS] ?? key;
const ownOption = (v: PartyVariable) => ({ value: v.key as string, label: `${v.label} (propia)` });

export function useRuleCatalogs(
  isOpen: boolean,
  countryId: string | undefined,
  scope: string,
  formPartyId: string,
) {
  const [parties, setParties] = useState<CarrierProfile[]>([]);
  const [carrierPick, setCarrierPick] = useState<string | null>(null);
  const [partyVariables, setPartyVariables] = useState<PartyVariable[]>([]);
  const [rateTables, setRateTables] = useState<RateTable[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setCarrierPick(null);
    void listCarrierProfiles({ includeInactive: true }).then(setParties).catch(() => setParties([]));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !countryId) { setRateTables([]); return; }
    void listRateTables(countryId).then(setRateTables).catch(() => setRateTables([]));
  }, [isOpen, countryId]);

  useEffect(() => {
    if (!isOpen || scope !== 'PARTY' || !formPartyId) { setPartyVariables([]); return; }
    void listPartyVariables(formPartyId).then(setPartyVariables).catch(() => setPartyVariables([]));
  }, [isOpen, scope, formPartyId]);

  const selectedCarrierId = carrierPick
    ?? parties.find((p) => p.partyId && p.partyId === formPartyId)?.carrierId
    ?? '';
  const customLabels = useMemo(() => labelsOf(partyVariables), [partyVariables]);

  const numericVarOptions = useMemo(() => [
    ...BUILTIN_NUMERIC_VARS.map((v) => ({ value: v as string, label: builtinLabel(v) })),
    ...partyVariables.filter((v) => v.kind === 'NUMBER').map(ownOption),
  ], [partyVariables]);

  const allVarOptions = useMemo(() => [
    ...Object.keys(VAR_KEY_LABELS).map((v) => ({ value: v, label: builtinLabel(v) })),
    ...partyVariables.map(ownOption),
  ], [partyVariables]);

  return {
    parties, carrierPick, setCarrierPick, selectedCarrierId,
    partyVariables, rateTables, customLabels, numericVarOptions, allVarOptions,
  };
}
