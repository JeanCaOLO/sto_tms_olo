#!/usr/bin/env node
// mirror-gitlab.mjs — replica TODAS las ramas y tags de GitHub -> GitLab Intelix.
// Pensado para correr en bucle (cron / Task Scheduler) en una maquina de Intelix
// siempre prendida y con la VPN conectada. Multiplataforma (node).
//
//   node scripts/mirror-gitlab.mjs        (o: pnpm pulling)
//
//   git.intelix.biz es interno (10.57.9.222): SIN VPN esto no conecta, punto.
//   Los colaboradores sin VPN NO corren esto — pushean a GitHub y este job,
//   en algun equipo de la red, mantiene GitLab al dia.
//
// Como funciona: mantiene un clon --mirror bare en .mirror-gitlab/ (gitignored),
// hace fetch de GitHub y push de cada rama + tags a GitLab con --prune (rama
// borrada en GitHub -> borrada en GitLab). GitHub `main` -> GitLab `master`
// (ver BRANCH_MAP); el resto conserva su nombre. No toca merge requests.
//
// Token: --token=... > $GITLAB_TOKEN > linea GITLAB_TOKEN=... de .env.local.
//
// GitLab: el default branch debe ser `master` (el que GitLab crea solo — ya
// esta). La rama `main` que haya quedado de pruebas anteriores se poda sola.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const GITLAB_REPO = 'https://git.intelix.biz/JesusAraujoDEV/sto-tms-olo.git';
const MIRROR_DIR = resolve('.mirror-gitlab/repo.git');

const tokenArg = process.argv.slice(2).find((a) => a.startsWith('--token='))?.slice(8);

const sh = (a, opts = {}) => execFileSync('git', a, { encoding: 'utf8', ...opts }).trim();
const shIO = (a) => execFileSync('git', a, { stdio: 'inherit' });
const die = (m) => { console.error(`\x1b[31m✗ ${m}\x1b[0m`); process.exit(1); };

function envLocalToken() {
  if (!existsSync('.env.local')) return '';
  const l = readFileSync('.env.local', 'utf8').split('\n').find((x) => /^\s*GITLAB_TOKEN\s*=/.test(x));
  return l ? l.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : '';
}

process.chdir(sh(['rev-parse', '--show-toplevel']));

const token = tokenArg || process.env.GITLAB_TOKEN || envLocalToken();
if (!token) die("Falta el token: 'GITLAB_TOKEN=glpat-...' en .env.local (o --token=... / $GITLAB_TOKEN).");

// Renombre de ramas GitHub -> GitLab. GitLab usa `master` como default; GitHub
// usa `main`. El resto de ramas conservan su nombre.
const BRANCH_MAP = { main: 'master' };

const githubUrl = sh(['remote', 'get-url', 'origin']);           // reusa la auth del colaborador
const gitlabAuthUrl = GITLAB_REPO.replace('https://', `https://oauth2:${token}@`);

if (!existsSync(MIRROR_DIR)) {
  console.log('\x1b[36mclonando mirror de GitHub…\x1b[0m');
  mkdirSync(resolve('.mirror-gitlab'), { recursive: true });
  shIO(['clone', '--mirror', githubUrl, MIRROR_DIR]);
}

shIO(['-C', MIRROR_DIR, 'remote', 'set-url', 'origin', githubUrl]);
shIO(['-C', MIRROR_DIR, 'fetch', '--prune', 'origin',
  '+refs/heads/*:refs/heads/*', '+refs/tags/*:refs/tags/*']);

const heads = sh(['-C', MIRROR_DIR, 'for-each-ref', '--format=%(refname:short)', 'refs/heads'])
  .split('\n').filter(Boolean);
if (heads.includes('master') && BRANCH_MAP.main === 'master') {
  die('GitHub tiene `main` y `master` a la vez — el renombre main->master colisiona. Ajusta BRANCH_MAP.');
}

// refspec explicito por rama (aplicando el renombre) + wildcard de tags.
const headSpecs = heads.map((b) => `+refs/heads/${b}:refs/heads/${BRANCH_MAP[b] ?? b}`);
console.log(`\x1b[36mGitHub -> GitLab:\x1b[0m ${heads.map((b) => (BRANCH_MAP[b] ? `${b}→${BRANCH_MAP[b]}` : b)).join(', ')}`);

try {
  shIO(['-C', MIRROR_DIR, 'push', '--prune', gitlabAuthUrl, ...headSpecs, '+refs/tags/*:refs/tags/*']);
} catch {
  die('Push a GitLab fallo. ¿VPN conectada? ¿token valido? ' +
      'Si dice "cannot delete the default branch", el default de GitLab debe ser `master` (o el destino del map).');
}

// Podar ramas de GitLab que ya no existen en GitHub. --prune no actua con
// refspecs explicitos (necesita glob), asi que las borramos a mano.
const wanted = new Set(heads.map((b) => BRANCH_MAP[b] ?? b));
const gitlabHeads = sh(['ls-remote', '--heads', gitlabAuthUrl])
  .split('\n').filter(Boolean).map((l) => l.split('refs/heads/')[1]);
const stale = gitlabHeads.filter((b) => !wanted.has(b));
if (stale.length) {
  console.log(`\x1b[33mpodando en GitLab:\x1b[0m ${stale.join(', ')}`);
  try {
    shIO(['-C', MIRROR_DIR, 'push', gitlabAuthUrl, ...stale.map((b) => `:refs/heads/${b}`)]);
  } catch {
    console.warn('\x1b[33m! no se pudo borrar alguna rama (¿es la default de GitLab?)\x1b[0m');
  }
}

console.log('\x1b[32m✓ GitLab sincronizado con GitHub\x1b[0m');
