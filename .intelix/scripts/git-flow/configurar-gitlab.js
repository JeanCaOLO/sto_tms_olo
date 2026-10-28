#!/usr/bin/env node
/*
 * configurar-gitlab.js
 *
 * Capa 2 (bloqueo por infraestructura GitLab) del gobierno de ramas INTELIX.
 * GENERA los comandos curl contra la API REST de GitLab para dejar el proyecto
 * con las protecciones que un clon local NO puede aplicar por si mismo:
 *   - Branch Protection (cero push directo a master/qa/develop)
 *   - Merge Request approval rules (minimo 1 aprobacion)
 *   - Merge method squash + auto-delete de rama origen
 *   - Push Rules de nomenclatura de rama y de mensaje de commit
 *
 * IMPORTANTE: este script NO ejecuta nada y NO contiene tokens. Solo imprime
 * los comandos para que el LIDER los ejecute con su PROJECT/PERSONAL ACCESS
 * TOKEN (scope `api`). Se corre asi, con el token fuera del historial de shell:
 *
 *   $env:GITLAB_URL   = "https://gitlab.tuempresa.com"
 *   $env:GITLAB_PROJECT = "grupo/mi-proyecto"     # o el ID numerico
 *   $env:GITLAB_TOKEN = "<tu token>"              # NUNCA lo pongas en el repo
 *   node scripts/git-flow/configurar-gitlab.js proteger
 *
 * Luego copias/pegas los curl que imprime (o los revisas antes de correrlos).
 * Cada curl usa la variable $GITLAB_TOKEN, no el valor literal.
 *
 * Mapeo de nombres (ingles <-> concepto del Reporte de Control de Versiones):
 *   master = produccion, qa = calidad, develop = desarrollo.
 *
 * Comandos:
 *   proteger      -> branch protection de master/qa/develop
 *   aprobaciones  -> approval rules (min 1) por rama
 *   mergerequest  -> merge method squash + remove_source_branch
 *   pushrules     -> regex de nomenclatura de rama y de commit
 *   todo          -> imprime todo lo anterior en orden
 *   permisos      -> imprime (informativo) la matriz de roles a aplicar en la UI
 *
 * Flags: --json (emite un plan estructurado en vez de los curl en texto).
 */

'use strict';

// Nombres de rama permanentes (ingles). master es la de mayor proteccion.
const RAMAS = {
  master: { concepto: 'produccion', push: 'no one', merge: 'maintainer', aprob: 1 },
  qa: { concepto: 'calidad', push: 'no one', merge: 'maintainer', aprob: 1 },
  develop: { concepto: 'desarrollo', push: 'no one', merge: 'developer', aprob: 1 },
};

// Niveles de acceso GitLab (API access_level): 0 no one, 30 developer, 40 maintainer.
const ACCESS = { 'no one': 0, developer: 30, maintainer: 40 };

// Regex de nomenclatura de rama (branching-rules.md) y de commit (commit-rules.md).
const REGEX_RAMA = '^(master|qa|develop|feature\\/|bugfix\\/|hotfix\\/|release\\/)';
const REGEX_COMMIT = '^(feat|fix|docs|style|refactor|test|chore)(\\(.+\\))?: .+';

function parseArgs(argv) {
  const opts = { _: [] };
  for (const a of argv) {
    if (a === '--json') opts.json = true;
    else if (!a.startsWith('--')) opts._.push(a);
  }
  return opts;
}

// Base curl reutilizable. Usa las variables de entorno por NOMBRE (no el valor),
// para que el token nunca quede impreso ni en el historial.
function api(pathTpl, method, campos) {
  const m = method ? `--request ${method} ` : '';
  const datos = (campos || [])
    .map((c) => `  --data "${c}"`)
    .join(' \\\n');
  const url = '"$GITLAB_URL/api/v4/projects/$GITLAB_PROJECT_ENC/' + pathTpl + '"';
  return (
    'curl --fail --silent --show-error ' + m + '\\\n' +
    '  --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \\\n' +
    (datos ? datos + ' \\\n' : '') +
    '  ' + url
  );
}

function bloque(titulo, comandos) {
  return `# --- ${titulo} ---\n` + comandos.join('\n\n');
}

function cabecera() {
  return [
    '# Requiere estas variables (no dejes el token en el repo ni en el historial):',
    '#   PowerShell:  $env:GITLAB_URL="https://gitlab.tuempresa.com"; $env:GITLAB_PROJECT="grupo/proyecto"; $env:GITLAB_TOKEN="***"',
    '#   Bash:        export GITLAB_URL=... GITLAB_PROJECT=grupo/proyecto GITLAB_TOKEN=***',
    '# El PROJECT debe ir URL-encoded (grupo%2Fproyecto) o ser el ID numerico:',
    '#   PowerShell:  $env:GITLAB_PROJECT_ENC=[uri]::EscapeDataString($env:GITLAB_PROJECT)',
    '#   Bash:        GITLAB_PROJECT_ENC=$(python3 -c "import urllib.parse,os;print(urllib.parse.quote(os.environ[\'GITLAB_PROJECT\'],safe=\'\'))")',
    '',
  ].join('\n');
}

