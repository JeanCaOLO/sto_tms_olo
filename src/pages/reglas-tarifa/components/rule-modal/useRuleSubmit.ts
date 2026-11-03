// Envío del modal de reglas. La secuencia (validar, perfil de la compañía, guardar, auditar) está en ruleSubmitFlow.

import { useState, type FormEvent } from 'react';
import { runRuleSubmit } from './ruleSubmitFlow';
import type { SubmitContext } from './ruleSubmitSteps';

export function useRuleSubmit(c: SubmitContext) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErrorMsg('');
    const result = await runRuleSubmit(c, setLoading);
    if (result.error) setErrorMsg(result.error);
    if (result.saved) { c.onSuccess(); c.onClose(); }
  };

  return { handleSubmit, loading, errorMsg, setErrorMsg };
}
