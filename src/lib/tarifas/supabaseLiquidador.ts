// Cliente Supabase SEPARADO del resto del TMS (src/lib/supabase.ts), a propósito.
//
// Apunta a un proyecto de Supabase TEMPORAL, exclusivo para desarrollo/pruebas del prototipo del
// módulo Liquidador — datos simulados, no el TMS real. Cuando exista el backend/BD definitivo
// (pendiente de alta prioridad, ver docs/superpowers/specs/ y el plan de fases del Liquidador),
// este archivo es el único punto que hay que cambiar; nada del resto de `src/lib/tarifas/` importa
// Supabase directamente.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_LIQUIDADOR_SUPABASE_URL;
const anonKey = import.meta.env.VITE_LIQUIDADOR_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Faltan las variables de entorno del Supabase temporal del Liquidador '
    + '(VITE_LIQUIDADOR_SUPABASE_URL / VITE_LIQUIDADOR_SUPABASE_ANON_KEY).',
  );
}

export const supabaseLiquidador = createClient(url, anonKey);
