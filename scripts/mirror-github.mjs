#!/usr/bin/env node
// mirror-github.mjs — replica ramas y tags de GitLab Intelix -> GitHub.
// Inverso de `pnpm pulling`. Multiplataforma (node). Corre en bucle hasta Ctrl+C.
//
//   pnpm pushing                  bucle infinito, sincroniza cada 5 min hasta Ctrl+C
//   pnpm pushing -- --every 10    idem, cada 10 min
//   pnpm pushing -- --once        una sola pasada (para cron / Task Scheduler)
//   pnpm pushing -- --prune       además borra en GitHub las ramas que ya no están en GitLab
//
//   git.intelix.biz es interno (10.57.9.222): SIN VPN esto no conecta. Este job
//   corre en un equipo con VPN y mantiene GitHub al día con lo que se desarrolla
//   en GitLab (la fuente de verdad).
//
// SOURCE (GitLab):  https://git.intelix.biz/olo/tms/TMS-Frontend.git
// DEST   (GitHub):  git@github.com:JeanCaOLO/sto_tms_olo.git  (SSH; override con $GITHUB_REMOTE)
//
// Como funciona: mantiene un clon --mirror bare de GitLab en .mirror-github/
// (gitignored), hace fetch de GitLab y push de cada rama + tags a GitHub. Ambos
// usan `main` (BRANCH_MAP vacío = 1:1). Con --prune borra en GitHub lo que ya no
// está en GitLab. No toca PRs.
//
// Auth GitLab: $GITLAB_TOKEN (PAT) si existe; si no, OAuth con GITLAB_USER +
//   GITLAB_PASSWORD (de .env.local o ../TMS-Backend/.env). El token OAuth se
//   regenera en cada pasada (caduca ~2h), así el bucle largo no se rompe.
// Auth GitHub: por SSH (llave del equipo) o $GITHUB_TOKEN por HTTPS.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { request } from 'node:https';
import { setTimeout as sleep } from 'node:timers/promises';

const GITLAB_HOST = 'git.intelix.biz';
const GITLAB_REPO = `https://${GITLAB_HOST}/olo/tms/TMS-Frontend.git`;
const GITHUB_REPO = process.env.GITHUB_REMOTE || 'git@github.com:JeanCaOLO/sto_tms_olo.git';
const MIRROR_DIR = resolve('.mirror-github/repo.git');
const BRANCH_MAP = {}; // GitLab -> GitHub (1:1; ambos usan `main`)

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  const a = argv[i];
  return a.includes('=') ? a.split('=').slice(1).join('=') : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true);
};

const once = Boolean(flag('once'));
const prune = Boolean(flag('prune'));
const everyMin = Number(flag('every')) || 5;

const sh = (a, opts = {}) => execFileSync('git', a, { encoding: 'utf8', ...opts }).trim();
const shIO = (a) => execFileSync('git', a, { stdio: 'inherit' });
const stamp = () => new Date().toLocaleTimeString();
const die = (m) => { console.error(`\x1b[31m✗ ${m}\x1b[0m`); process.exit(1); };

// --- env: lee .env.local (frontend) y ../TMS-Backend/.env, sin pisar process.env
function loadEnv() {
  const env = { ...process.env };
  for (const f of ['.env.local', resolve('..', 'TMS-Backend', '.env')]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return env;
}
const ENV = loadEnv();

// --- token de GitLab: PAT directo, o OAuth (password grant) que se regenera
function oauthToken(user, pass) {
  const body = JSON.stringify({ grant_type: 'password', username: user, password: pass });
  return new Promise((res, rej) => {
    const req = request(
      { host: GITLAB_HOST, path: '/oauth/token', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        rejectUnauthorized: false },
      (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => {
        try { const j = JSON.parse(d); j.access_token ? res(j.access_token) : rej(new Error(`OAuth ${r.statusCode}: ${j.error_description || j.error || d.slice(0, 80)}`)); }
        catch { rej(new Error(`OAuth ${r.statusCode}: respuesta no-JSON`)); }
      }); });
    req.on('error', rej); req.write(body); req.end();
  });
}

