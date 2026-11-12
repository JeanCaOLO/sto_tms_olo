#!/usr/bin/env bash
# ============================================================================
# install-hook-reporte.sh - Instala el hook post-commit del reporte de avance
# El hook regenera el reporte desde el Indice de Progreso AI-DLC en cada commit.
# Fuente:  indice de tracking del layout AI-DLC activo (v1 o v2)
# Salida:  .intelix/outputs/reporte_avance/
# ============================================================================

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo ""
echo "  Instalando hook post-commit de auto-reporte..."
echo ""

if ! command -v node &>/dev/null; then
    echo "[ERROR] Node.js no encontrado. Instala Node.js 18+ desde https://nodejs.org"
    exit 1
fi

node "$ROOT/.intelix/cli/reporte-avance/bin/install-hook.js"
