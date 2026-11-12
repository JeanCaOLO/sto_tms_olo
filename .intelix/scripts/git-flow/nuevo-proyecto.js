#!/usr/bin/env node
/*
 * nuevo-proyecto.js
 *
 * Orquestador del flujo del MAINTAINER (lider) para arrancar un proyecto desde
 * la plantilla template_base. Encadena, en un solo paso guiado, lo que hoy esta
 * repartido en varios scripts:
 *
 *   1. Apunta el remoto 'origin' al repositorio nuevo de GitLab.
 *   2. Crea el arbol de ramas permanentes (master/qa/develop) delegando en
 *      scripts/git-flow/bootstrap-ramas.js.
 *   3. Hace el commit inicial del proyecto (si hay cambios en el working tree).
 *   4. Imprime los siguientes pasos: proteger ramas en GitLab (capa 2) e invitar
 *      a los miembros segun el cuadro de roles (docs/roles-y-accesos-gitlab.md).
 *
 * NO aplica protecciones ni invita miembros por si mismo (eso requiere el token
 * del lider y vive en configurar-gitlab.js / la UI de GitLab). Este script solo
 * hace operaciones git locales + push, que es lo unico que un clon puede hacer.
 *
 * SEGURIDAD: DRY-RUN por defecto (solo imprime lo que haria). Para ejecutar de
 * verdad hay que pasar --apply. El push solo ocurre con --push.
 *
 * Uso:
 *   node scripts/git-flow/nuevo-proyecto.js --nombre "mi-proyecto" --repo <url>              (dry-run)
 *   node scripts/git-flow/nuevo-proyecto.js --nombre "mi-proyecto" --repo <url> --apply --push
 *   node scripts/git-flow/nuevo-proyecto.js --nombre "mi-proyecto" --repo <url> --apply --push --json
 *
 * Flags:
 *   --nombre <n>   nombre del proyecto (para el mensaje del commit inicial)
 *   --crear-repo   crea el repo en GitLab por API antes de apuntar el remoto
 *   --grupo <g>    grupo/namespace donde crear el repo (por defecto: grupomayoreo)
 *   --visibilidad <v>  private|internal|public (por defecto: private)
 *   --repo <url>   URL del nuevo repositorio GitLab (se apunta 'origin' ahi)
 *   --remote <r>   nombre del remoto (por defecto: origin)
 *   --apply        ejecuta de verdad (sin el, dry-run)
 *   --push         empuja master/qa/develop al remoto (solo con --apply)
 *   --json         salida en JSON
 *
 * Codigos de salida: 0 ok | 1 error de uso/git | 2 precondicion no cumplida.
 */

"use strict";

const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const BOOTSTRAP = path.join(__dirname, "bootstrap-ramas.js");
const CONFIGURAR = path.join("scripts", "git-flow", "configurar-gitlab.js");
const DOC_ROLES = path.join("docs", "roles-y-accesos-gitlab.md");

// Configuracion de la API de GitLab para crear el repositorio (Paso 0).
const GITLAB_HOST = "https://git.intelix.biz";
const GRUPO_DEFAULT = "grupomayoreo";
const VISIBILIDAD_DEFAULT = "private";

// Palabras vacias (conectores) que se omiten al proponer el nombre corto.
const STOPWORDS = [
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "en",
  "y",
  "a",
  "con",
  "para",
  "por",
  "un",
  "una",
  "e",
  "o",
  "u",
  "al",
  "the",
  "of",
  "to",
];

