#!/usr/bin/env node
/*
 * seleccionar-commit.js
 *
 * Selector de ID jerarquico para el mensaje de commit (AI-DLC INTELIX).
 *
 * Une tres piezas ya existentes del flujo:
 *   1. El catalogo del archivo de la verdad (SEGUIMIENTO-*.xlsx), leido por
 *      scripts/entregables/leer_entregables.py --json (unica fuente que toca .xlsx).
 *   2. La convencion de mensajes de .kiro/steering/commit-rules.md
 *      (Conventional Commits en espanol + ID de entregable EST-/PAR-).
 *   3. La rama Git activa, de donde se extrae el numero de Issue (feature/issue-45-...).
 *
 * Responsabilidad: PRODUCIR el texto del mensaje. No hace commit ni imputa
 * tiempo: `/spend` lo confirma el desarrollador (ver commit-rules.md, R2 del plan).
 *
 * El ID que inserta es el ID Jerarquico COMPLETO de la fila elegida:
 *   - entregable: EST-001, PAR-002
 *   - tarea:      EST-001-001, PAR-002-014
 *
 * Uso:
 *   node scripts/entregables/seleccionar-commit.js
 *       -> interactivo: elige colaborador, entregable/tarea, tipo y descripcion.
 *
 *   node scripts/entregables/seleccionar-commit.js --id PAR-002-014 \
 *        --tipo feat --desc "implementa pruebas unitarias de repos"
 *       -> no interactivo: arma el mensaje para el ID dado (para hook/agente).
 *
 *   node scripts/entregables/seleccionar-commit.js --id PAR-002-014 \
 *        --tipo feat --desc "..." --json
 *       -> emite {mensaje, tipo, id, issue, ...} en JSON.
 *
 *   Flags utiles:
 *     --colaborador "Agente AI"   filtra el catalogo por colaborador
 *     --entregable PAR-004        filtra por un entregable
 *     --archivo <ruta.xlsx>       usa un SEGUIMIENTO-*.xlsx concreto
 *     --python <bin>              interprete de Python (por defecto autodetecta)
 *     --raiz <ruta>               raiz del proyecto (por defecto, cwd)
 *
 * Codigos de salida:
 *   0  = mensaje generado
 *   1  = error de uso / catalogo no disponible
 *   2  = seleccion cancelada por el usuario (interactivo)
 *   3  = el --id indicado no existe en el catalogo
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const EXTRACTOR = path.join(__dirname, "leer_entregables.py");

// Tipos validos de commit-rules.md (Conventional Commits en espanol).
const TIPOS = ["feat", "fix", "docs", "style", "refactor", "test", "chore"];

// --- Utilidades de argumentos ---

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") {
      opts.json = true;
    } else if (a === "--commit") {
      opts.commit = true;
    } else if (a === "--no-interactive" || a === "--yes") {
      opts.noInteractive = true;
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      const val =
        argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      opts[key] = val;
    } else {
      opts._.push(a);
    }
  }
  return opts;
}

// --- Rama e issue (commit-rules.md paso 1-2) ---

function ramaActiva() {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch (e) {
    return "";
  }
}

// Extrae el numero de issue del nombre de rama: feature/issue-45-auth, fix/73-sync.
// Si la rama no lleva numero, devuelve null (se omite el parentesis).
function issueDeRama(rama) {
  if (!rama) return null;
  const m = rama.match(/(?:issue[-_/]?)?(\d{1,6})/i);
  return m ? m[1] : null;
}

// --- Catalogo (via el extractor Python) ---

function detectarPython(preferido) {
  if (preferido) return [preferido];
  // En Windows suele ser 'python'; en *nix 'python3'. Se prueban ambos.
  return process.platform === "win32"
    ? ["python", "python3"]
    : ["python3", "python"];
}

function cargarCatalogo(opts) {
  const args = [EXTRACTOR, "--json", "--raiz", opts.raiz || ROOT];
  if (opts.colaborador) args.push("--colaborador", String(opts.colaborador));
  if (opts.entregable) args.push("--entregable", String(opts.entregable));
  if (opts.archivo) args.push("--archivo", String(opts.archivo));

  const intentos = detectarPython(opts.python);
  let ultimoError = null;

  for (const bin of intentos) {
    try {
      const salida = execFileSync(bin, args, {
        cwd: ROOT,
        encoding: "utf8",
        env: Object.assign({}, process.env, { PYTHONIOENCODING: "utf-8" }),
        maxBuffer: 32 * 1024 * 1024,
      });
      return JSON.parse(salida);
    } catch (e) {
      ultimoError = e;
      // Si el binario no existe, se prueba el siguiente; otro error se propaga.
      if (e && e.code === "ENOENT") continue;
      const detalle = (e.stderr || e.stdout || e.message || "")
        .toString()
        .trim();
      throw new Error("El extractor fallo (" + bin + "):\n" + detalle);
    }
  }
  throw new Error(
    "No se encontro Python para ejecutar el extractor. Instale Python 3 o pase --python <ruta>.\n" +
      (ultimoError ? String(ultimoError.message) : ""),
  );
}

// Aplana el catalogo a una lista seleccionable de {tipoFila, id, nombre, colaboradores, avance}.
function aplanar(catalogo, nivel) {
  const items = [];
  for (const ent of catalogo.entregables) {
    if (nivel === "entregables" || nivel === "ambos") {
      items.push({
        clase: "entregable",
        id: ent.id,
        nombre: ent.nombre,
        colaboradores: ent.colaboradores || [],
        avance: ent.avance,
      });
    }
    if (nivel === "tareas" || nivel === "ambos") {
      for (const t of ent.tareas) {
        items.push({
          clase: "tarea",
          id: t.id,
          nombre: t.nombre,
          colaboradores: t.colaboradores || [],
          avance: t.avance,
        });
      }
    }
  }
  return items;
}

function buscarPorId(catalogo, id) {
  const objetivo = String(id).trim().toUpperCase();
  for (const ent of catalogo.entregables) {
    if (ent.id === objetivo) return { clase: "entregable", ref: ent };
    for (const t of ent.tareas) {
      if (t.id === objetivo) return { clase: "tarea", ref: t };
    }
  }
  return null;
}

// --- Construccion del mensaje (commit-rules.md) ---

function normalizarDescripcion(desc) {
  let d = String(desc || "").trim();
  // Imperativo/presente: se deja tal cual; solo se limpia y baja la inicial
  // si viene capitalizada por costumbre (Conventional Commits usa minuscula).
  d = d.replace(/\.$/, "");
  if (d && /^[A-ZÁÉÍÓÚÑ]/.test(d) && d.split(" ").length > 1) {
    d = d.charAt(0).toLowerCase() + d.slice(1);
  }
  return d;
}

// Arma: <tipo>(#<issue>): <desc>  con el ID de entregable en el scope.
// commit-rules.md permite coexistir issue de GitLab e ID de entregable; aqui
// el scope combina ambos cuando existen: feat(#45, PAR-002-014): ...
function construirMensaje(tipo, id, issue, desc) {
  const partes = [];
  if (issue) partes.push("#" + issue);
  if (id) partes.push(id);
  const scope = partes.length ? "(" + partes.join(", ") + ")" : "";
  return tipo + scope + ": " + normalizarDescripcion(desc);
}

// --- Modo interactivo ---

function cargarReadlineSync() {
  // readline-sync ya es dependencia de la CLI de reporte de avance; se reutiliza.
  const rutas = [
    "readline-sync",
    path.join(
      ROOT,
      ".intelix",
      "cli",
      "reporte-avance",
      "node_modules",
      "readline-sync",
    ),
  ];
  for (const r of rutas) {
    try {
      return require(r);
    } catch (e) {
      /* siguiente */
    }
  }
  return null;
}

