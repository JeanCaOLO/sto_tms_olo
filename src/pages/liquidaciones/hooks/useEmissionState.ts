// State for settlement emission (notes, status, validation, emit function).

import { useState } from 'react';
import { emitNew, reliquidate } from '../api/liquidacionesApi';
import { emptyReturn, validateReturn } from '../../../lib/tarifas/returnsNote';
import type { SettlementReturn, SettlementStatus, SettlementRecord } from '../../../lib/tarifas/types';

interface Props {
  reliquidando: boolean;
  settlement: SettlementRecord | null;
}

export function useEmissionState({ reliquidando, settlement }: Props) {
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<SettlementStatus>('Borrador');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [returns, setReturns] = useState<SettlementReturn[]>([]);

  const validateForm = (returnsToValidate: SettlementReturn[]): boolean => {
    for (const d of returnsToValidate) {
      const errs = validateReturn(d);
      if (Object.keys(errs).length > 0) {
        setError(Object.values(errs).join(' '));
        return false;
      }
    }
    if (reliquidando && !reason.trim()) {
      setError('Indicá por qué se re-liquida el viaje.');
      return false;
    }
    return true;
  };

  const emit = async (input: Parameters<typeof emitNew>[0]) => {
    setSaving(true);
    try {
      const result = settlement
        ? await reliquidate(settlement.id, input, reason.trim())
        : await emitNew(input);

      if (result.status === 'blocked') {
        setError(result.issues.map((i) => i.message).join(' '));
        return null;
      }
      if (result.status === 'invalid') {
        setError(Object.values(result.errors).join(' '));
        return null;
      }
      if (result.status === 'failed') {
        setError(result.error.message);
        return null;
      }
      return result.settlement;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo emitir la liquidación.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const initFromSettlement = (s: SettlementRecord | null) => {
    setNotes(s?.notes ?? '');
    setStatus('Borrador');
    setReason('');
    setReturns(s?.returns ?? []);
  };

  return {
    notes,
    setNotes,
    status,
    setStatus,
    reason,
    setReason,
    error,
    setError,
    saving,
    returns,
    setReturns,
    validateForm,
    emit,
    initFromSettlement,
  };
}
