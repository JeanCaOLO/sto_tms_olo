import { apiFetch, STORAGE_KEY } from './supabase';

/**
 * Canjea el ID token de Google por la sesión del TMS (POST /api/auth/google) y la guarda
 * igual que el login con contraseña. Devuelve el mensaje de error, o null si entró.
 * Solo se aceptan correos @ologistics.com e @intelix.biz (lo valida el backend).
 */
export async function signInWithGoogle(credential: string): Promise<string | null> {
  try {
    const { ok, body } = await apiFetch('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) });
    if (!ok || !body?.data) return body?.message ?? body?.error?.message ?? 'No se pudo iniciar sesión con Google.';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(body.data));
    return null;
  } catch {
    return 'No se pudo iniciar sesión con Google. Revisa tu conexión.';
  }
}
