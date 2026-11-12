/**
 * Resuelve la raíz del proyecto de forma robusta, sin depender de cuántos
 * niveles de carpeta separan a este archivo de la raíz.
 *
 * Sube directorios desde __dirname buscando un marcador de raíz
 * (`.git`, `aidlc-docs` o `.intelix`). Si no encuentra ninguno, cae a un
 * número fijo de niveles como último recurso.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MARKERS = ['.git', 'aidlc-docs', '.intelix'];

function resolveProjectRoot(startDir) {
  let dir = startDir || __dirname;
  const { root } = path.parse(dir);

  while (true) {
    for (const marker of MARKERS) {
      if (fs.existsSync(path.join(dir, marker))) {
        return dir;
      }
    }
    if (dir === root) break;
    dir = path.dirname(dir);
  }

  // Último recurso: asumir 3 niveles arriba de lib/ (cli/reporte-avance/lib -> raíz).
  return path.resolve(__dirname, '..', '..', '..', '..');
}

module.exports = { resolveProjectRoot, PROJECT_ROOT: resolveProjectRoot() };
