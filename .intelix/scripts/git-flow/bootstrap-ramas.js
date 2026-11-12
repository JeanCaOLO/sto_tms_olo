#!/usr/bin/env node
/*
 * bootstrap-ramas.js
 *
 * Capa 1 (local, ejecutable) del gobierno de ramas GitFlow adaptado INTELIX.
 * Prepara el arbol de ramas permanentes de un proyecto que parte de la
 * plantilla template_base y, opcionalmente, crea la rama efimera de trabajo
 * del colaborador con la nomenclatura de commit-rules.md / branching-rules.md.
 *
 * NO configura protecciones ni permisos: eso vive en el servidor GitLab y lo
 * cubre la capa 2 (scripts/git-flow/configurar-gitlab.js -> comandos curl).
 * Este script solo hace operaciones git locales + push, que es lo unico que
 * un clon puede hacer sin token de administrador.
 *
 * Modelo de ramas (nombres en ingles, confirmados por el equipo):
 *   master   -> produccion   (protegida en GitLab)
 *   qa       -> calidad       (protegida en GitLab)
 *   develop  -> integracion   (protegida en GitLab)
 *   feature/<id>-<slug>  nace de develop
 *   bugfix/<id>-<slug>   nace de develop
 *   hotfix/<id>-<slug>   nace de master
 *   release/vX.Y.Z       nace de develop
 *
 * SEGURIDAD: por defecto corre en DRY-RUN (solo imprime lo que haria). Para
 * ejecutar de verdad hay que pasar --apply. El push nunca es automatico: se
 * hace solo con --push (y respeta el remoto configurado).
 *
 * Uso:
 *   node scripts/git-flow/bootstrap-ramas.js init            (dry-run del arbol)
 *   node scripts/git-flow/bootstrap-ramas.js init --apply    (crea master/qa/develop)
 *   node scripts/git-flow/bootstrap-ramas.js init --apply --push
 *   node scripts/git-flow/bootstrap-ramas.js branch --tipo feature --id ISSUE-45 --desc "login" --apply
 *   node scripts/git-flow/bootstrap-ramas.js branch --tipo hotfix  --id PROD-12 --desc "fuga memoria" --apply
 *   node scripts/git-flow/bootstrap-ramas.js status
 *   node scripts/git-flow/bootstrap-ramas.js --json <cmd>
 *
 * Flags:
 *   --apply     ejecuta de verdad (sin el, dry-run)
 *   --push      empuja las ramas creadas al remoto (solo con --apply)
 *   --remote    nombre del remoto (por defecto: origin)
 *   --base      rama base para 'init' (por defecto: la rama actual)
 *   --json      salida en JSON
 *
 * Codigos de salida:
 *   0  ok
 *   1  error de uso o de git
 *   2  precondicion no cumplida (no es repo, remoto ausente, etc.)
 */

'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

// Ramas permanentes en orden de promocion (dev -> qa -> prod).
const RAMAS_PERMANENTES = ['develop', 'qa', 'master'];

// Tipos de rama efimera y su rama origen obligatoria (branching-rules.md).
const TIPOS_RAMA = {
  feature: { origen: 'develop', patron: 'feature/' },
  bugfix: { origen: 'develop', patron: 'bugfix/' },
  hotfix: { origen: 'master', patron: 'hotfix/' },
  release: { origen: 'develop', patron: 'release/' },
};

// --- Utilidades ---

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') opts.apply = true;
    else if (a === '--push') opts.push = true;
    else if (a === '--json') opts.json = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      opts[key] = val;
    } else opts._.push(a);
  }
  return opts;
}

function git(args, opts) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    ...(opts || {}),
  }).trim();
}

function gitSeguro(args) {
  try {
    return { ok: true, out: git(args) };
  } catch (e) {
    return { ok: false, err: (e.stderr || e.message || '').toString().trim() };
  }
}

function esRepo() {
  const r = gitSeguro(['rev-parse', '--is-inside-work-tree']);
  return r.ok && r.out === 'true';
}

function ramaActual() {
  const r = gitSeguro(['rev-parse', '--abbrev-ref', 'HEAD']);
  return r.ok ? r.out : null;
}

function ramasLocales() {
  const r = gitSeguro(['branch', '--format=%(refname:short)']);
  return r.ok ? r.out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
}

function tieneRemoto(remote) {
  const r = gitSeguro(['remote']);
  return r.ok && r.out.split(/\r?\n/).map((s) => s.trim()).includes(remote);
}

