import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

// Un chunk lazy que ya no existe (deploy nuevo con la pestaña vieja abierta) falla con estos mensajes.
const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|Loading chunk .* failed/i;

export function isChunkLoadError(error: unknown): boolean {
  return error instanceof Error && CHUNK_ERROR.test(error.message);
}

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Evita la pantalla en blanco: un error de render o un chunk lazy caído muestra una salida de
// recuperación en vez de desmontar toda la app. Sin i18n a propósito: no debe depender de nada
// que pueda ser justo lo que falló.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale = isChunkLoadError(error);
    return (
      <div role="alert" className="flex flex-col items-center justify-center h-[70vh] text-center px-4">
        <div className="w-16 h-16 flex items-center justify-center bg-red-50 rounded-2xl mb-5">
          <i className="ri-error-warning-line text-3xl text-red-500"></i>
        </div>
        <h1 className="text-2xl font-bold text-slate-800">
          {stale ? 'Hay una versión nueva de la aplicación' : 'Algo salió mal'}
        </h1>
        <p className="mt-2 text-sm text-slate-500 max-w-md">
          {stale
            ? 'Recarga la página para cargar la versión más reciente.'
            : 'Ocurrió un error inesperado en esta pantalla. Recarga la página; si persiste, avisa a soporte.'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 cursor-pointer"
        >
          Recargar
        </button>
      </div>
    );
  }
}
