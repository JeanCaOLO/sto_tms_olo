import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

// Mapa código de zona (zones.code, = orders.delivery_zone / ruta del WMS) → nombre
// de zona. Planificación agrupa por el CÓDIGO (delivery_zone), pero para mostrar
// usa el nombre legible ("Casco Central" en vez de "01"). Ver CANAL.md: Claude
// confirmó que delivery_zone === zones.code.
export function useZonasNombre() {
  const [porCodigo, setPorCodigo] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase
      .from('zones')
      .select('code, name')
      .then(({ data }) => {
        if (!data) return;
        const mapa: Record<string, string> = {};
        for (const z of data as { code: string | null; name: string }[]) {
          if (z.code) mapa[z.code] = z.name;
        }
        setPorCodigo(mapa);
      });
  }, []);

  // Nombre de la zona para un código; si no hay match, devuelve el código tal cual.
  const nombreDe = (codigo: string): string => porCodigo[codigo] ?? codigo;

  return { nombreDe };
}
