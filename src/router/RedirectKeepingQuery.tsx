import { Navigate, useLocation } from 'react-router-dom';

interface Props {
  to: string;
  /** Parámetros que fija la ruta antigua (p. ej. `flota=propia`); mandan sobre los que traiga la dirección. */
  params?: Record<string, string>;
}

/**
 * Redirección de una ruta antigua que conserva los parámetros de la dirección (`?regla=…`, filtros) y agrega los que
 * la ruta antigua implicaba. Un `<Navigate to="…">` simple los descartaba.
 */
export default function RedirectKeepingQuery({ to, params = {} }: Props) {
  const { search } = useLocation();
  const query = new URLSearchParams(search);
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  const suffix = query.toString();
  return <Navigate to={suffix ? `${to}?${suffix}` : to} replace />;
}
