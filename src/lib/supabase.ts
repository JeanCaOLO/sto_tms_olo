// Cliente propio (fetch + JWT) contra nuestra API en /api/data y /api/auth
// (server/tms-routes.mjs), que a su vez habla con Aurora PostgreSQL en AWS.
// Mantiene el mismo shape de respuesta ({ data, error }) y la misma forma de
// encadenar `.from(table).select().eq()...` que supabase-js, para no tener que
// tocar los call-sites existentes. No hay ninguna dependencia de Supabase acá.

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthSession {
  access_token: string;
  token_type: "bearer";
  user: AuthUser;
}

type AuthChangeEvent = "SIGNED_IN" | "SIGNED_OUT";
type AuthListener = (event: AuthChangeEvent, session: AuthSession | null) => void;

const STORAGE_KEY = "tms_session";

function readSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(session: AuthSession | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage no disponible (SSR/preview) — la sesión simplemente no persiste
  }
}

const listeners = new Set<AuthListener>();
function notify(event: AuthChangeEvent, session: AuthSession | null) {
  listeners.forEach((cb) => cb(event, session));
}

// Vacío en dev (Vite proxya /api). En build apunta al API Gateway del backend
// Lambda (backend/common-services, output ApiUrl). Sin barra final.
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export async function apiFetch(path: string, init: RequestInit = {}) {
  const current = readSession();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (current?.access_token) headers.set("Authorization", `Bearer ${current.access_token}`);
  const res = await fetch(`${API_BASE}/api${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

type Filter = [string, string, unknown];
interface PgError {
  message: string;
  code?: string;
}
interface PgResult {
  data: any;
  error: PgError | null;
  count?: number;
}

class QueryBuilder implements PromiseLike<PgResult> {
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private selectStr = "*";
  private filters: Filter[] = [];
  private orderSpec: { column: string; ascending: boolean } | null = null;
  private limitVal: number | null = null;
  private singleMode: "single" | "maybeSingle" | null = null;
  private wantCount: string | null = null;
  private headOnly = false;
  private insertValues: unknown = null;
  private updateValues: Record<string, unknown> | null = null;
  private wantReturning = false;

  constructor(private table: string) {}

  select(columns: string = "*", opts?: { count?: string; head?: boolean }) {
    if (this.mode !== "select") {
      this.wantReturning = true;
      return this;
    }
    this.selectStr = columns;
    if (opts?.count) this.wantCount = opts.count;
    if (opts?.head) this.headOnly = true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, "eq", value]);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push([column, "neq", value]);
    return this;
  }
  gt(column: string, value: unknown) {
    this.filters.push([column, "gt", value]);
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push([column, "gte", value]);
    return this;
  }
  lt(column: string, value: unknown) {
    this.filters.push([column, "lt", value]);
    return this;
  }
  lte(column: string, value: unknown) {
    this.filters.push([column, "lte", value]);
    return this;
  }
  is(column: string, value: null) {
    this.filters.push([column, "is", value]);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push([column, "in", values]);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orderSpec = { column, ascending: opts?.ascending !== false };
    return this;
  }

  limit(n: number) {
    this.limitVal = n;
    return this;
  }

  single() {
    this.singleMode = "single";
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this;
  }

  insert(values: unknown) {
    this.mode = "insert";
    this.insertValues = values;
    return this;
  }

  update(values: Record<string, unknown>) {
    this.mode = "update";
    this.updateValues = values;
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  private async exec(): Promise<PgResult> {
    try {
      if (this.mode === "insert") {
        const { ok, body } = await apiFetch(`/data/${this.table}`, {
          method: "POST",
          body: JSON.stringify({ values: this.insertValues, returning: this.wantReturning }),
        });
        if (!ok) return { data: null, error: body?.error ?? { message: "Error al insertar" } };
        return { data: body.data, error: null };
      }
      if (this.mode === "update") {
        const { ok, body } = await apiFetch(`/data/${this.table}`, {
          method: "PATCH",
          body: JSON.stringify({ values: this.updateValues, filters: this.filters, returning: this.wantReturning }),
        });
        if (!ok) return { data: null, error: body?.error ?? { message: "Error al actualizar" } };
        return { data: body.data, error: null };
      }
      if (this.mode === "delete") {
        const { ok, body } = await apiFetch(`/data/${this.table}`, {
          method: "DELETE",
          body: JSON.stringify({ filters: this.filters, returning: this.wantReturning }),
        });
        if (!ok) return { data: null, error: body?.error ?? { message: "Error al eliminar" } };
        return { data: body.data, error: null };
      }

      const params = new URLSearchParams();
      params.set("select", this.selectStr);
      if (this.filters.length) params.set("filters", JSON.stringify(this.filters));
      if (this.orderSpec) params.set("order", JSON.stringify(this.orderSpec));
      if (this.limitVal != null) params.set("limit", String(this.limitVal));
      if (this.headOnly) params.set("head", "true");
      if (this.wantCount) params.set("count", this.wantCount);
      if (this.singleMode === "single") params.set("single", "true");
      if (this.singleMode === "maybeSingle") params.set("maybeSingle", "true");

      const { ok, body } = await apiFetch(`/data/${this.table}?${params.toString()}`);
      if (!ok) return { data: null, error: body?.error ?? { message: "Error al consultar" } };
      return { data: body.data, error: null, count: body.count };
    } catch (err: any) {
      return { data: null, error: { message: err?.message ?? "Error de red" } };
    }
  }

  then<TResult1 = PgResult, TResult2 = never>(
    onfulfilled?: ((value: PgResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }
}

const auth = {
  async getSession(): Promise<{ data: { session: AuthSession | null }; error: PgError | null }> {
    const current = readSession();
    if (!current) return { data: { session: null }, error: null };
    const { ok } = await apiFetch("/auth/session");
    if (!ok) {
      writeSession(null);
      return { data: { session: null }, error: null };
    }
    return { data: { session: current }, error: null };
  },

  onAuthStateChange(callback: AuthListener) {
    listeners.add(callback);
    return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
  },

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const { ok, body } = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!ok) {
      return { data: { session: null, user: null }, error: body?.error ?? { message: "Error al iniciar sesión" } };
    }
    const session: AuthSession = body.data;
    writeSession(session);
    notify("SIGNED_IN", session);
    return { data: { session, user: session.user }, error: null };
  },

  async signOut() {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => null);
    writeSession(null);
    notify("SIGNED_OUT", null);
    return { error: null };
  },

  async getUser() {
    const current = readSession();
    return { data: { user: current?.user ?? null }, error: null };
  },

  async signUp({
    email,
    password,
  }: {
    email: string;
    password: string;
    options?: { data?: Record<string, unknown> };
  }) {
    const { ok, body } = await apiFetch("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!ok) return { data: { user: null }, error: body?.error ?? { message: "Error al crear usuario" } };
    return { data: { user: body.data.user }, error: null };
  },
};

export const supabase = {
  from(table: string) {
    return new QueryBuilder(table);
  },
  auth,
};
