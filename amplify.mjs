#!/usr/bin/env node
// amplify.mjs — build + deploy manual del frontend a AWS Amplify (multiplataforma).
// Reemplaza a deploy-frontend.ps1. No arma zip: usa el flujo file-map de Amplify
// (crea el deployment con el md5 de cada archivo, sube cada archivo a su URL
// presignada y arranca el deploy), así no hay dependencias ni el bug de rutas
// con backslash del zip.
//
//   node amplify.mjs                       # build + deploy a la rama por defecto (dev)
//   node amplify.mjs --branch dev          # elige rama de Amplify
//   node amplify.mjs --no-mock             # login real (VITE_MOCK_AUTH=false)
//   node amplify.mjs --api https://.../dev # otra URL de backend
//   node amplify.mjs --skip-build          # usa el out/ ya construido
//
// Requisitos: sesión AWS activa del perfil (aws sso login --profile ...), Node 18+.

import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true;
  return def;
};
const flag = (name) => process.argv.includes(`--${name}`);

const APP_ID = arg('app-id', 'd200vkxzilg7v5');
const BRANCH = arg('branch', 'dev');
const REGION = arg('region', 'us-east-1');
const PROFILE = arg('profile', 'CP-Developers-IntMAY-484907500756');
const API_BASE = String(arg('api', 'https://fm2mrqtsu1.execute-api.us-east-1.amazonaws.com/dev')).replace(/\/$/, '');
const MOCK = flag('no-mock') ? 'false' : 'true';
const OUT = 'out';

const log = (m) => console.log(m);
const die = (m) => { console.error(`\x1b[31m✗ ${m}\x1b[0m`); process.exit(1); };

// aws CLI -> JSON, con perfil y región fijos.
function aws(args, { json = true } = {}) {
  const out = execFileSync('aws', [...args, '--region', REGION, '--profile', PROFILE, ...(json ? ['--output', 'json'] : [])],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return json ? JSON.parse(out || '{}') : out;
}

// Lista recursiva de archivos de out/ con su ruta POSIX relativa.
function walk(dir, base = dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, base, acc);
    else acc.push(relative(base, full).split(sep).join('/'));
  }
  return acc;
}

async function main() {
  if (!flag('skip-build')) {
    log(`>>> Build  (VITE_API_BASE=${API_BASE}, VITE_MOCK_AUTH=${MOCK})`);
    execSync('pnpm build', { stdio: 'inherit', env: { ...process.env, VITE_API_BASE: API_BASE, VITE_MOCK_AUTH: MOCK } });
  }

  const files = walk(OUT);
  if (files.length === 0) die(`out/ vacío — corre el build primero (sin --skip-build).`);
  const fileMap = Object.fromEntries(files.map((f) => [f, createHash('md5').update(readFileSync(join(OUT, f))).digest('hex')]));
  log(`>>> ${files.length} archivos a subir`);

  // La rama de Amplify debe existir.
  try { aws(['amplify', 'get-branch', '--app-id', APP_ID, '--branch-name', BRANCH]); }
  catch { log(`>>> Creando rama Amplify '${BRANCH}'`); aws(['amplify', 'create-branch', '--app-id', APP_ID, '--branch-name', BRANCH]); }

  log(`>>> create-deployment (${APP_ID} / ${BRANCH})`);
  const dep = aws(['amplify', 'create-deployment', '--app-id', APP_ID, '--branch-name', BRANCH,
    '--file-map', JSON.stringify(fileMap)]);
  const { jobId, fileUploadUrls } = dep;
  log(`    jobId: ${jobId}`);

  // Sube cada archivo a su URL presignada (PUT con los bytes, sin content-type).
  let n = 0;
  for (const [path, url] of Object.entries(fileUploadUrls)) {
    const res = await fetch(url, { method: 'PUT', body: readFileSync(join(OUT, path)) });
    if (!res.ok) die(`fallo subiendo ${path}: HTTP ${res.status}`);
    if (++n % 10 === 0 || n === files.length) log(`    subidos ${n}/${files.length}`);
  }

  log('>>> start-deployment');
  aws(['amplify', 'start-deployment', '--app-id', APP_ID, '--branch-name', BRANCH, '--job-id', String(jobId)]);

  process.stdout.write('>>> Esperando el deploy');
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    process.stdout.write('.');
    const { job } = aws(['amplify', 'get-job', '--app-id', APP_ID, '--branch-name', BRANCH, '--job-id', String(jobId)]);
    const status = job?.summary?.status;
    if (status === 'SUCCEED') { log(''); break; }
    if (['FAILED', 'CANCELLED'].includes(status)) die(`deploy ${status}`);
  }

  const url = `https://${BRANCH}.${APP_ID}.amplifyapp.com`;
  log(`\n\x1b[32mDeploy OK -> ${url}\x1b[0m`);
  try {
    const res = await fetch(url, { method: 'GET' });
    log(`  index.html: ${res.status}`);
  } catch { /* la propagación del CDN puede tardar unos segundos */ }
}

main().catch((e) => die(e.message || String(e)));