// Normaliza un texto a slug valido de rama/proyecto (sin acentos ni espacios).
function slugify(texto, sep) {
  sep = sep || "-";
  return String(texto || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(sep);
}

// Palabras significativas (sin conectores) de un texto.
function palabrasClave(texto) {
  return slugify(texto, " ")
    .split(" ")
    .filter((w) => w && !STOPWORDS.includes(w));
}

// Propone variantes de nombre a partir de un texto libre.
function sugerirNombres(texto) {
  const claves = palabrasClave(texto);
  return {
    compacto: claves.join("-"), // sin conectores (recomendado)
    completo: slugify(texto, "-"), // todo, con guiones
    guion_bajo: claves.join("_"), // sin conectores, con guion_bajo
    siglas: claves.map((w) => w[0]).join(""),
  };
}

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") opts.apply = true;
    else if (a === "--push") opts.push = true;
    else if (a === "--json") opts.json = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const val =
        argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      opts[key] = val;
    } else opts._.push(a);
  }
  return opts;
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function gitSeguro(args) {
  try {
    return { ok: true, out: git(args) };
  } catch (e) {
    return { ok: false, err: (e.stderr || e.message || "").toString().trim() };
  }
}

function nodeScript(args) {
  try {
    const out = execFileSync("node", args, { cwd: ROOT, encoding: "utf8" });
    return { ok: true, out: out.trim() };
  } catch (e) {
    return {
      ok: false,
      err: (e.stderr || e.stdout || e.message || "").toString().trim(),
    };
  }
}

function esRepo() {
  const r = gitSeguro(["rev-parse", "--is-inside-work-tree"]);
  return r.ok && r.out === "true";
}

function remoteUrl(remote) {
  const r = gitSeguro(["remote", "get-url", remote]);
  return r.ok ? r.out : null;
}

// Propone la URL del repo nuevo reutilizando host/grupo del origin actual.
function sugerirRepoUrl(slug) {
  const url = remoteUrl("origin");
  if (!url || !slug) return null;
  const idx = url.lastIndexOf("/");
  return idx >= 0 ? url.slice(0, idx + 1) + slug + ".git" : null;
}

function treeSucio() {
  const r = gitSeguro(["status", "--porcelain"]);
  return r.ok && r.out.length > 0;
}

// --- API GitLab (Paso 0: crear repo) ---

// Ejecuta curl.exe (no el alias de PowerShell) y devuelve {ok, out|err}.
// Usa curl.exe por portabilidad: en Windows PowerShell 'curl' es Invoke-WebRequest.
function curlJson(args) {
  try {
    const out = execFileSync("curl.exe", args, { encoding: "utf8" });
    return { ok: true, out: out.trim() };
  } catch (e) {
    return {
      ok: false,
      err: (e.stderr || e.stdout || e.message || "").toString().trim(),
    };
  }
}

// Resuelve el namespace_id (ID numerico) de un grupo por su path (Opcion A robusta).
function resolverNamespaceId(grupo, token) {
  const url = `${GITLAB_HOST}/api/v4/groups/${encodeURIComponent(grupo)}`;
  const r = curlJson(["-s", "--header", `PRIVATE-TOKEN: ${token}`, url]);
  if (!r.ok) return { ok: false, err: r.err };
  try {
    const j = JSON.parse(r.out);
    if (j && typeof j.id === "number")
      return { ok: true, id: j.id, full_path: j.full_path };
    return {
      ok: false,
      err:
        j && j.message
          ? JSON.stringify(j.message)
          : "Respuesta inesperada del API de grupos",
    };
  } catch {
    return {
      ok: false,
      err: "No se pudo parsear la respuesta del API (¿token o URL invalidos?)",
    };
  }
}