// Normaliza el slug de la descripcion para el nombre de rama.
function slug(texto) {
  return String(texto || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// --- Planificacion (dry-run) ---

// Devuelve la lista de pasos {desc, args} para crear el arbol permanente.
function planInit(base, remote, hacerPush) {
  const locales = ramasLocales();
  const pasos = [];

  for (const rama of RAMAS_PERMANENTES) {
    if (locales.includes(rama)) {
      pasos.push({ desc: `rama '${rama}' ya existe localmente (se omite)`, args: null });
      continue;
    }
    // master normalmente ya existe; develop/qa se crean desde base.
    pasos.push({
      desc: `crear rama '${rama}' desde '${base}'`,
      args: ['branch', rama, base],
    });
  }

  if (hacerPush) {
    for (const rama of RAMAS_PERMANENTES) {
      pasos.push({
        desc: `push -u ${remote} ${rama}`,
        args: ['push', '-u', remote, rama],
      });
    }
  }

  return pasos;
}

function planBranch(tipo, id, desc, remote, hacerPush) {
  const cfg = TIPOS_RAMA[tipo];
  const nombre = `${cfg.patron}${id}-${slug(desc)}`.replace(/-+$/, '');
  const pasos = [
    { desc: `checkout '${cfg.origen}' (rama origen de ${tipo})`, args: ['checkout', cfg.origen] },
    { desc: `pull ${remote} ${cfg.origen} (traer ultimo)`, args: ['pull', remote, cfg.origen], opcional: true },
    { desc: `crear y cambiar a '${nombre}'`, args: ['checkout', '-b', nombre] },
  ];
  if (hacerPush) {
    pasos.push({ desc: `push -u ${remote} ${nombre}`, args: ['push', '-u', remote, nombre] });
  }
  return { nombre, origen: cfg.origen, pasos };
}

// --- Ejecucion de un plan ---

function ejecutar(pasos, apply) {
  const resultados = [];
  for (const paso of pasos) {
    if (!paso.args) {
      resultados.push({ desc: paso.desc, estado: 'omitido' });
      continue;
    }
    if (!apply) {
      resultados.push({ desc: paso.desc, estado: 'dry-run', comando: 'git ' + paso.args.join(' ') });
      continue;
    }
    const r = gitSeguro(paso.args);
    if (r.ok) {
      resultados.push({ desc: paso.desc, estado: 'ok' });
    } else if (paso.opcional) {
      resultados.push({ desc: paso.desc, estado: 'aviso', detalle: r.err });
    } else {
      resultados.push({ desc: paso.desc, estado: 'error', detalle: r.err });
      return { resultados, fallo: true };
    }
  }
  return { resultados, fallo: false };
}

// --- Comandos ---

function cmdInit(opts) {
  if (!esRepo()) return { exit: 2, error: 'No es un repositorio git.' };
  const remote = opts.remote || 'origin';
  const base = opts.base || ramaActual();
  if (!base) return { exit: 2, error: 'No se pudo determinar la rama base.' };
  if (opts.push && !tieneRemoto(remote)) {
    return { exit: 2, error: `El remoto '${remote}' no existe. Configura el remoto o no uses --push.` };
  }

  const pasos = planInit(base, remote, opts.push);
  const { resultados, fallo } = ejecutar(pasos, opts.apply);
  return {
    exit: fallo ? 1 : 0,
    comando: 'init',
    apply: !!opts.apply,
    base,
    remote,
    ramas_permanentes: RAMAS_PERMANENTES,
    pasos: resultados,
    nota: opts.apply
      ? 'Ramas locales listas. La proteccion en GitLab la aplica configurar-gitlab.js (capa 2).'
      : 'DRY-RUN: nada se ejecuto. Repite con --apply para crear las ramas.',
  };
}

function cmdBranch(opts) {
  if (!esRepo()) return { exit: 2, error: 'No es un repositorio git.' };
  const tipo = String(opts.tipo || '').toLowerCase();
  if (!TIPOS_RAMA[tipo]) {
    return { exit: 1, error: `Tipo invalido '${tipo}'. Validos: ${Object.keys(TIPOS_RAMA).join(', ')}.` };
  }
  if (!opts.id || opts.id === true) {
    return { exit: 1, error: 'Falta --id <ID-TICKET> (ej. ISSUE-45, PROD-12).' };
  }
  if (!opts.desc || opts.desc === true) {
    return { exit: 1, error: 'Falta --desc "<descripcion corta>".' };
  }
  const remote = opts.remote || 'origin';
  if (opts.push && !tieneRemoto(remote)) {
    return { exit: 2, error: `El remoto '${remote}' no existe. Configura el remoto o no uses --push.` };
  }
  const locales = ramasLocales();
  const cfg = TIPOS_RAMA[tipo];
  if (!locales.includes(cfg.origen)) {
    return {
      exit: 2,
      error: `La rama origen '${cfg.origen}' no existe localmente. Ejecuta primero 'init' o traela del remoto.`,
    };
  }

  const { nombre, origen, pasos } = planBranch(tipo, opts.id, opts.desc, remote, opts.push);
  const { resultados, fallo } = ejecutar(pasos, opts.apply);
  return {
    exit: fallo ? 1 : 0,
    comando: 'branch',
    apply: !!opts.apply,
    tipo,
    rama: nombre,
    origen,
    remote,
    pasos: resultados,
    nota: opts.apply
      ? `Rama '${nombre}' lista. Trabaja aqui y abre un Merge Request hacia '${origen}'.`
      : `DRY-RUN: se crearia '${nombre}' desde '${origen}'. Repite con --apply.`,
  };
}

function cmdStatus() {
  if (!esRepo()) return { exit: 2, error: 'No es un repositorio git.' };
  const locales = ramasLocales();
  const faltantes = RAMAS_PERMANENTES.filter((r) => !locales.includes(r));
  return {
    exit: 0,
    comando: 'status',
    rama_actual: ramaActual(),
    ramas_permanentes: RAMAS_PERMANENTES.map((r) => ({
      rama: r,
      existe_local: locales.includes(r),
    })),
    faltan: faltantes,
    listo: faltantes.length === 0,
    nota:
      faltantes.length === 0
        ? 'El arbol de ramas permanentes esta completo localmente.'
        : `Faltan ramas: ${faltantes.join(', ')}. Ejecuta 'init --apply'.`,
  };
}

// --- Presentacion ---

function imprimir(res, opts) {
  if (opts.json) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }
  if (res.error) {
    console.error('ERROR: ' + res.error);
    return;
  }
  if (res.comando === 'status') {
    console.log('Rama actual: ' + res.rama_actual);
    console.log('Ramas permanentes (dev -> qa -> prod):');
    res.ramas_permanentes.forEach((r) =>
      console.log(`  ${r.existe_local ? '[x]' : '[ ]'} ${r.rama}`)
    );
    console.log('\n' + res.nota);
    return;
  }
  console.log(`Comando: ${res.comando}  (${res.apply ? 'APPLY' : 'DRY-RUN'})`);
  if (res.rama) console.log(`Rama de trabajo: ${res.rama}  (origen: ${res.origen})`);
  if (res.base) console.log(`Base: ${res.base}  Remoto: ${res.remote}`);
  console.log('Pasos:');
  res.pasos.forEach((p) => {
    const marca =
      p.estado === 'ok' ? 'OK ' :
      p.estado === 'error' ? 'ERR' :
      p.estado === 'aviso' ? '!! ' :
      p.estado === 'omitido' ? '-- ' : '   ';
    console.log(`  [${marca}] ${p.desc}` + (p.comando ? `  =>  ${p.comando}` : '') + (p.detalle ? `  (${p.detalle})` : ''));
  });
  console.log('\n' + res.nota);
}

// --- Runner ---

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cmd = opts._[0] || 'status';

  if (opts.help || opts.h) {
    console.log(
      'Uso:\n' +
        '  node scripts/git-flow/bootstrap-ramas.js init [--apply] [--push] [--base <rama>] [--remote origin]\n' +
        '  node scripts/git-flow/bootstrap-ramas.js branch --tipo <feature|bugfix|hotfix|release> --id <ID> --desc "<texto>" [--apply] [--push]\n' +
        '  node scripts/git-flow/bootstrap-ramas.js status\n\n' +
        'Sin --apply todo es DRY-RUN. master/qa/develop son las ramas permanentes.'
    );
    process.exit(0);
  }

  let res;
  switch (cmd) {
    case 'init': res = cmdInit(opts); break;
    case 'branch': res = cmdBranch(opts); break;
    case 'status': res = cmdStatus(); break;
    default:
      console.error(`Comando no reconocido: ${cmd}. Use: init | branch | status.`);
      process.exit(1);
  }

  imprimir(res, opts);
  process.exit(res.exit || 0);
}

main();