async function gitlabToken() {
  if (ENV.GITLAB_TOKEN) return ENV.GITLAB_TOKEN; // PAT: no caduca
  if (ENV.GITLAB_USER && ENV.GITLAB_PASSWORD) return oauthToken(ENV.GITLAB_USER, ENV.GITLAB_PASSWORD);
  die('Faltan credenciales de GitLab: define GITLAB_TOKEN (PAT) o GITLAB_USER + GITLAB_PASSWORD en .env.local o ../TMS-Backend/.env.');
}

process.chdir(sh(['rev-parse', '--show-toplevel']));

// GitHub por HTTPS si hay $GITHUB_TOKEN; si no, tal cual (SSH).
const githubUrl = ENV.GITHUB_TOKEN && GITHUB_REPO.startsWith('git@')
  ? GITHUB_REPO.replace('git@github.com:', `https://x-access-token:${ENV.GITHUB_TOKEN}@github.com/`)
  : (ENV.GITHUB_TOKEN && GITHUB_REPO.startsWith('https://'))
    ? GITHUB_REPO.replace('https://', `https://x-access-token:${ENV.GITHUB_TOKEN}@`)
    : GITHUB_REPO;

// Una pasada. Lanza si algo falla; el bucle lo captura y reintenta.
async function syncOnce() {
  const token = await gitlabToken();
  const gitlabAuthUrl = GITLAB_REPO.replace('https://', `https://oauth2:${token}@`);

  if (!existsSync(MIRROR_DIR)) {
    mkdirSync(resolve('.mirror-github'), { recursive: true });
    shIO(['clone', '--mirror', gitlabAuthUrl, MIRROR_DIR]);
  }

  sh(['-C', MIRROR_DIR, 'fetch', '--prune', gitlabAuthUrl,
    '+refs/heads/*:refs/heads/*', '+refs/tags/*:refs/tags/*']);

  const heads = sh(['-C', MIRROR_DIR, 'for-each-ref', '--format=%(refname:short)', 'refs/heads'])
    .split('\n').filter(Boolean);
  const headSpecs = heads.map((b) => `+refs/heads/${b}:refs/heads/${BRANCH_MAP[b] ?? b}`);
  sh(['-C', MIRROR_DIR, 'push', githubUrl, ...headSpecs, '+refs/tags/*:refs/tags/*']);

  let stale = [];
  if (prune) {
    const wanted = new Set(heads.map((b) => BRANCH_MAP[b] ?? b));
    const ghHeads = sh(['ls-remote', '--heads', githubUrl])
      .split('\n').filter(Boolean).map((l) => l.split('refs/heads/')[1]);
    stale = ghHeads.filter((b) => !wanted.has(b));
    if (stale.length) sh(['-C', MIRROR_DIR, 'push', githubUrl, ...stale.map((b) => `:refs/heads/${b}`)]);
  }
  return { mapped: heads.map((b) => (BRANCH_MAP[b] ? `${b}→${BRANCH_MAP[b]}` : b)).join(', '), pruned: stale };
}

if (once) {
  try {
    const r = await syncOnce();
    console.log(`\x1b[32m✓ ${r.mapped}${r.pruned.length ? `  (podado en GitHub: ${r.pruned.join(', ')})` : ''}\x1b[0m`);
  } catch (e) {
    die(e.message.split('\n')[0] + '\n  ¿VPN conectada? ¿credenciales GitLab válidas? ¿acceso SSH/token a GitHub?');
  }
} else {
  console.log(`\x1b[36mmirror GitLab -> GitHub cada ${everyMin} min${prune ? ' (con prune)' : ''}. Ctrl+C para parar.\x1b[0m`);
  process.on('SIGINT', () => { console.log('\n\x1b[36mdetenido.\x1b[0m'); process.exit(0); });
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const r = await syncOnce();
      console.log(`\x1b[32m[${stamp()}] ✓ ${r.mapped}${r.pruned.length ? `  podado: ${r.pruned.join(', ')}` : ''}\x1b[0m`);
    } catch (e) {
      console.warn(`\x1b[33m[${stamp()}] ! ${e.message.split('\n')[0]} — reintento en ${everyMin} min\x1b[0m`);
    }
    await sleep(everyMin * 60_000);
  }
}
