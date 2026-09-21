// Crea un usuario directo en tms_olo (Aurora PostgreSQL), sin pasar por la API HTTP
// (evita el problema de huevo-y-gallina de necesitar ya una sesión de admin).
// Uso: node --env-file=.env.local scripts/create-dev-user.mjs <email> <password> "<full name>"
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const [, , email, password, fullName] = process.argv;
if (!email || !password || !fullName) {
  console.error('Usage: node --env-file=.env.local scripts/create-dev-user.mjs <email> <password> "<full name>"');
  process.exit(1);
}

const db = new pg.Client({
  host: process.env.TMS_DB_HOST || 'localhost',
  port: Number(process.env.TMS_DB_PORT) || 5432,
  user: process.env.TMS_DB_USER,
  password: process.env.TMS_DB_PASSWORD,
  database: process.env.TMS_DB_NAME || 'tms_olo',
  ssl: { rejectUnauthorized: false },
});
await db.connect();

const { rows: [org] } = await db.query('SELECT id FROM organizations LIMIT 1');
const { rows: [role] } = await db.query("SELECT id FROM roles WHERE name = 'SuperUsuario' LIMIT 1");
if (!org || !role) {
  console.error('No se encontró organización u rol SuperUsuario en tms_olo.');
  process.exit(1);
}

const authUserId = randomUUID();
const passwordHash = await bcrypt.hash(password, 10);

await db.query(
  'INSERT INTO auth_credentials (auth_user_id, email, password_hash) VALUES ($1, $2, $3)',
  [authUserId, email.toLowerCase(), passwordHash],
);
await db.query(
  `INSERT INTO app_users (auth_user_id, organization_id, full_name, email, role_id)
   VALUES ($1, $2, $3, $4, $5)`,
  [authUserId, org.id, fullName, email, role.id],
);

console.log('Usuario creado. Login con:', email, '/', password);
await db.end();
