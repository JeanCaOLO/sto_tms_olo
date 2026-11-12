#!/usr/bin/env bash
# ============================================================================
# generar-reporte.sh - Reporte de avance desde el Indice de Progreso AI-DLC
# Fuente:  indice de tracking del layout AI-DLC activo (v1 o v2)
# Salida:  .intelix/outputs/reporte_avance/  (MD + HTML)
# CLI:     .intelix/cli/reporte-avance/
# ============================================================================

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo ""
echo "================================================================"
echo "   Generador de Reporte de Avance - INTELIX"
echo "   Fuente: indice de tracking del layout AI-DLC activo (v1 o v2)"
echo "   Salida: .intelix/outputs/reporte_avance/"
echo "================================================================"
echo ""

# Verificar Node.js
if ! command -v node &>/dev/null; then
    echo "[ERROR] Node.js no encontrado. Instala Node.js 18+ desde https://nodejs.org"
    exit 1
fi

# Ejecutar el generador
node "$ROOT/.intelix/cli/reporte-avance/bin/generar-reporte.js"
