import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { tmsQuery } from "./tms-db.mjs";
import { HttpError } from "./tms-schema.mjs";

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = "7d";

function requireSecret() {
  if (!JWT_SECRET) throw new Error("Falta JWT_SECRET en .env.local");
}

function signSession(authUserId, email) {
  requireSecret();
  const access_token = jwt.sign({ sub: authUserId, email }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  return { access_token, token_type: "bearer", user: { id: authUserId, email } };
}

// Middleware: exige un JWT válido en `Authorization: Bearer <token>`.
export function requireAuth(req, res, next) {
  requireSecret();
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "no_token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.authUser = { id: payload.sub, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}

export async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) throw new HttpError(400, "email y password son requeridos");

  const { rows } = await tmsQuery(
    "SELECT auth_user_id, email, password_hash FROM auth_credentials WHERE email = $1",
    [String(email).toLowerCase()]
  );
  const cred = rows[0];
  if (!cred || !(await bcrypt.compare(password, cred.password_hash))) {
    return res.status(401).json({ error: "invalid_credentials", message: "Correo o contraseña incorrectos." });
  }
  res.json({ data: signSession(cred.auth_user_id, cred.email), error: null });
}

// Equivalente a supabase.auth.signUp: crea la credencial (no crea el app_user;
// eso lo hace el llamador, igual que en el flujo original de UserModal).
export async function signUp(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) throw new HttpError(400, "email y password son requeridos");
  if (String(password).length < 6) throw new HttpError(400, "La contraseña debe tener al menos 6 caracteres");

  const normalizedEmail = String(email).toLowerCase();
  const existing = await tmsQuery("SELECT 1 FROM auth_credentials WHERE email = $1", [normalizedEmail]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "email_exists", message: "Ya existe un usuario con ese correo." });
  }

  const authUserId = randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  await tmsQuery(
    "INSERT INTO auth_credentials (auth_user_id, email, password_hash) VALUES ($1, $2, $3)",
    [authUserId, normalizedEmail, passwordHash]
  );
  res.json({ data: { user: { id: authUserId, email: normalizedEmail } }, error: null });
}

export function session(req, res) {
  res.json({ data: { user: req.authUser }, error: null });
}

export function signOut(_req, res) {
  res.status(204).end();
}