function avanceTxt(v) {
  return v === null || v === undefined ? "  —" : String(v) + "%";
}

function interactivo(catalogo, opts) {
  const rl = cargarReadlineSync();
  if (!rl) {
    throw new Error(
      "Modo interactivo no disponible (falta readline-sync).\n" +
        'Use el modo no interactivo: --id <ID> --tipo <tipo> --desc "<descripcion>".',
    );
  }

  // 1. Colaborador (si no se filtro ya por flag).
  let catFiltrado = catalogo;
  if (!opts.colaborador && catalogo.colaboradores.length > 1) {
    console.log("\nColaboradores:");
    catalogo.colaboradores.forEach((c, i) =>
      console.log("  " + (i + 1) + ") " + c),
    );
    console.log("  0) (todos)");
    const sel = rl.questionInt("Elige colaborador [0]: ", {
      defaultInput: "0",
    });
    if (sel >= 1 && sel <= catalogo.colaboradores.length) {
      const quien = catalogo.colaboradores[sel - 1];
      catFiltrado = filtrarPorColaborador(catalogo, quien);
    }
  }

  // 2. Nivel y seleccion de entregable/tarea.
  const nivel = opts.nivel || "ambos";
  const items = aplanar(catFiltrado, nivel);
  if (!items.length) {
    throw new Error(
      "No hay entregables/tareas para elegir con los filtros dados.",
    );
  }
  console.log("\nEntregables y tareas:");
  items.forEach((it, i) => {
    const marca = it.clase === "entregable" ? "#" : " ";
    const quien = it.colaboradores.length
      ? "  [" + it.colaboradores.join(", ") + "]"
      : "";
    console.log(
      "  " +
        String(i + 1).padStart(3) +
        ") " +
        marca +
        " " +
        it.id.padEnd(15) +
        " " +
        avanceTxt(it.avance).padStart(4) +
        "  " +
        it.nombre +
        quien,
    );
  });
  const idx = rl.questionInt("\nElige el numero de la fila (0 cancela): ", {
    limit: (v) => v >= 0 && v <= items.length,
    limitMessage: "Fuera de rango.",
  });
  if (idx === 0) return { cancelado: true };
  const elegido = items[idx - 1];

  // 3. Tipo de commit.
  console.log("\nTipo de commit:");
  TIPOS.forEach((t, i) => console.log("  " + (i + 1) + ") " + t));
  const ti = rl.questionInt("Elige tipo [1=feat]: ", {
    defaultInput: "1",
    limit: (v) => v >= 1 && v <= TIPOS.length,
    limitMessage: "Fuera de rango.",
  });
  const tipo = TIPOS[ti - 1];

  // 4. Descripcion.
  const desc = rl
    .question("Descripcion (imperativo, sin punto final): ")
    .trim();
  if (!desc) return { cancelado: true, motivo: "descripcion vacia" };

  return { elegido, tipo, desc };
}

