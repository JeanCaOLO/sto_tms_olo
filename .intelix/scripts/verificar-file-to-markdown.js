#!/usr/bin/env node
/*
 * Verificacion estructural del skill file-to-markdown (template_base).
 *
 * Este script comprueba, SIN instalar el paquete Python, que los artefactos
 * versionados del template esten presentes y bien formados.
 *
 * Diseno ampliable: cada verificacion es un "check" (objeto con name + run()
 * que devuelve { ok, mensaje }). El runner ejecuta todos, imprime un resumen
 * legible con [OK]/[FAIL] y sale con codigo 1 si alguno falla, 0 si todos pasan.
 *
 * La tarea 5.2 agregara nuevos checks al array CHECKS (verificaciones del .bat
 * y del README) sin modificar el runner.
 *
 * Solo usa modulos nativos de Node (fs, path). Sin dependencias externas.
 * Mensajes en espanol, ASCII simple ([OK]/[FAIL]), sin emojis.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Raiz del template (el script vive en scripts/).
const ROOT = path.resolve(__dirname, '..');

// Rutas de artefactos.
const SKILL_DIR = path.join(ROOT, '.kiro', 'skills', 'intelix-file-to-markdown');
const SKILL_MD = path.join(SKILL_DIR, 'SKILL.md');
const BAT_FILE = path.join(ROOT, 'file-to-markdown.bat');

// Las 21 extensiones soportadas (Req 1.2).
const EXTENSIONES = [
  '.pdf', '.docx', '.xlsx', '.csv', '.pptx', '.sql', '.json', '.yaml', '.yml',
  '.xml', '.html', '.htm', '.drawio', '.txt', '.md', '.png', '.jpg', '.jpeg',
  '.gif', '.svg', '.webp',
];

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Elimina el BOM UTF-8 inicial si existe. */
function stripBom(texto) {
  if (texto.charCodeAt(0) === 0xfeff) {
    return texto.slice(1);
  }
  return texto;
}

/** Lee un archivo de texto de forma BOM-safe. Lanza si no existe. */
function leerTexto(rutaAbs) {
  return stripBom(fs.readFileSync(rutaAbs, 'utf8'));
}

function existe(rutaAbs) {
  try {
    fs.accessSync(rutaAbs);
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * Extrae el bloque de front-matter YAML delimitado por --- al inicio.
 * Devuelve el texto interior (sin los delimitadores) o null si no hay.
 */
function extraerFrontMatter(texto) {
  const lineas = texto.split(/\r?\n/);
  // La primera linea no vacia debe ser '---'.
  let i = 0;
  while (i < lineas.length && lineas[i].trim() === '') {
    i++;
  }
  if (i >= lineas.length || lineas[i].trim() !== '---') {
    return null;
  }
  const inicio = i + 1;
  let fin = -1;
  for (let j = inicio; j < lineas.length; j++) {
    if (lineas[j].trim() === '---') {
      fin = j;
      break;
    }
  }
  if (fin === -1) {
    return null;
  }
  return lineas.slice(inicio, fin).join('\n');
}

/**
 * Parseo minimo del front-matter para los campos name y description.
 * Soporta description en formato folded ('>-' / '>' / '|') multilinea:
 * concatena las lineas indentadas siguientes colapsando espacios/saltos a un
 * unico espacio. No usa dependencias externas.
 *
 * Devuelve { name, description } (cadenas; '' si no encontradas).
 */
function parsearFrontMatter(fmTexto) {
  const lineas = fmTexto.split(/\r?\n/);
  const resultado = { name: '', description: '' };

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const m = linea.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!m) {
      continue;
    }
    const clave = m[1];
    let valor = m[2].trim();

    if (clave !== 'name' && clave !== 'description') {
      continue;
    }

    // Formato folded/literal: '>', '>-', '|', '|-', etc.
    if (/^[>|][+-]?\s*$/.test(valor)) {
      const partes = [];
      let j = i + 1;
      for (; j < lineas.length; j++) {
        const siguiente = lineas[j];
        // Fin del bloque: linea no indentada que parece otra clave.
        if (siguiente.length > 0 && !/^\s/.test(siguiente)) {
          break;
        }
        if (siguiente.trim() === '') {
          continue;
        }
        partes.push(siguiente.trim());
      }
      valor = partes.join(' ').replace(/\s+/g, ' ').trim();
      i = j - 1;
    } else {
      // Escalar simple: quitar comillas envolventes si las hay.
      valor = valor.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim();
    }

    resultado[clave] = valor;
  }

  return resultado;
}

