import { useEffect, useState } from 'react';
import type { CostStructure } from '../../../lib/tarifas/types';

interface Meta {
  name: string;
  operatingDaysPerMonth: number;
}

export function useCostMeta(structure: CostStructure | null) {
  const [meta, setMeta] = useState<Meta>({
    name: 'Estructura de costos',
    operatingDaysPerMonth: 30,
  });

  useEffect(() => {
    if (structure) {
      setMeta({
        name: structure.name,
        operatingDaysPerMonth: structure.operatingDaysPerMonth,
      });
    }
  }, [structure]);

  return [meta, setMeta] as const;
}