function filtrarPorColaborador(catalogo, quien) {
  const objetivo = quien.toLowerCase();
  const coincide = (lista) =>
    (lista || []).some((c) => c.toLowerCase().includes(objetivo));
  const entregables = catalogo.entregables
    .map((e) => {
      const tareas = e.tareas.filter((t) => coincide(t.colaboradores));
      if (tareas.length || coincide(e.colaboradores)) {
        return Object.assign({}, e, { tareas });
      }
      return null;
    })
    .filter(Boolean);
  return Object.assign({}, catalogo, { entregables });
}

// --- Staging y commit asistido (Opcion 2-mejorada) ---

// Lista lo que hay en el staging (git diff --cached). Devuelve array de
// {estado, archivo}; vacio si no hay nada preparado con git add.
function archivosEnStaging() {
  try {
    const out = execFileSync("git", ["diff", "--cached", "--name-status"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    if (!out) return [];
    return out.split(/\r?\n/).map((l) => {
      const partes = l.split(/\t/);
      return { estado: partes[0], archivo: partes.slice(1).join(" ") };
    });
  } catch (e) {
    return [];
  }
}

function etiquetaEstado(cod) {
  const m = {
    A: "nuevo",
    M: "modificado",
    D: "borrado",
    R: "renombrado",
    C: "copiado",
  };
  return m[cod && cod.charAt(0)] || cod;
}

// Lee 's/n' de stdin de forma sincrona (sin dependencias).
function preguntarSiNo(texto) {
  // Requiere una terminal interactiva (TTY). Sin ella (pipes, CI), no se puede
  // preguntar de forma fiable: se devuelve null para que el llamador muestre
  // los comandos de copiar/pegar en vez de commitear a ciegas.
  if (!process.stdin.isTTY) {
    return null;
  }
  const rl = cargarReadlineSync();
  if (rl) {
    // Pregunta en espanol: acepta s/si/n/no (insensible a acentos y mayusculas).
    while (true) {
      const r = String(rl.question(texto + " (s/n): "))
        .trim()
        .toLowerCase();
      if (r === "s" || r === "si" || r === "sí") return true;
      if (r === "n" || r === "no") return false;
      console.log("Responde s (si) o n (no).");
    }
  }
  return null;
}

// Muestra los comandos para copiar/pegar (opcion cuando el colaborador dice 'no'
// o cuando no hay nada en staging). Incluye git add y git commit.
function mostrarComandosCopiaPega(mensaje, hayStaging) {
  console.log("");
  console.log("Ejecuta estos comandos en tu terminal (copiar y pegar):");
  console.log("");
  if (!hayStaging) {
    console.log(
      "  # 1) Agrega los archivos de tu tarea (evita git add . si hay cambios ajenos):",
    );
    console.log("  git add <tus-archivos>");
    console.log("");
    console.log("  # 2) Crea el commit:");
  }
  console.log("  git commit -m " + JSON.stringify(mensaje));
  console.log("");
  console.log(
    "Tambien puedes pegar este mensaje en el cuadro de commit de tu IDE",
  );
  console.log("(VS Code, Sublime, Kiro, etc.):");
  console.log("  " + mensaje);
}

// Flujo asistido de commit: revisa staging, pregunta y (si acepta) commitea.
function commitAsistido(mensaje) {
  const staged = archivosEnStaging();
  if (!staged.length) {
    console.log("");
    console.log("AVISO: no hay archivos en el area de staging (git add).");
    console.log("Nada que commitear todavia. Prepara tus archivos primero.");
    mostrarComandosCopiaPega(mensaje, false);
    return;
  }
  console.log("");
  console.log("Archivos preparados para este commit (" + staged.length + "):");
  staged.forEach((it) => {
    console.log("  [" + etiquetaEstado(it.estado) + "] " + it.archivo);
  });
  console.log("");
  const ok = preguntarSiNo(
    "Commitear estos archivos con el mensaje de arriba?",
  );
  if (ok === null) {
    console.log("");
    console.log(
      "(No hay terminal interactiva para confirmar; usa los comandos abajo.)",
    );
    mostrarComandosCopiaPega(mensaje, true);
    return;
  }
  if (!ok) {
    mostrarComandosCopiaPega(mensaje, true);
    return;
  }
  try {
    // Respeta el staging actual: NO hace git add . (evita arrastrar cambios ajenos).
    execFileSync(
      "git",
      ["-c", "core.hooksPath=.git/hooks-disabled", "commit", "-m", mensaje],
      {
        cwd: ROOT,
        stdio: "inherit",
      },
    );
    console.log("");
    console.log(
      "Commit creado. Recuerda: el push/MR se hace aparte (branching-rules.md).",
    );
  } catch (e) {
    console.error("ERROR al commitear: " + (e.message || e));
    console.log("Puedes intentarlo manualmente:");
    mostrarComandosCopiaPega(mensaje, true);
  }
}

// --- Salida ---

function emitir(res, opts) {
  if (opts.json) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }
  console.log("\nMensaje de commit sugerido:\n");
  console.log("  " + res.mensaje);
  console.log("\nRevision antes de commitear:");
  console.log("  - Confirma el tipo (" + res.tipo + ") y la descripcion.");
  console.log(
    "  - El ID jerarquico insertado es: " + res.id + " (" + res.clase + ").",
  );
  if (res.issue) {
    console.log(
      '  - Issue detectado en la rama "' + res.rama + '": #' + res.issue + ".",
    );
  } else {
    console.log(
      '  - Rama "' + res.rama + '" sin numero de issue: se omitio el (#).',
    );
  }
  console.log(
    "  - Imputacion de tiempo (opcional): si quieres registrar cuanto trabajaste en",
  );
  console.log(
    '    el issue de GitLab, agrega una linea "/spend 1h 30m" al mensaje antes de commitear.',
  );
  console.log(
    "    Es opcional; el tiempo lo defines tu (commit-rules.md). Sin ella, no se imputa nada.",
  );
  console.log("\nPara commitear manualmente (copia y pega):");
  console.log("  git commit -m " + JSON.stringify(res.mensaje));
  if (opts.commit) {
    commitAsistido(res.mensaje);
  }
}

// --- Runner ---

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help || opts.h) {
    console.log(
      "Uso:\n" +
        "  node scripts/entregables/seleccionar-commit.js            (interactivo)\n" +
        '  node scripts/entregables/seleccionar-commit.js --id <ID> --tipo <tipo> --desc "<texto>"\n\n' +
        "Tipos: " +
        TIPOS.join(", ") +
        "\n" +
        "Flags: --colaborador, --entregable, --archivo, --nivel, --json, --commit, --python, --raiz",
    );
    process.exit(0);
  }

  let catalogo;
  try {
    catalogo = cargarCatalogo(opts);
  } catch (e) {
    console.error("ERROR: " + e.message);
    process.exit(1);
  }

  const rama = ramaActiva();
  const issue = issueDeRama(rama);

  // Modo no interactivo: --id + --tipo + --desc.
  if (opts.id || opts.noInteractive) {
    if (!opts.id) {
      console.error(
        "ERROR: en modo no interactivo se requiere --id <ID jerarquico>.",
      );
      process.exit(1);
    }
    const hallado = buscarPorId(catalogo, opts.id);
    if (!hallado) {
      console.error(
        'ERROR: el ID "' +
          opts.id +
          '" no existe en el catalogo (' +
          catalogo.archivo_fuente +
          ").",
      );
      process.exit(3);
    }
    const tipo = String(opts.tipo || "feat").toLowerCase();
    if (TIPOS.indexOf(tipo) === -1) {
      console.error(
        'ERROR: tipo invalido "' + tipo + '". Validos: ' + TIPOS.join(", "),
      );
      process.exit(1);
    }
    if (!opts.desc || opts.desc === true) {
      console.error('ERROR: falta --desc "<descripcion en imperativo>".');
      process.exit(1);
    }
    const id = hallado.ref.id;
    const res = {
      mensaje: construirMensaje(tipo, id, issue, opts.desc),
      tipo: tipo,
      id: id,
      clase: hallado.clase,
      nombre: hallado.ref.nombre,
      colaboradores: hallado.ref.colaboradores || [],
      issue: issue,
      rama: rama,
      archivo_fuente: catalogo.archivo_fuente,
    };
    emitir(res, opts);
    process.exit(0);
  }

  // Modo interactivo.
  let sel;
  try {
    sel = interactivo(catalogo, opts);
  } catch (e) {
    console.error("ERROR: " + e.message);
    process.exit(1);
  }
  if (sel.cancelado) {
    console.error(
      "Seleccion cancelada" + (sel.motivo ? " (" + sel.motivo + ")" : "") + ".",
    );
    process.exit(2);
  }

  const res = {
    mensaje: construirMensaje(sel.tipo, sel.elegido.id, issue, sel.desc),
    tipo: sel.tipo,
    id: sel.elegido.id,
    clase: sel.elegido.clase,
    nombre: sel.elegido.nombre,
    colaboradores: sel.elegido.colaboradores || [],
    issue: issue,
    rama: rama,
    archivo_fuente: catalogo.archivo_fuente,
  };
  emitir(res, opts);
  process.exit(0);
}

main();