// Paso 0: crea el repo en GitLab por API. Devuelve un registro para 'resultados'
// y, si tuvo exito, la URL http del repo creado para usarla como remoto.
function crearRepoApi(opts) {
  const grupo = opts.grupo && opts.grupo !== true ? opts.grupo : GRUPO_DEFAULT;
  const visibilidad =
    opts.visibilidad && opts.visibilidad !== true
      ? opts.visibilidad
      : VISIBILIDAD_DEFAULT;
  const nombre = opts.nombre && opts.nombre !== true ? opts.nombre : null;
  const token = process.env.GITLAB_TOKEN;

  if (!nombre) {
    return {
      registro: {
        desc: "crear repo por API",
        estado: "error",
        detalle: "Falta --nombre para nombrar el repo.",
      },
    };
  }
  if (!token) {
    return {
      registro: {
        desc: "crear repo por API",
        estado: "error",
        detalle:
          'Falta la variable de entorno GITLAB_TOKEN. Genera un Personal Access Token (scope api) y expórtalo: $env:GITLAB_TOKEN = "<token>"',
      },
    };
  }

  // DRY-RUN: mostrar los curl con el token ENMASCARADO, sin ejecutar nada real.
  if (!opts.apply) {
    const curlGrupo = `curl.exe -s --header "PRIVATE-TOKEN: ***" ${GITLAB_HOST}/api/v4/groups/${grupo}`;
    const curlCrear =
      `curl.exe -s --request POST --header "PRIVATE-TOKEN: ***" ` +
      `--data "name=${nombre}&path=${nombre}&namespace_id=<id-de-${grupo}>&visibility=${visibilidad}" ` +
      `${GITLAB_HOST}/api/v4/projects`;
    return {
      registro: {
        desc: `crear repo '${nombre}' en grupo '${grupo}' (${visibilidad}) por API`,
        estado: "dry-run",
        comando: curlGrupo + "  &&  " + curlCrear,
      },
    };
  }

  // APPLY: resolver namespace_id y crear el proyecto.
  const ns = resolverNamespaceId(grupo, token);
  if (!ns.ok) {
    return {
      registro: {
        desc: `resolver namespace_id de '${grupo}'`,
        estado: "error",
        detalle: ns.err,
      },
    };
  }
  const datos =
    `name=${encodeURIComponent(nombre)}&path=${encodeURIComponent(nombre)}` +
    `&namespace_id=${ns.id}&visibility=${visibilidad}&initialize_with_readme=false`;
  const r = curlJson([
    "-s",
    "--request",
    "POST",
    "--header",
    `PRIVATE-TOKEN: ${token}`,
    "--data",
    datos,
    `${GITLAB_HOST}/api/v4/projects`,
  ]);
  if (!r.ok) {
    return {
      registro: {
        desc: `crear repo '${nombre}' por API`,
        estado: "error",
        detalle: r.err,
      },
    };
  }
  try {
    const j = JSON.parse(r.out);
    if (j && j.http_url_to_repo) {
      return {
        repoUrl: j.http_url_to_repo,
        registro: {
          desc: `crear repo '${nombre}' en '${grupo}' (${visibilidad})`,
          estado: "ok",
          detalle: `creado: ${j.web_url || j.http_url_to_repo}`,
        },
      };
    }
    const msg =
      j && j.message
        ? JSON.stringify(j.message)
        : "Respuesta inesperada del API de proyectos";
    return {
      registro: {
        desc: `crear repo '${nombre}' por API`,
        estado: "error",
        detalle: msg,
      },
    };
  } catch {
    return {
      registro: {
        desc: `crear repo '${nombre}' por API`,
        estado: "error",
        detalle: "No se pudo parsear la respuesta del API de proyectos.",
      },
    };
  }
}

// --- Pasos ---

