#!/usr/bin/env node
// mirror-gitlab.mjs — replica ramas y tags de GitHub -> GitLab Intelix.
// Multiplataforma (node). Corre en bucle hasta Ctrl+C.
//
//   pnpm pulling                  bucle infinito, sincroniza cada 5 min hasta Ctrl+C
//   pnpm pulling -- --every 10     idem, cada 10 min
//   pnpm pulling -- --once         una sola pasada (para cron / Task Scheduler)
//
//   git.intelix.biz es interno (10.57.9.222): SIN VPN esto no conecta, punto.
//   Los colaboradores sin VPN NO corren esto — pushean a GitHub y este job,
//   en algun equipo de la red con VPN, mantiene GitLab al dia.
//
// Como funciona: mantiene un clon --mirror bare en .mirror-gitlab/ (gitignored),
// hace fetch de GitHub y push de cada rama + tags a GitLab. GitHub `main` ->
// GitLab `master` (ver BRANCH_MAP); el resto conserva su nombre. Borra en GitLab
// las ramas que ya no existen en GitHub. No toca merge requests.
//
// Token: --token=... > $GITLAB_TOKEN > linea GITLAB_TOKEN=... de .env.local.
// GitLab: el default branch debe ser `master` (el que GitLab crea solo — ya esta).

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const GITLAB_REPO = 'https://git.intelix.biz/JesusAraujoDEV/sto-tms-olo.git';
const MIRROR_DIR = resolve('.mirror-gitlab/repo.git');
const BRANCH_MAP = { main: 'master' };   // renombre GitHub -> GitLab

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  const a = argv[i];
  return a.includes('=') ? a.split('=').slice(1).join('=') : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true);
};

const once = Boolean(flag('once'));
const everyMin = Number(flag('every')) || 5;

const sh = (a, opts = {}) => execFileSync('git', a, { encoding: 'utf8', ...opts }).trim();
const shIO = (a) => execFileSync('git', a, { stdio: 'inherit' });
const stamp = () => new Date().toLocaleTimeString();
const die = (m) => { console.error(`\x1b[31m✗ ${m}\x1b[0m`); process.exit(1); };

function envLocalToken() {
  if (!existsSync('.env.local')) return '';
  const l = readFileSync('.env.local', 'utf8').split('\n').find((x) => /^\s*GITLAB_TOKEN\s*=/.test(x));
  return l ? l.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : '';
}

process.chdir(sh(['rev-parse', '--show-toplevel']));

const tokenArg = flag('token');
const token = (typeof tokenArg === 'string' && tokenArg) || process.env.GITLAB_TOKEN || envLocalToken();
if (!token) die("Falta el token: 'GITLAB_TOKEN=glpat-...' en .env.local (o --token=... / $GITLAB_TOKEN).");

const githubUrl = sh(['remote', 'get-url', 'origin']);
const gitlabAuthUrl = GITLAB_REPO.replace('https://', `https://oauth2:${token}@`);

if (!existsSync(MIRROR_DIR)) {
  console.log('\x1b[36mclonando mirror de GitHub…\x1b[0m');
  mkdirSync(resolve('.mirror-gitlab'), { recursive: true });
  shIO(['clone', '--mirror', githubUrl, MIRROR_DIR]);
  shIO(['-C', MIRROR_DIR, 'remote', 'set-url', 'origin', githubUrl]);
}

// Una pasada. Lanza si algo falla; el bucle lo captura y reintenta.
function syncOnce() {
  sh(['-C', MIRROR_DIR, 'fetch', '--prune', 'origin',
    '+refs/heads/*:refs/heads/*', '+refs/tags/*:refs/tags/*']);

  const heads = sh(['-C', MIRROR_DIR, 'for-each-ref', '--format=%(refname:short)', 'refs/heads'])
    .split('\n').filter(Boolean);
  if (heads.includes('master') && BRANCH_MAP.main === 'master') {
    throw new Error('GitHub tiene `main` y `master` a la vez — el renombre colisiona. Ajusta BRANCH_MAP.');
  }

  const headSpecs = heads.map((b) => `+refs/heads/${b}:refs/heads/${BRANCH_MAP[b] ?? b}`);
  sh(['-C', MIRROR_DIR, 'push', '--prune', gitlabAuthUrl, ...headSpecs, '+refs/tags/*:refs/tags/*']);

  // podar en GitLab lo que ya no existe en GitHub (--prune no aplica con refspecs explicitos)
  const wanted = new Set(heads.map((b) => BRANCH_MAP[b] ?? b));
  const gitlabHeads = sh(['ls-remote', '--heads', gitlabAuthUrl])
    .split('\n').filter(Boolean).map((l) => l.split('refs/heads/')[1]);
  const stale = gitlabHeads.filter((b) => !wanted.has(b));
  if (stale.length) {
    sh(['-C', MIRROR_DIR, 'push', gitlabAuthUrl, ...stale.map((b) => `:refs/heads/${b}`)]);
  }

  const mapped = heads.map((b) => (BRANCH_MAP[b] ? `${b}→${BRANCH_MAP[b]}` : b)).join(', ');
  return { mapped, pruned: stale };
}

if (once) {
  try {
    const r = syncOnce();
    console.log(`\x1b[32m✓ ${r.mapped}${r.pruned.length ? `  (podado: ${r.pruned.join(', ')})` : ''}\x1b[0m`);
  } catch (e) {
    die(e.message + '\n  ¿VPN conectada? ¿token valido?');
  }
} else {
  console.log(`\x1b[36mmirror GitHub -> GitLab cada ${everyMin} min. Ctrl+C para parar.\x1b[0m`);
  process.on('SIGINT', () => { console.log('\n\x1b[36mdetenido.\x1b[0m'); process.exit(0); });
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const r = syncOnce();
      console.log(`\x1b[32m[${stamp()}] ✓ ${r.mapped}${r.pruned.length ? `  podado: ${r.pruned.join(', ')}` : ''}\x1b[0m`);
    } catch (e) {
      console.warn(`\x1b[33m[${stamp()}] ! ${e.message.split('\n')[0]} — reintento en ${everyMin} min\x1b[0m`);
    }
    await sleep(everyMin * 60_000);
  }
}
