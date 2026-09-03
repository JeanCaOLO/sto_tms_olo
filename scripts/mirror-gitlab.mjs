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
// hace fetch de GitHub y push de refs/heads/* + refs/tags/* a GitLab con --prune
// (rama borrada en GitHub -> borrada en GitLab). Cada rama va a la del mismo
// nombre. No toca merge requests ni nada mas de GitLab.
//
// Token: --token=... > $GITLAB_TOKEN > linea GITLAB_TOKEN=... de .env.local.
//
// Setup una vez en GitLab: Settings -> Repository -> Default branch -> `main`
// (para que `master`, la rama fantasma que crea GitLab al iniciar el repo, se
// pueda podar en la primera corrida).

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

const githubUrl = sh(['remote', 'get-url', 'origin']);           // reusa la auth del colaborador
const gitlabAuthUrl = GITLAB_REPO.replace('https://', `https://oauth2:${token}@`);
const REFSPECS = ['+refs/heads/*:refs/heads/*', '+refs/tags/*:refs/tags/*'];

if (!existsSync(MIRROR_DIR)) {
  console.log('\x1b[36mclonando mirror de GitHub…\x1b[0m');
  mkdirSync(resolve('.mirror-gitlab'), { recursive: true });
  shIO(['clone', '--mirror', githubUrl, MIRROR_DIR]);
}

shIO(['-C', MIRROR_DIR, 'remote', 'set-url', 'origin', githubUrl]);
shIO(['-C', MIRROR_DIR, 'fetch', '--prune', 'origin', ...REFSPECS]);

const ramas = sh(['-C', MIRROR_DIR, 'for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n');
console.log(`\x1b[36mramas -> GitLab:\x1b[0m ${ramas.join(', ')}`);

try {
  shIO(['-C', MIRROR_DIR, 'push', '--prune', gitlabAuthUrl, ...REFSPECS]);
} catch {
  // El --prune falla si intenta borrar la rama default de GitLab (p.ej. `master`
  // fantasma). Reintenta sin podar para no bloquear la sync.
  console.warn('\x1b[33m! --prune fallo (¿rama default de GitLab sin migrar a `main`?). Reintento sin podar.\x1b[0m');
  try {
    shIO(['-C', MIRROR_DIR, 'push', gitlabAuthUrl, ...REFSPECS]);
  } catch {
    die('Push a GitLab fallo. ¿VPN conectada? ¿token valido?');
  }
}

console.log('\x1b[32m✓ GitLab sincronizado con GitHub\x1b[0m');
