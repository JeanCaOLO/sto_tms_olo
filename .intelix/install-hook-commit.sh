#!/usr/bin/env bash
# Instalador del hook prepare-commit-msg (Entregable B: ID jerarquico desde la rama).
# Ejecutar una vez por clon: ./install-hook-commit.sh
set -e
cd "$(dirname "$0")"
echo '============================================================'
echo '  Instalar hook prepare-commit-msg - INTELIX (ID desde rama)'
echo '============================================================'
if ! command -v node >/dev/null 2>&1; then
  echo '[ERROR] Node.js no encontrado. Instala Node.js 18+ desde https://nodejs.org'
  exit 1
fi
node scripts/git-flow/install-hook-commit.js