function ejecutarPasos(opts) {
  const remote = opts.remote || "origin";
  const resultados = [];
  const registrar = (desc, estado, extra) =>
    resultados.push(Object.assign({ desc, estado }, extra || {}));

  // Paso 0: crear el repo en GitLab por API (opcional, solo con --crear-repo).
  // Si tiene exito, la URL devuelta alimenta el Paso 1 (remoto).
  if (opts["crear-repo"]) {
    const res = crearRepoApi(opts);
    resultados.push(res.registro);
    if (res.repoUrl) {
      opts.repo = res.repoUrl; // usar el repo recien creado como remoto
    } else if (opts.apply && res.registro.estado === "error") {
      // En apply, si la creacion fallo, no continuar apuntando un remoto invalido.
      return { remote, resultados };
    }
  }

  // Paso 1: remoto
  if (opts.repo && opts.repo !== true) {
    const yaExiste = remoteUrl(remote) !== null;
    const args = yaExiste
      ? ["remote", "set-url", remote, opts.repo]
      : ["remote", "add", remote, opts.repo];
    if (!opts.apply) {
      registrar(`apuntar '${remote}' a ${opts.repo}`, "dry-run", {
        comando: "git " + args.join(" "),
      });
    } else {
      const r = gitSeguro(args);
      registrar(
        `apuntar '${remote}' a ${opts.repo}`,
        r.ok ? "ok" : "error",
        r.ok ? {} : { detalle: r.err },
      );
    }
  } else {
    registrar(`remoto '${remote}' sin cambios (no se paso --repo)`, "omitido");
  }

  // Paso 2: arbol de ramas (delegado a bootstrap-ramas.js)
  const bootArgs = [BOOTSTRAP, "init"];
  if (opts.apply) bootArgs.push("--apply");
  if (opts.push) bootArgs.push("--push");
  bootArgs.push("--remote", remote, "--json");
  const boot = nodeScript(bootArgs);
  let bootResumen = "ver salida de bootstrap-ramas.js";
  if (boot.ok) {
    try {
      const j = JSON.parse(boot.out);
      bootResumen = (j.pasos || [])
        .map((p) => `${p.estado}: ${p.desc}`)
        .join(" | ");
    } catch {
      /* deja el resumen por defecto */
    }
  }
  registrar(
    "crear/verificar arbol master/qa/develop",
    boot.ok ? (opts.apply ? "ok" : "dry-run") : "error",
    boot.ok ? { detalle: bootResumen } : { detalle: boot.err },
  );

  // Paso 3: commit inicial
  const nombre = opts.nombre && opts.nombre !== true ? opts.nombre : "proyecto";
  const msg = `chore: inicializa ${nombre} desde template_base IA-DLC`;
  if (!treeSucio()) {
    registrar(
      "commit inicial (working tree limpio, nada que commitear)",
      "omitido",
    );
  } else if (!opts.apply) {
    registrar(`commit inicial: "${msg}"`, "dry-run", {
      comando: `git add -A && git commit -m "${msg}"`,
    });
  } else {
    const add = gitSeguro(["add", "-A"]);
    if (!add.ok) {
      registrar("commit inicial (git add)", "error", { detalle: add.err });
    } else {
      const c = gitSeguro(["commit", "-m", msg]);
      registrar(
        `commit inicial: "${msg}"`,
        c.ok ? "ok" : "error",
        c.ok ? {} : { detalle: c.err },
      );
    }
  }

  return { remote, resultados };
}

