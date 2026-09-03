#!/usr/bin/env node
// pull-gitlab.mjs — replica una rama de este repo a GitLab de Intelix.
// Multiplataforma: `node scripts/pull-gitlab.mjs` corre igual en bash, zsh,
// PowerShell o cmd. Solo necesita git + node y la VPN de Intelix.
//
//   git.intelix.biz vive en la red interna (10.57.9.222). Este comando SOLO
//   funciona con la VPN conectada. El token NO reemplaza la VPN — sin red hacia
//   git.intelix.biz el push hace timeout, tengas token o no. Colaboradores que
//   estan solo en GitHub y no tienen VPN NO corren esto; el mirror lo haria un
//   runner/cron dentro de la red.
//
// Token, en orden: --token=... > $GITLAB_TOKEN > linea GITLAB_TOKEN=... de
// .env.local (gitignored — NUNCA en .env, que se commitea).
//
// Setup (una vez): en .env.local agrega
//   GITLAB_TOKEN=glpat-xxxxxxxx        # rol Developer+, scope write_repository
//
// Uso:
//   node scripts/pull-gitlab.mjs                        # rama actual -> misma rama
//   node scripts/pull-gitlab.mjs --target master        # rama actual -> master en GitLab
//   node scripts/pull-gitlab.mjs --branch qa --target master
//   pnpm mirror:gitlab -- --target master               # via package.json
//
// Los commits llegan con su autor/fecha originales de GitHub — git los preserva.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const GITLAB_REPO = 'https://git.intelix.biz/JesusAraujoDEV/sto-tms-olo.git';

// Acepta --key=value y --key value.
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const m = argv[i].match(/^--([^=]+)(?:=(.*))?$/);
  if (!m) continue;
  if (m[2] !== undefined) args[m[1]] = m[2];
  else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[m[1]] = argv[++i];
  else args[m[1]] = true;
}

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const gitIO = (...a) => execFileSync('git', a, { stdio: 'inherit' });
const die = (msg) => {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(1);
};

// --- resolver token -------------------------------------------------------
function envLocalToken() {
  if (!existsSync('.env.local')) return null;
  const line = readFileSync('.env.local', 'utf8')
    .split('\n')
    .find((l) => /^\s*GITLAB_TOKEN\s*=/.test(l));
  return line ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : null;
}

process.chdir(git('rev-parse', '--show-toplevel'));

const str = (v) => (typeof v === 'string' && v ? v : null);
const token = str(args.token) || process.env.GITLAB_TOKEN || envLocalToken();
if (!token) {
  die("Falta el token: agrega 'GITLAB_TOKEN=glpat-...' en .env.local (o pasa --token=... / $GITLAB_TOKEN).");
}

const branch = str(args.branch) || git('rev-parse', '--abbrev-ref', 'HEAD');
const target = str(args.target) || branch;
const authUrl = GITLAB_REPO.replace('https://', `https://oauth2:${token}@`);

console.log(`\x1b[36m${branch} (local)  ->  ${target} (GitLab Intelix)\x1b[0m`);

// 1. sincronizar con GitHub y no subir algo atrasado
gitIO('fetch', 'origin', '--tags', '--prune');
let behind = '0';
try {
  behind = git('rev-list', '--count', `HEAD..origin/${branch}`);
} catch {
  /* la rama puede no existir aun en origin */
}
if (Number(behind) > 0) {
  die(`Tu ${branch} local va ${behind} commit(s) detras de origin/${branch}. Haz 'git pull' y reintenta.`);
}
gitIO('push', 'origin', branch); // GitHub primero (no-op si ya esta al dia)

// 2. empujar a GitLab. --force: GitLab es copia downstream de GitHub; si alguien
//    commitea directo alla se sobrescribe (esperado en un mirror de una via).
try {
  gitIO('push', authUrl, `${branch}:refs/heads/${target}`, '--force');
  gitIO('push', authUrl, 'refs/tags/*:refs/tags/*', '--force');
} catch {
  die('Push a GitLab fallo. Revisa: VPN conectada, token valido, y que master no este protegido contra force push.');
}

console.log(`\x1b[32m✓ ${target} en GitLab de Intelix\x1b[0m`);