// ---------------------------------------------------------------------------
// Checks (SKILL.md) -- Tarea 5.1
// ---------------------------------------------------------------------------

const CHECKS = [
  {
    // Req 1.1, 2.1
    name: 'Existencia de artefactos (SKILL.md y file-to-markdown.bat)',
    run() {
      const faltantes = [];
      if (!existe(SKILL_MD)) {
        faltantes.push('.kiro/skills/intelix-file-to-markdown/SKILL.md');
      }
      if (!existe(BAT_FILE)) {
        faltantes.push('file-to-markdown.bat (raiz)');
      }
      if (faltantes.length > 0) {
        return { ok: false, mensaje: 'Faltan artefactos: ' + faltantes.join(', ') };
      }
      return { ok: true, mensaje: 'SKILL.md y file-to-markdown.bat presentes' };
    },
  },

  {
    // Req 1.1
    name: 'Front-matter YAML del SKILL.md (name y description)',
    run() {
      if (!existe(SKILL_MD)) {
        return { ok: false, mensaje: 'No se encontro SKILL.md' };
      }
      const texto = leerTexto(SKILL_MD);
      const fm = extraerFrontMatter(texto);
      if (fm === null) {
        return { ok: false, mensaje: 'No se encontro front-matter delimitado por --- al inicio' };
      }
      const { name, description } = parsearFrontMatter(fm);

      const problemas = [];
      if (!name) {
        problemas.push('name vacio o ausente');
      } else if (name.length > 60) {
        problemas.push('name excede 60 chars (' + name.length + ')');
      }
      if (!description) {
        problemas.push('description vacio o ausente');
      } else if (description.length > 200) {
        problemas.push('description excede 200 chars (' + description.length + ')');
      }

      if (problemas.length > 0) {
        return { ok: false, mensaje: problemas.join('; ') };
      }
      return {
        ok: true,
        mensaje:
          'name="' + name + '" (' + name.length + ' chars); ' +
          'description (' + description.length + ' chars) dentro de limites',
      };
    },
  },

  {
    // Req 1.2
    name: 'SKILL.md menciona las 21 extensiones soportadas',
    run() {
      if (!existe(SKILL_MD)) {
        return { ok: false, mensaje: 'No se encontro SKILL.md' };
      }
      const texto = leerTexto(SKILL_MD);
      const faltantes = [];
      for (const ext of EXTENSIONES) {
        // Coincidencia como token de extension: precedido por no-alfanumerico
        // y no seguido de otro caracter de "palabra" (evita que .htm capture .html).
        const escapada = ext.replace(/[.]/g, '\\.');
        const re = new RegExp('(^|[^A-Za-z0-9])' + escapada + '(?![A-Za-z0-9])');
        if (!re.test(texto)) {
          faltantes.push(ext);
        }
      }
      const presentes = EXTENSIONES.length - faltantes.length;
      if (faltantes.length > 0) {
        return {
          ok: false,
          mensaje:
            presentes + '/21 extensiones presentes; faltan: ' + faltantes.join(', '),
        };
      }
      return { ok: true, mensaje: 'Las 21 extensiones estan presentes' };
    },
  },

  {
    // Req 1.3, 1.5
    name: 'SKILL.md documenta comando, salida y flags',
    run() {
      if (!existe(SKILL_MD)) {
        return { ok: false, mensaje: 'No se encontro SKILL.md' };
      }
      const texto = leerTexto(SKILL_MD);
      const faltantes = [];

      if (!texto.includes('python -m file_to_markdown')) {
        faltantes.push('python -m file_to_markdown');
      }
      // Acepta 'docs/conversiones/' o 'docs/conversiones'.
      if (!texto.includes('docs/conversiones')) {
        faltantes.push('docs/conversiones/');
      }
      // Flags. -r se busca como token para no confundir con otras -rX.
      if (!/(^|[^A-Za-z0-9-])-r(?![A-Za-z0-9-])/.test(texto)) {
        faltantes.push('-r');
      }
      if (!texto.includes('--check')) {
        faltantes.push('--check');
      }
      if (!texto.includes('--version')) {
        faltantes.push('--version');
      }

      if (faltantes.length > 0) {
        return { ok: false, mensaje: 'No se encontraron: ' + faltantes.join(', ') };
      }
      return {
        ok: true,
        mensaje: 'Comando, salida docs/conversiones/ y flags -r/--check/--version presentes',
      };
    },
  },

  {
    // Req 8.1, 8.2
    name: 'Ausencia de requirements.txt y .venv en el directorio del skill',
    run() {
      const problemas = [];
      const reqTxt = path.join(SKILL_DIR, 'requirements.txt');
      const venvDir = path.join(SKILL_DIR, '.venv');
      if (existe(reqTxt)) {
        problemas.push('existe requirements.txt (Req 8.1)');
      }
      if (existe(venvDir)) {
        problemas.push('existe .venv (Req 8.2)');
      }
      if (problemas.length > 0) {
        return { ok: false, mensaje: problemas.join('; ') };
      }
      return { ok: true, mensaje: 'Sin requirements.txt ni .venv en el directorio del skill' };
    },
  },

  // -------------------------------------------------------------------------
  // Checks (.bat) -- Tarea 5.2
  // -------------------------------------------------------------------------

  {
    // Req 7.2
    name: 'file-to-markdown.bat inicia con BOM UTF-8 (EF BB BF)',
    run() {
      if (!existe(BAT_FILE)) {
        return { ok: false, mensaje: 'No se encontro file-to-markdown.bat' };
      }
      // Leer bytes crudos (Buffer), sin encoding.
      const buffer = fs.readFileSync(BAT_FILE);
      if (buffer.length < 3) {
        return { ok: false, mensaje: 'El archivo es demasiado corto para contener BOM' };
      }
      const b0 = buffer[0];
      const b1 = buffer[1];
      const b2 = buffer[2];
      if (b0 === 0xef && b1 === 0xbb && b2 === 0xbf) {
        return { ok: true, mensaje: 'BOM UTF-8 presente (EF BB BF)' };
      }
      const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
      return {
        ok: false,
        mensaje:
          'Los primeros 3 bytes no son BOM UTF-8. Encontrados: ' +
          hex(b0) + ' ' + hex(b1) + ' ' + hex(b2) + ' (esperado EF BB BF)',
      };
    },
  },

  {
    // Req 7.1
    name: 'file-to-markdown.bat: chcp 65001 es la primera instruccion operativa',
    run() {
      if (!existe(BAT_FILE)) {
        return { ok: false, mensaje: 'No se encontro file-to-markdown.bat' };
      }
      const texto = leerTexto(BAT_FILE);
      const lineas = texto.split(/\r?\n/);

      // La primera linea de comando real (ignorando vacias, comentarios :: y REM,
      // y el @echo off inicial) debe ser chcp 65001.
      let primeraOperativa = null;
      let idxOperativa = -1;
      for (let i = 0; i < lineas.length; i++) {
        const t = lineas[i].trim();
        if (t === '') {
          continue;
        }
        if (t.startsWith('::')) {
          continue;
        }
        if (/^rem(\s|$)/i.test(t)) {
          continue;
        }
        if (/^@?echo\s+off$/i.test(t)) {
          continue;
        }
        primeraOperativa = t;
        idxOperativa = i;
        break;
      }

      if (primeraOperativa === null) {
        return { ok: false, mensaje: 'No se encontro ninguna instruccion operativa' };
      }
      if (!/^chcp\s+65001\b/i.test(primeraOperativa)) {
        return {
          ok: false,
          mensaje:
            'La primera instruccion operativa no es "chcp 65001"; es: "' +
            primeraOperativa + '"',
        };
      }

      // Verificar que este cerca del inicio: antes de setlocal y del menu (:MENU).
      const idxSetlocal = lineas.findIndex((l) => /^\s*setlocal\b/i.test(l));
      const idxMenu = lineas.findIndex((l) => /^\s*:MENU\b/i.test(l));
      if (idxSetlocal !== -1 && idxOperativa > idxSetlocal) {
        return { ok: false, mensaje: 'chcp 65001 aparece despues de setlocal' };
      }
      if (idxMenu !== -1 && idxOperativa > idxMenu) {
        return { ok: false, mensaje: 'chcp 65001 aparece despues de :MENU' };
      }

      return {
        ok: true,
        mensaje: 'chcp 65001 es la primera instruccion operativa (linea ' + (idxOperativa + 1) + ')',
      };
    },
  },

  {
    // Sintaxis .bat: balance goto/call vs etiquetas
    name: 'file-to-markdown.bat: cada goto/call apunta a una etiqueta existente',
    run() {
      if (!existe(BAT_FILE)) {
        return { ok: false, mensaje: 'No se encontro file-to-markdown.bat' };
      }
      const texto = leerTexto(BAT_FILE);
      const lineas = texto.split(/\r?\n/);

      // Etiquetas definidas: linea que empieza (tras espacios) con :label.
      // Se ignoran los comentarios "::" (que no son etiquetas reales).
      const etiquetas = new Set();
      for (const linea of lineas) {
        const m = linea.match(/^\s*:([A-Za-z0-9_]+)\b/);
        if (m) {
          etiquetas.add(m[1].toLowerCase());
        }
      }

      // Referencias: "goto X" y "call :X". goto :eof y exit /b son validos.
      const referencias = [];
      const reGoto = /\bgoto\s+:?([A-Za-z0-9_]+)/gi;
      const reCall = /\bcall\s+:([A-Za-z0-9_]+)/gi;
      for (const linea of lineas) {
        // Ignorar lineas de comentario para no capturar ejemplos en prosa.
        const t = linea.trim();
        if (t.startsWith('::') || /^rem(\s|$)/i.test(t)) {
          continue;
        }
        let mm;
        while ((mm = reGoto.exec(linea)) !== null) {
          referencias.push(mm[1]);
        }
        while ((mm = reCall.exec(linea)) !== null) {
          referencias.push(mm[1]);
        }
      }

      const sinEtiqueta = [];
      for (const ref of referencias) {
        const refLower = ref.toLowerCase();
        // goto :eof / call :eof son validos y no requieren etiqueta.
        if (refLower === 'eof') {
          continue;
        }
        if (!etiquetas.has(refLower)) {
          sinEtiqueta.push(ref);
        }
      }

      if (sinEtiqueta.length > 0) {
        // Unicos para el reporte.
        const unicos = Array.from(new Set(sinEtiqueta));
        return {
          ok: false,
          mensaje: 'Referencias sin etiqueta definida: ' + unicos.join(', '),
        };
      }
      return {
        ok: true,
        mensaje:
          referencias.length + ' referencias goto/call resueltas contra ' +
          etiquetas.size + ' etiquetas',
      };
    },
  },

  {
    // Req 7.4
    name: 'file-to-markdown.bat contiene los marcadores ASCII [OK] [ERROR] [!] [?]',
    run() {
      if (!existe(BAT_FILE)) {
        return { ok: false, mensaje: 'No se encontro file-to-markdown.bat' };
      }
      const texto = leerTexto(BAT_FILE);
      const marcadores = ['[OK]', '[ERROR]', '[!]', '[?]'];
      const faltantes = marcadores.filter((m) => !texto.includes(m));
      if (faltantes.length > 0) {
        return { ok: false, mensaje: 'Faltan marcadores: ' + faltantes.join(' ') };
      }
      return { ok: true, mensaje: 'Marcadores [OK] [ERROR] [!] [?] presentes' };
    },
  },

  {
    // Req 7.3
    name: 'file-to-markdown.bat sin emojis ni mojibake (solo ASCII/BMP basico)',
    run() {
      if (!existe(BAT_FILE)) {
        return { ok: false, mensaje: 'No se encontro file-to-markdown.bat' };
      }
      const texto = leerTexto(BAT_FILE);

      const problemas = [];

      // 1. Caracter de reemplazo Unicode U+FFFD (senal de mojibake/decodificacion).
      if (texto.indexOf('\uFFFD') !== -1) {
        problemas.push('contiene el caracter de reemplazo U+FFFD (mojibake)');
      }

      // 2. Secuencias tipicas de mojibake UTF-8 mal decodificado (ej. "Ã", "Â").
      const mojibake = ['\u00C3', '\u00C2']; // A-tilde, A-circumflex
      for (const ch of mojibake) {
        if (texto.indexOf(ch) !== -1) {
          const cp = ch.codePointAt(0).toString(16).toUpperCase();
          problemas.push('contiene caracter tipico de mojibake U+' + cp);
        }
      }

      // 3. Emojis / astral plane: cualquier code point >= 0x1F000.
      const emojis = new Set();
      for (const ch of texto) {
        const cp = ch.codePointAt(0);
        if (cp >= 0x1f000) {
          emojis.add('U+' + cp.toString(16).toUpperCase());
        }
      }
      if (emojis.size > 0) {
        problemas.push('contiene emojis/simbolos astrales: ' + Array.from(emojis).join(', '));
      }

      if (problemas.length > 0) {
        return { ok: false, mensaje: problemas.join('; ') };
      }
      return { ok: true, mensaje: 'Sin emojis ni caracteres de reemplazo (ASCII/BMP basico)' };
    },
  },

  {
    // Req 2.8
    name: 'file-to-markdown.bat: opcion GUI protegida con guarda if exist',
    run() {
      if (!existe(BAT_FILE)) {
        return { ok: false, mensaje: 'No se encontro file-to-markdown.bat' };
      }
      const texto = leerTexto(BAT_FILE);
      const problemas = [];
      if (!texto.includes('convertir_gui.py')) {
        problemas.push('no se referencia convertir_gui.py');
      }
      if (!/if\s+exist/i.test(texto)) {
        problemas.push('no se encontro guarda "if exist"');
      }
      if (problemas.length > 0) {
        return { ok: false, mensaje: problemas.join('; ') };
      }
      return { ok: true, mensaje: 'convertir_gui.py referenciado con guarda if exist' };
    },
  },

  {
    // Req 2.6, 2.9, 2.10, 2.11
    name: 'file-to-markdown.bat contiene los comandos del menu (salida, -r, --check, pip install)',
    run() {
      if (!existe(BAT_FILE)) {
        return { ok: false, mensaje: 'No se encontro file-to-markdown.bat' };
      }
      const texto = leerTexto(BAT_FILE);
      const faltantes = [];

      // Salida -o docs\conversiones\ o docs/conversiones (Req 2.9, 2.10).
      const tieneSalida =
        /-o\s+docs[\\/]conversiones/i.test(texto) ||
        texto.includes('-o docs\\conversiones') ||
        texto.includes('-o docs/conversiones');
      if (!tieneSalida) {
        faltantes.push('-o docs\\conversiones\\');
      }
      // Flag recursivo -r (como token).
      if (!/(^|[^A-Za-z0-9-])-r(?![A-Za-z0-9-])/.test(texto)) {
        faltantes.push('-r');
      }
      // Verificacion --check (Req 2.11).
      if (!texto.includes('--check')) {
        faltantes.push('--check');
      }
      // Instalacion pip desde GitLab (Req 2.6).
      if (
        !texto.includes(
          'pip install --user git+https://git.intelix.biz/grupomayoreo/file-to-markdown.git'
        )
      ) {
        faltantes.push('pip install --user git+https://git.intelix.biz/grupomayoreo/file-to-markdown.git');
      }

      if (faltantes.length > 0) {
        return { ok: false, mensaje: 'No se encontraron: ' + faltantes.join(', ') };
      }
      return {
        ok: true,
        mensaje: 'Comandos del menu presentes (-o docs\\conversiones\\, -r, --check, pip install GitLab)',
      };
    },
  },

  // -------------------------------------------------------------------------
  // Checks (README.md e install-skills.bat) -- Tarea 5.2
  // -------------------------------------------------------------------------

  {
    // Req 6.1, 6.2, 6.3, 6.4, 6.5
    name: 'README.md documenta el skill file-to-markdown',
    run() {
      const readme = path.join(ROOT, 'README.md');
      if (!existe(readme)) {
        return { ok: false, mensaje: 'No se encontro README.md' };
      }
      const texto = leerTexto(readme);
      const faltantes = [];

      // Ruta del skill (Req 6.1, 6.5).
      if (!texto.includes('.kiro/skills/intelix-file-to-markdown/')) {
        faltantes.push('ruta ".kiro/skills/intelix-file-to-markdown/"');
      }
      // Lanzador .bat (Req 6.1, 6.5).
      if (!texto.includes('file-to-markdown.bat')) {
        faltantes.push('"file-to-markdown.bat"');
      }
      // Seccion numerada / mencion del skill (Req 6.2).
      if (!texto.includes('### 4.') && !texto.includes('file-to-markdown')) {
        faltantes.push('seccion "### 4." o mencion de file-to-markdown');
      }
      // Nota de no-interferencia con install-skills.bat (Req 6.4).
      if (!texto.includes('install-skills.bat')) {
        faltantes.push('nota sobre install-skills.bat');
      }
      // Estructura con docs/conversiones (Req 6.5).
      if (!texto.includes('docs/conversiones')) {
        faltantes.push('docs/conversiones en la estructura');
      }

      if (faltantes.length > 0) {
        return { ok: false, mensaje: 'Faltan menciones: ' + faltantes.join(', ') };
      }
      return {
        ok: true,
        mensaje: 'README menciona ruta del skill, .bat, seccion, install-skills.bat y docs/conversiones',
      };
    },
  },

  {
    // Req 8.3
    name: 'install-skills.bat no lista el skill file-to-markdown',
    run() {
      const installBat = path.join(ROOT, 'install-skills.bat');
      if (!existe(installBat)) {
        return { ok: false, mensaje: 'No se encontro install-skills.bat' };
      }
      const texto = leerTexto(installBat);
      if (texto.includes('file-to-markdown')) {
        return {
          ok: false,
          mensaje:
            'install-skills.bat menciona "file-to-markdown"; no debe listarlo como skill instalable (Req 8.3)',
        };
      }
      return {
        ok: true,
        mensaje: 'install-skills.bat no lista file-to-markdown (no-interferencia OK)',
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function ejecutar() {
  console.log('Verificacion estructural: skill file-to-markdown');
  console.log('Raiz: ' + ROOT);
  console.log('');

  let fallidos = 0;

  for (const check of CHECKS) {
    let resultado;
    try {
      resultado = check.run();
    } catch (e) {
      resultado = { ok: false, mensaje: 'Excepcion: ' + (e && e.message ? e.message : String(e)) };
    }
    const etiqueta = resultado.ok ? '[OK]  ' : '[FAIL]';
    console.log(etiqueta + ' ' + check.name);
    if (resultado.mensaje) {
      console.log('       ' + resultado.mensaje);
    }
    if (!resultado.ok) {
      fallidos++;
    }
  }

  console.log('');
  const total = CHECKS.length;
  const pasados = total - fallidos;
  console.log('Resumen: ' + pasados + '/' + total + ' verificaciones OK');

  if (fallidos > 0) {
    console.log('Resultado: FALLIDO (' + fallidos + ' verificacion(es) con problemas)');
    process.exit(1);
  }
  console.log('Resultado: TODO OK');
  process.exit(0);
}

ejecutar();