function cmdProteger() {
  const comandos = Object.entries(RAMAS).map(([rama, cfg]) =>
    api('protected_branches', 'POST', [
      `name=${rama}`,
      `push_access_level=${ACCESS[cfg.push]}`,
      `merge_access_level=${ACCESS[cfg.merge]}`,
      'allow_force_push=false',
    ]) + `   # ${rama} = ${cfg.concepto}: push ${cfg.push}, merge ${cfg.merge}`
  );
  return bloque('Branch Protection (cero push directo)', comandos);
}

function cmdAprobaciones() {
  const comandos = Object.entries(RAMAS).map(([rama, cfg]) =>
    '# ' + rama + ` (${cfg.concepto}): exigir ${cfg.aprob} aprobacion(es) en MR hacia esta rama\n` +
    api('approval_rules', 'POST', [
      `name=regla-${rama}`,
      `approvals_required=${cfg.aprob}`,
      // protected_branch_ids se resuelve tras crear la proteccion; se deja como recordatorio.
    ]) + '   # nota: asocia esta regla a la rama protegida (protected_branch_ids) en la UI o segunda llamada'
  );
  return bloque('Merge Request Approval Rules (minimo 1 aprobacion)', comandos);
}

function cmdMergeRequest() {
  const comandos = [
    api('', 'PUT', [
      'merge_method=ff', // fast-forward; usar 'merge' si se prefiere merge commit
      'squash_option=default_on', // squash por defecto para features/bugfix
      'remove_source_branch_after_merge=true', // auto-delete de rama efimera (B9)
      'only_allow_merge_if_pipeline_succeeds=true', // no merge si falla CI
      'only_allow_merge_if_all_discussions_are_resolved=true',
    ]),
  ];
  return bloque('Merge Request settings (squash + auto-delete + gates)', comandos);
}

function cmdPushRules() {
  const comandos = [
    api('push_rule', 'POST', [
      `branch_name_regex=${REGEX_RAMA}`,
      `commit_message_regex=${REGEX_COMMIT}`,
      'prevent_secrets=true',
    ]) + '   # rechaza ramas mal nombradas, commits no semanticos y archivos con secretos',
  ];
  return bloque('Push Rules (nomenclatura de rama + commit + secretos)', comandos);
}

function textoPermisos() {
  return [
    '# --- Matriz de permisos por rol (aplicar en GitLab > Manage > Members) ---',
    '# No hay API simple 1:1; se asigna el rol del proyecto a cada miembro:',
    '#   Developer  (colaboradores)     : push a feature/*, solo MR hacia develop',
    '#   Maintainer (lider tecnico)     : aprobar/merge en develop, qa; MR hacia master',
    '#   Reporter   (QA)                : lectura; validar/MR hacia qa',
    '#   Owner/Admin(DevOps)            : admin CI/CD; aprobar/tag en master',
    '# El acceso del colaborador (invitarlo como Developer) tambien se hace aqui.',
  ].join('\n');
}

function planJson() {
  return {
    mapeo: Object.fromEntries(Object.entries(RAMAS).map(([r, c]) => [r, c.concepto])),
    protecciones: Object.entries(RAMAS).map(([rama, cfg]) => ({
      rama,
      concepto: cfg.concepto,
      push_access_level: ACCESS[cfg.push],
      merge_access_level: ACCESS[cfg.merge],
      approvals_required: cfg.aprob,
      allow_force_push: false,
    })),
    merge_request: {
      merge_method: 'ff',
      squash_option: 'default_on',
      remove_source_branch_after_merge: true,
      only_allow_merge_if_pipeline_succeeds: true,
      only_allow_merge_if_all_discussions_are_resolved: true,
    },
    push_rules: {
      branch_name_regex: REGEX_RAMA,
      commit_message_regex: REGEX_COMMIT,
      prevent_secrets: true,
    },
    advertencia:
      'Este plan describe la configuracion objetivo. Aplicarla requiere un token con scope api del lider; ' +
      'este script solo genera los comandos, no ejecuta ni almacena el token.',
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cmd = opts._[0] || 'todo';

  if (opts.json) {
    console.log(JSON.stringify(planJson(), null, 2));
    process.exit(0);
  }

  const partes = [];
  const push = () => {};
  switch (cmd) {
    case 'proteger': partes.push(cabecera(), cmdProteger()); break;
    case 'aprobaciones': partes.push(cabecera(), cmdAprobaciones()); break;
    case 'mergerequest': partes.push(cabecera(), cmdMergeRequest()); break;
    case 'pushrules': partes.push(cabecera(), cmdPushRules()); break;
    case 'permisos': partes.push(textoPermisos()); break;
    case 'todo':
      partes.push(
        cabecera(),
        cmdProteger(),
        '',
        cmdAprobaciones(),
        '',
        cmdMergeRequest(),
        '',
        cmdPushRules(),
        '',
        textoPermisos()
      );
      break;
    default:
      console.error(`Comando no reconocido: ${cmd}. Use: proteger | aprobaciones | mergerequest | pushrules | permisos | todo [--json].`);
      process.exit(1);
  }
  console.log(partes.join('\n'));
  process.exit(0);
}

main();