function siguientesPasos(remote) {
  return [
    "SIGUIENTES PASOS (requieren el token del lider; no los hace este script):",
    "",
    "1) Proteger ramas y reglas de MR en GitLab (Capa 2). Exporta el token y ejecuta:",
    `   node ${CONFIGURAR} todo`,
    "   (imprime los curl de branch protection, approval rules, MR settings y push rules)",
    "",
    "2) Invitar miembros en GitLab > Manage > Members, segun el cuadro de roles:",
    `   - Developers del proyecto  -> rol Developer`,
    `   - Soluciones (SL)          -> rol Reporter (invitado de solo lectura)`,
    `   - Apoyo (BD)               -> solo si la tarea lo requiere`,
    `   Detalle de personas y usuarios: ${DOC_ROLES}`,
    "",
    "3) El dia a dia del colaborador (crear su rama de trabajo):",
    '   node scripts/git-flow/bootstrap-ramas.js branch --tipo feature --id ISSUE-XX --desc "..." --apply',
  ].join("\n");
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help || opts.h) {
    console.log(
      "Uso:\n" +
        '  node scripts/git-flow/nuevo-proyecto.js --sugerir "<texto libre>"          (propone nombres validos)\n' +
        '  node scripts/git-flow/nuevo-proyecto.js --nombre "<n>" --repo <url> [--apply] [--push] [--remote origin] [--json]\n\n' +
        "Sin --apply todo es DRY-RUN. Encadena: remoto -> ramas master/qa/develop -> commit inicial -> pasos GitLab.",
    );
    process.exit(0);
  }

  // Modo sugerencia de nombre: no toca nada, solo propone slugs validos.
  if (opts.sugerir) {
    const texto =
      opts.sugerir === true
        ? opts.nombre && opts.nombre !== true
          ? opts.nombre
          : ""
        : opts.sugerir;
    const s = sugerirNombres(texto);
    const repo = sugerirRepoUrl(s.compacto);
    if (opts.json) {
      console.log(
        JSON.stringify({ texto, sugerencias: s, repo_sugerido: repo }, null, 2),
      );
      process.exit(0);
    }
    // Modo --lista: salida "N|nombre" por linea, para que crear-proyecto.bat
    // pueda mapear un numero (1-4) a su nombre y no tomar el numero literal.
    if (opts.lista) {
      console.log(`1|${s.compacto}`);
      console.log(`2|${s.completo}`);
      console.log(`3|${s.guion_bajo}`);
      console.log(`4|${s.siglas}`);
      process.exit(0);
    }
    console.log(`Opciones de nombre para: "${texto}"`);
    console.log(`  1) sin conectores (recomendado):  ${s.compacto}`);
    console.log(`  2) completo:                       ${s.completo}`);
    console.log(`  3) guion_bajo:                     ${s.guion_bajo}`);
    console.log(`  4) siglas:                         ${s.siglas}`);
    if (repo) console.log(`\n  URL sugerida (mismo grupo que origin): ${repo}`);
    console.log(
      "\nCopia una opcion o escribe tu propio nombre. Se normaliza a slug automaticamente.",
    );
    process.exit(0);
  }

  // El nombre siempre se normaliza a slug valido, venga como venga.
  if (opts.nombre && opts.nombre !== true) opts.nombre = slugify(opts.nombre);

  if (!esRepo()) {
    const err = {
      exit: 2,
      error: "No es un repositorio git. Clona la plantilla primero.",
    };
    console.error(
      opts.json ? JSON.stringify(err, null, 2) : "ERROR: " + err.error,
    );
    process.exit(2);
  }

  if (opts.push && !opts.apply) {
    console.error("ERROR: --push requiere --apply.");
    process.exit(1);
  }

  const { remote, resultados } = ejecutarPasos(opts);
  const fallo = resultados.some((r) => r.estado === "error");

  const salida = {
    exit: fallo ? 1 : 0,
    apply: !!opts.apply,
    nombre: opts.nombre && opts.nombre !== true ? opts.nombre : null,
    repo: opts.repo && opts.repo !== true ? opts.repo : null,
    remote,
    pasos: resultados,
    nota: opts.apply
      ? "Pasos locales ejecutados. Revisa los SIGUIENTES PASOS para la Capa 2 (GitLab)."
      : "DRY-RUN: nada se ejecuto. Repite con --apply (y --push para empujar las ramas).",
  };

  if (opts.json) {
    console.log(JSON.stringify(salida, null, 2));
    process.exit(salida.exit);
  }

  console.log(
    `Crear proyecto: ${salida.nombre || "(sin nombre)"}  (${salida.apply ? "APPLY" : "DRY-RUN"})`,
  );
  if (salida.repo)
    console.log(`Repositorio nuevo: ${salida.repo}  (remoto: ${remote})`);
  console.log("\nPasos:");
  resultados.forEach((p) => {
    const marca =
      p.estado === "ok"
        ? "OK "
        : p.estado === "error"
          ? "ERR"
          : p.estado === "omitido"
            ? "-- "
            : "   ";
    console.log(
      `  [${marca}] ${p.desc}` +
        (p.comando ? `  =>  ${p.comando}` : "") +
        (p.detalle ? `\n         (${p.detalle})` : ""),
    );
  });
  console.log("\n" + salida.nota + "\n");
  console.log(siguientesPasos(remote));
  process.exit(salida.exit);
}

main();
